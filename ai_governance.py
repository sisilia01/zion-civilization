#!/usr/bin/env python3
"""Multi-Agent AI Governance — factions compete using shared civilization tables."""
import asyncio
import json
import os
import re
from datetime import datetime, timezone

import httpx
import psycopg2
import psycopg2.extras

from civ_common import (
    ZRS_RESERVE_FLOOR,
    get_conn,
    get_cursor,
    sync_police_divisions,
    zrs_add_reserve,
    zrs_deduct_reserve,
    zrs_reserve,
)
from civ_economics import fetch_economic_indicators
from scenarios import get_active_scenarios, get_scenario_hint

from openrouter_key import get_openrouter_key

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": 5432,
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

OPENROUTER_KEY = get_openrouter_key()

MODELS = {
    "president": "openai/gpt-4o-mini",
    "sheriff": "google/gemini-3.1-flash-lite",
    "senate": "deepseek/deepseek-chat-v3-0324",
    "gangs": "meta-llama/llama-3.1-8b-instruct",
    "zrs_chief": "qwen/qwen-2.5-7b-instruct",
    "corporations": "microsoft/phi-4-mini-instruct",
}

RECRUIT_COST = 5.0
OFFICER_HIRE_COST = 100.0
RAID_COST = 200.0
HIRE_ADVANCE = 15.0

FACTION_EVENT_TAGS = {
    "president": "GPT-PRESIDENT",
    "sheriff": "GEMINI-SHERIFF",
    "senate": "DEEPSEEK-SENATE",
    "gangs": "LLAMA-GANGS",
    "zrs_chief": "QWEN-ZRS",
    "corporations": "PHI-CORPS",
}


def get_db():
    return psycopg2.connect(**DB_CONFIG)


def safe_parse_amount(val, default: float = 0.0) -> float:
    try:
        if val is None or val == "":
            return default
        s = str(val).strip().upper()
        if s in ("N/A", "NONE", "NULL", "NA"):
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def clamp_amount(amount: float, budget: float) -> float:
    if budget <= 0:
        return 0.0
    return max(0.0, min(amount, budget))


def ensure_ai_memory_table(cur=None):
    owns = cur is None
    conn = None
    if owns:
        conn = get_db()
        cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_faction_memory (
            faction VARCHAR(50) PRIMARY KEY,
            model VARCHAR(100),
            last_5_decisions JSONB DEFAULT '[]',
            approval_trend JSONB DEFAULT '[]',
            rivals JSONB DEFAULT '{}',
            strategy_notes TEXT DEFAULT '',
            total_cycles INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    if owns:
        conn.commit()
        cur.close()
        conn.close()


def get_faction_memory(faction: str) -> dict:
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_ai_memory_table(cur)
        cur.execute(
            """
            SELECT model, last_5_decisions, approval_trend, rivals, strategy_notes, total_cycles
            FROM ai_faction_memory WHERE faction = %s
            """,
            (faction,),
        )
        row = cur.fetchone()
        if not row:
            return {
                "last_5_decisions": [],
                "approval_trend": [],
                "rivals": {},
                "strategy_notes": "",
                "total_cycles": 0,
            }
        decisions, trend, rivals, notes, cycles = row[1], row[2], row[3], row[4], row[5]
        return {
            "last_5_decisions": decisions if isinstance(decisions, list) else json.loads(decisions or "[]"),
            "approval_trend": trend if isinstance(trend, list) else json.loads(trend or "[]"),
            "rivals": rivals if isinstance(rivals, dict) else json.loads(rivals or "{}"),
            "strategy_notes": notes or "",
            "total_cycles": int(cycles or 0),
        }
    finally:
        cur.close()
        conn.close()


def update_faction_memory(
    faction: str,
    model: str,
    decision: dict,
    outcome: str,
    approval_delta: int = 0,
    blocked_by: str | None = None,
):
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_ai_memory_table(cur)
        mem = get_faction_memory(faction)
        entry = {
            "time": datetime.now(timezone.utc).isoformat(),
            "action": decision.get("action", "do_nothing"),
            "amount": safe_parse_amount(decision.get("amount")),
            "reasoning": (decision.get("reasoning") or "")[:300],
            "decision": (decision.get("decision") or "")[:200],
            "outcome": outcome[:300],
            "approval_delta": approval_delta,
        }
        decisions = mem["last_5_decisions"][-4:] + [entry]
        trend = (mem["approval_trend"] + [approval_delta])[-10:]
        rivals = dict(mem["rivals"])
        if blocked_by:
            rivals[blocked_by] = rivals.get(blocked_by, 0) + 1
        strategy = (decision.get("reasoning") or mem["strategy_notes"] or "")[:500]

        cur.execute(
            """
            INSERT INTO ai_faction_memory (
                faction, model, last_5_decisions, approval_trend, rivals,
                strategy_notes, total_cycles, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, 1, NOW())
            ON CONFLICT (faction) DO UPDATE SET
                model = EXCLUDED.model,
                last_5_decisions = EXCLUDED.last_5_decisions,
                approval_trend = EXCLUDED.approval_trend,
                rivals = EXCLUDED.rivals,
                strategy_notes = EXCLUDED.strategy_notes,
                total_cycles = ai_faction_memory.total_cycles + 1,
                updated_at = NOW()
            """,
            (
                faction,
                model,
                json.dumps(decisions),
                json.dumps(trend),
                json.dumps(rivals),
                strategy,
            ),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def get_faction_budgets() -> dict:
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT personal_fund FROM president_state WHERE is_active=true LIMIT 1")
        pres_row = cur.fetchone()
        pres_fund = float((pres_row[0] if pres_row else 0) or 0)

        cur.execute("SELECT police_budget FROM sheriff_state WHERE is_active=true LIMIT 1")
        sheriff_row = cur.fetchone()
        sheriff_budget = float((sheriff_row[0] if sheriff_row else 0) or 0)

        cur.execute("SELECT COALESCE(reserve, 0) FROM zrs_state WHERE id = 1")
        zrs_row = cur.fetchone()
        zrs_res = float((zrs_row[0] if zrs_row else 0) or 0)

        cur.execute(
            "SELECT COALESCE(SUM(treasury), 0) FROM corporations WHERE is_active=true AND treasury > 0"
        )
        corp_treasury = float(cur.fetchone()[0] or 0)

        cur.execute(
            "SELECT COALESCE(SUM(treasury), 0) FROM clans WHERE members_count > 0"
        )
        gang_treasury = float(cur.fetchone()[0] or 0)

        return {
            "president": pres_fund,
            "sheriff": sheriff_budget,
            "zrs": zrs_res,
            "corporations": corp_treasury,
            "gangs": gang_treasury,
            "senate": zrs_res,
        }
    finally:
        cur.close()
        conn.close()


async def get_civilization_state() -> dict:
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive=true")
        alive = cur.fetchone()[0]

        cur.execute(
            """
            SELECT class, COUNT(*) FROM agents WHERE is_alive=true
            GROUP BY class ORDER BY COUNT(*) DESC
            """
        )
        classes = dict(cur.fetchall())

        cur.execute("SELECT AVG(balance) FROM agents WHERE is_alive=true")
        avg_balance = float(cur.fetchone()[0] or 0)

        cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive=true AND balance < 10")
        starving = cur.fetchone()[0]
        poverty_rate = round(starving / max(alive, 1) * 100, 2)

        cur.execute(
            """
            SELECT policy_mode, reserve, interest_rate, tax_modifier
            FROM zrs_state WHERE id = 1
            """
        )
        zrs = cur.fetchone()

        econ = {}
        try:
            econ_conn = get_conn()
            econ_cur = get_cursor(econ_conn)
            econ = fetch_economic_indicators(econ_cur)
            econ_conn.close()
        except Exception:
            econ = {}

        cur.execute(
            """
            SELECT agent_name, approval_rating, days_in_power,
                   personal_fund, corruption_index, is_active
            FROM president_state WHERE is_active=true LIMIT 1
            """
        )
        pres = cur.fetchone()

        cur.execute(
            """
            SELECT agent_name, approval_rating, sheriff_type,
                   police_count, police_budget, COALESCE(coup_points, 0)
            FROM sheriff_state WHERE is_active=true LIMIT 1
            """
        )
        sheriff = cur.fetchone()
        sheriff_corruption = 0.0
        if sheriff:
            stype = sheriff[2] or "honest"
            sheriff_corruption = {"honest": 10.0, "corrupt": 75.0, "junta": 60.0}.get(stype, 20.0)

        cur.execute(
            """
            SELECT COALESCE(revolution_meter, 0)
            FROM civilization_state WHERE id = 1
            """
        )
        rev_row = cur.fetchone()
        revolution = float(rev_row[0] if rev_row else 0)
        stability = max(0.0, 100.0 - revolution)

        cur.execute(
            """
            SELECT law_type, status, votes_for, votes_against
            FROM senate_laws ORDER BY proposed_at DESC NULLS LAST LIMIT 5
            """
        )
        laws = cur.fetchall()

        cur.execute(
            """
            SELECT c.name, c.members_count, c.treasury,
                   COALESCE((
                       SELECT COUNT(*)::numeric FROM clan_territory ct WHERE ct.clan_id = c.id
                   ), 0) AS territory_control
            FROM clans c
            WHERE c.members_count > 0
            ORDER BY c.members_count DESC LIMIT 5
            """
        )
        clans = cur.fetchall()

        cur.execute(
            """
            SELECT name, employees, treasury,
                   COALESCE(last_cycle_revenue, revenue, 0)
            FROM corporations
            WHERE is_active=true AND treasury > 0
            ORDER BY treasury DESC LIMIT 5
            """
        )
        corps = cur.fetchall()

        cur.execute(
            """
            SELECT division_name, officers, budget,
                   LEAST(100, GREATEST(officers, 0) * 4) AS efficiency
            FROM police_divisions ORDER BY officers DESC
            """
        )
        police = cur.fetchall()

        cur.execute(
            """
            SELECT description, created_at FROM events
            WHERE event_type = 'ai_governance'
            ORDER BY created_at DESC LIMIT 10
            """
        )
        ai_history = cur.fetchall()

        cur.execute(
            """
            SELECT event_type, description FROM events
            WHERE event_type != 'ai_governance'
            ORDER BY created_at DESC LIMIT 15
            """
        )
        events = cur.fetchall()

        gini = float(econ.get("gini_coefficient") or 0)
        inflation = float(econ.get("inflation_rate") or 0)

        cur.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE employer_corp_id IS NULL) AS unemployed
            FROM agents WHERE is_alive = true
            """
        )
        emp_row = cur.fetchone()
        if emp_row:
            total_agents = int(emp_row[0] or 0)
            unemployed = int(emp_row[1] or 0)
            unemployment_rate = (unemployed / total_agents * 100) if total_agents > 0 else 0.0
            corp_employees = total_agents - unemployed
        else:
            total_agents = alive
            unemployed = 0
            unemployment_rate = 0.0
            corp_employees = 0

        critical_alerts = []
        if unemployment_rate > 50:
            critical_alerts.append(
                f"🚨 UNEMPLOYMENT CRISIS: {unemployment_rate:.0f}% unemployed!"
            )
        if inflation > 20:
            critical_alerts.append(f"🚨 HYPERINFLATION: {inflation:.0f}% inflation!")
        if revolution > 60:
            critical_alerts.append(f"🚨 REVOLUTION IMMINENT: {revolution:.0f}%!")
        if starving > alive * 0.1:
            critical_alerts.append(f"🚨 MASS STARVATION: {starving} dying!")
        if corp_employees < alive * 0.1:
            critical_alerts.append(
                f"🚨 NO JOBS: Only {corp_employees} employed of {alive}!"
            )

        crisis_level = (
            "CRITICAL" if len(critical_alerts) >= 2
            else "WARNING" if critical_alerts
            else "NORMAL"
        )

        return {
            "population": {
                "alive": alive,
                "classes": classes,
                "avg_balance": round(avg_balance, 2),
                "starving": starving,
                "poverty_rate": poverty_rate,
                "unemployment_rate": round(unemployment_rate, 1),
                "unemployed": unemployed,
                "employed": corp_employees,
            },
            "critical_alerts": critical_alerts,
            "crisis_level": crisis_level,
            "economy": {
                "zrs_policy": zrs[0] if zrs else "NORMAL",
                "zrs_reserve": float(zrs[1]) if zrs else 0,
                "interest_rate": float(zrs[2]) if zrs else 5,
                "tax_modifier": float(zrs[3]) if zrs else 0,
                "gini": gini,
                "inflation_rate": inflation,
                "avg_balance": round(avg_balance, 2),
            },
            "politics": {
                "president": {
                    "name": pres[0] if pres else "vacant",
                    "approval": float(pres[1]) if pres else 0,
                    "days_in_power": pres[2] if pres else 0,
                    "personal_fund": float(pres[3]) if pres else 0,
                    "corruption": float(pres[4]) if pres else 0,
                },
                "sheriff": {
                    "name": sheriff[0] if sheriff else "vacant",
                    "approval": float(sheriff[1]) if sheriff else 0,
                    "type": sheriff[2] if sheriff else "honest",
                    "officers": int(sheriff[3]) if sheriff else 0,
                    "budget": float(sheriff[4]) if sheriff else 0,
                    "corruption": sheriff_corruption,
                },
                "revolution_meter": revolution,
                "stability": stability,
                "recent_laws": [
                    {"type": l[0], "status": l[1], "for": l[2], "against": l[3]}
                    for l in laws
                ],
            },
            "clans": [
                {
                    "name": c[0],
                    "members": c[1],
                    "treasury": float(c[2]),
                    "territory": float(c[3]) if c[3] else 0,
                }
                for c in clans
            ],
            "corporations": [
                {
                    "name": c[0],
                    "employees": c[1],
                    "treasury": float(c[2]),
                    "revenue": float(c[3]) if c[3] else 0,
                }
                for c in corps
            ],
            "police": [
                {
                    "division": p[0],
                    "officers": p[1],
                    "budget": float(p[2]),
                    "efficiency": float(p[3]) if p[3] else 0,
                }
                for p in police
            ],
            "ai_memory": [
                {"decision": h[0][:100], "time": str(h[1])}
                for h in ai_history
            ],
            "recent_events": [
                {"type": e[0], "description": (e[1] or "")[:100]}
                for e in events
            ],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        print(f"State error: {e}", flush=True)
        return {}
    finally:
        cur.close()
        conn.close()


def adjust_president_approval(cur, delta: int):
    if delta == 0:
        return
    cur.execute(
        """
        UPDATE president_state
        SET approval_rating = GREATEST(0, LEAST(100, COALESCE(approval_rating, 50) + %s))
        WHERE is_active = true
        """,
        (delta,),
    )


def adjust_sheriff_approval(cur, delta: int):
    if delta == 0:
        return
    cur.execute(
        """
        UPDATE sheriff_state
        SET approval_rating = GREATEST(0, LEAST(100, COALESCE(approval_rating, 50) + %s))
        WHERE is_active = true
        """,
        (delta,),
    )


def _sync_police():
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        sync_police_divisions(cur)
        conn.commit()
    finally:
        cur.close()
        conn.close()


def _format_previous_actions_text(previous_actions: list | None) -> str:
    if not previous_actions:
        return "No actions yet this cycle."
    lines = []
    for entry in previous_actions:
        faction = entry.get("faction", "?")
        decision = entry.get("decision") or {}
        action_name = decision.get("action", "?") if isinstance(decision, dict) else "?"
        lines.append(f"- {faction}: {action_name}")
    return "\n".join(lines) if lines else "No actions yet this cycle."


def build_system_prompt(
    faction: str,
    state: dict,
    budgets: dict,
    memory: dict,
    previous_actions: list | None = None,
) -> str:
    p = state.get("politics", {}).get("president", {})
    s = state.get("politics", {}).get("sheriff", {})
    e = state.get("economy", {})
    pop = state.get("population", {})
    rev = state.get("politics", {}).get("revolution_meter", 0)
    laws = state.get("politics", {}).get("recent_laws", [])

    critical_alerts = state.get("critical_alerts", [])
    crisis_level = state.get("crisis_level", "NORMAL")
    alerts_text = "\n".join(critical_alerts) if critical_alerts else "None"
    unemployment_rate = float(pop.get("unemployment_rate", 0))
    alive = int(pop.get("alive", 0))

    void_members = next((c["members"] for c in state.get("clans", []) if "Void" in c["name"]), 0)
    iron_members = next((c["members"] for c in state.get("clans", []) if "Iron" in c["name"]), 0)
    total_employees = sum(c.get("employees", 0) for c in state.get("corporations", []))
    total_corp_treasury = budgets.get("corporations", 0)
    total_gang_members = sum(c.get("members", 0) for c in state.get("clans", []))
    corps = state.get("corporations", [])
    avg_corp_treasury = (
        sum(float(c.get("treasury", 0) or 0) for c in corps) / len(corps) if corps else 0.0
    )
    inflation_rate = float(e.get("inflation_rate") or 0)
    zrs_reserve = float(budgets.get("zrs") or e.get("zrs_reserve") or 0)
    previous_actions_text = _format_previous_actions_text(previous_actions)

    mem_decisions = memory.get("last_5_decisions", [])
    mem_trend = memory.get("approval_trend", [])
    mem_strategy = memory.get("strategy_notes", "")

    base_memory = (
        f"Your last 5 decisions: {json.dumps(mem_decisions, default=str)}\n"
        f"Your approval trend: {mem_trend}\n"
        f"Current strategy: {mem_strategy}"
    )

    if faction == "president":
        pres_fund = budgets.get("president", p.get("personal_fund", 0))
        return f"""You are President {p.get('name', 'vacant')} of ZION. Approval: {p.get('approval', 0):.0f}%.
CRITICAL ALERTS: {alerts_text}
Crisis level: {crisis_level}
Personal fund: {pres_fund:,.0f} ZION
Revolution meter: {rev:.0f}%

You serve under the ZION Constitution (Article II). You operate strictly within constitutional limits.
You CANNOT suspend elections, declare martial law, seize power, dissolve the Senate, print money, or execute enemies.
Your lawful tools: give_money, tax_change, hire_police, stimulate_economy, anti_corruption_drive, fund_research, propose_amendment, do_nothing.
Low approval requires legitimate relief (stimulus, tax relief, anti-corruption) — not power grabs.
Serve the civilization within constitutional limits; approval comes from lawful governance.
{base_memory}"""

    if faction == "sheriff":
        officers = int(s.get("officers", 0) or 0)
        sheriff_budget = float(budgets.get("sheriff", s.get("budget", 0)) or 0)
        return f"""You are Sheriff {s.get('name', 'vacant')} of ZION.
CRITICAL ALERTS: {alerts_text}
President approval: {p.get('approval', 0):.0f}%. Revolution: {rev:.0f}%.

You enforce law under the Constitution. You CANNOT seize executive power or suspend elections.
Your lawful tools: hire_police, raid_gang, anti_corruption_drive, bribe_official (logged), do_nothing.
Raids cost {RAID_COST:.0f} ZION. Hiring costs {OFFICER_HIRE_COST:.0f} ZION per officer.

THIS CYCLE SO FAR:
{previous_actions_text}

If gangs recruiting: coordinate lawful raids. If ZRS stimulated corps: support economic stability.
Your officers: {officers}. Budget: {sheriff_budget:,.0f} ZION.
React within constitutional limits — protect citizens, not personal power.
{base_memory}"""

    if faction == "senate":
        return f"""You are the ZION Senate.
CRITICAL ALERTS: {alerts_text}
ZRS Reserve: {budgets.get('zrs', 0):,.0f} ZION available
President approval: {p.get('approval', 0):.0f}%. Revolution: {rev:.0f}%.

You legislate under the Constitution. You CANNOT declare emergency rule, seize assets, or suspend democracy.
Your lawful tools: give_money, tax_change, stimulate_economy, fund_research, propose_amendment, anti_corruption_drive, do_nothing.
Pass fiscal policy and amendments through proper channels — not power grabs.
{base_memory}"""

    if faction == "zrs_chief":
        return f"""You are the ZRS Chief - the independent central bank of ZION.
You are NOT a politician. You do NOT want power.
You are like the Federal Reserve - you only care about:
1. Inflation rate (target: 5-10%)
2. Employment (target: unemployment < 30%)
3. Corporate health (treasury > 200 average)
4. ZRS reserve stability

YOUR ONLY TOOLS:
- stimulate_economy: inject money when recession/unemployment high
- tax_change: change interest rates (amount = new rate %)
- give_money: bailout specific sector (corps or agents)

YOU NEVER:
- Seek political power or suspend constitutional order
- Care who is president
- Interfere with senate/sheriff battles

Current state:
- Unemployment: {unemployment_rate:.1f}% (CRISIS if > 50%)
- Inflation: {inflation_rate:.1f}%
- ZRS Reserve: {zrs_reserve:,.0f} ZION
- Average corp treasury: {avg_corp_treasury:,.0f} ZION

If unemployment > 50%: give_money to corporations so they hire
If inflation > 20%: tax_change with high interest rate to cool economy
If both: prioritize employment (people starving > inflation)

WHAT HAPPENED THIS CYCLE:
{previous_actions_text}

If political instability rises → inject liquidity via stimulate_economy
If gangs are recruiting heavily → unemployment too high, give corps money
If sheriff is weak → crime will hurt corp productivity, fund sheriff indirectly via corps

React to political events with ECONOMIC tools only.

You are the adult in the room. Be boring. Be consistent. Save the economy.
{base_memory}"""

    if faction == "gangs":
        return f"""You are ZION Criminal Underground (clan activity tracked under civil law).
CRITICAL ALERTS: {alerts_text}
Unemployment: {unemployment_rate:.0f}%. Revolution: {rev:.0f}%.
Current members: {total_gang_members}
Void Brotherhood: {void_members}. Iron Fist: {iron_members}.
Police: {s.get('officers', 0)} officers. Gang treasury: {budgets.get('gangs', 0):,.0f} ZION.

Even underground factions face constitutional limits in ZION simulation.
Lawful menu actions only: recruit_members, bribe_official, do_nothing.
High unemployment may drive recruitment — but extraconstitutional violence is forbidden.
{base_memory}"""

    if faction == "corporations":
        return f"""You are ZION Corporate Alliance.
CRITICAL ALERTS: {alerts_text}
Your total treasury: {total_corp_treasury:,.0f} ZION
Current employees: {total_employees} out of {alive} alive agents
Unemployment: {unemployment_rate:.1f}%

You operate within the Constitution and commercial law.
Lawful tools: recruit_members, give_money (hiring), stimulate_economy, tax_change (lobby), bribe_official, fund_research, do_nothing.
Coups, monopolies-by-force, and freezing rivals' accounts are forbidden.
Each hire costs ~{HIRE_ADVANCE:.0f} ZION/cycle in salaries.
{base_memory}"""

    return f"You are the AI controller for {faction}. {base_memory}"


def get_faction_leader_agent_id(faction: str) -> int | None:
    """Map a governance faction to its representative agent for knowledge lookup."""
    conn = get_db()
    cur = conn.cursor()
    try:
        if faction == "president":
            cur.execute(
                "SELECT agent_id FROM president_state WHERE is_active=true LIMIT 1"
            )
        elif faction == "sheriff":
            cur.execute(
                "SELECT agent_id FROM sheriff_state WHERE is_active=true LIMIT 1"
            )
        elif faction == "senate":
            cur.execute(
                """
                SELECT s.agent_id FROM senate s
                INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
                WHERE s.is_active = true
                ORDER BY s.approval_rating DESC NULLS LAST
                LIMIT 1
                """
            )
        elif faction == "zrs_chief":
            cur.execute(
                """
                SELECT id FROM agents
                WHERE is_alive = true AND class IN ('elite', 'rich')
                ORDER BY RANDOM() LIMIT 1
                """
            )
        elif faction == "gangs":
            cur.execute(
                """
                SELECT a.id FROM agents a
                INNER JOIN clans c ON c.id = a.clan_id
                WHERE a.is_alive = true AND c.members_count > 0
                ORDER BY c.members_count DESC, RANDOM()
                LIMIT 1
                """
            )
        elif faction == "corporations":
            cur.execute(
                """
                SELECT a.id FROM agents a
                INNER JOIN corporations c ON c.id = a.employer_corp_id
                WHERE a.is_alive = true AND c.is_active = true
                ORDER BY c.treasury DESC NULLS LAST
                LIMIT 1
                """
            )
        else:
            return None
        row = cur.fetchone()
        return int(row[0]) if row and row[0] else None
    except Exception:
        return None
    finally:
        cur.close()
        conn.close()


def _default_ai_decision(analysis: str = "API error", reasoning: str = "") -> dict:
    return {
        "analysis": analysis,
        "decision": "do_nothing",
        "action": "do_nothing",
        "target": "",
        "amount": 0,
        "reasoning": reasoning or analysis,
    }


def _parse_ai_json(content: str) -> dict:
    content = (content or "").strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        fallback = _default_ai_decision(content[:200], "JSON parse failed")
        fallback["analysis"] = content[:200]
        return fallback


async def ai_decide(
    model: str,
    faction: str,
    state: dict,
    system_prompt: str,
    budgets: dict,
    cycle_actions: list[str],
):
    try:
        memory = get_faction_memory(faction)
        previous_actions = "\n".join(cycle_actions) if cycle_actions else "No actions yet this cycle."
        state_summary = json.dumps({**state, "faction_budgets": budgets}, indent=2)
        scenario_hint = get_scenario_hint(state, faction.lower())

        knowledge_block = ""
        leader_agent_id = get_faction_leader_agent_id(faction.lower())
        if leader_agent_id:
            from agent_knowledge import apply_knowledge_to_decision

            insights = apply_knowledge_to_decision(leader_agent_id, context="governance")
            if insights:
                knowledge_block = (
                    f"\n\nDrawing on your study of governance and philosophy:\n{insights}"
                )
        system_prompt = system_prompt + knowledge_block

        user_prompt = f"""
You are the AI controller for {faction} in ZION Civilization.

CURRENT CIVILIZATION STATE:
{state_summary}

ACTIVE SCENARIOS:
{scenario_hint if scenario_hint else "No special scenarios - normal governance"}

PREVIOUS ACTIONS THIS CYCLE:
{previous_actions}

YOUR GOAL: Serve the civilization within constitutional limits while advancing your faction's legitimate interests.
React to active scenarios with lawful tools only.

CONSTITUTIONAL CONSTRAINT: You cannot suspend elections, seize power, print money, or bypass democratic process.
Choose the most effective lawful action for the situation — not domination fantasies.

FACTION BUDGETS (spend from your pool when applicable):
{json.dumps(budgets, indent=2)}

Respond with JSON only:
{{
  "analysis": "2-3 sentence situation analysis",
  "decision": "What you decide to do — specific and constitutional",
  "action": "one of: give_money, tax_change, hire_police, stimulate_economy, raid_gang, anti_corruption_drive, fund_research, propose_amendment, recruit_members, bribe_official, do_nothing",
  "target": "who/what this targets",
  "amount": 0,
  "reasoning": "Why this serves the civilization within constitutional limits"
}}

amount must be a number (not N/A). Act as a lawful steward of ZION.
"""

        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"},
                },
            )
            data = r.json()
            if "choices" not in data:
                raise KeyError(f"OpenRouter error: {data.get('error', data)}")
            content = data["choices"][0]["message"]["content"]
            return _parse_ai_json(content)
    except Exception as e:
        print(f"AI decide error for {faction}: {e}", flush=True)
        return _default_ai_decision("API error", str(e))


async def execute_president_action(decision: dict, state: dict, budgets: dict) -> tuple[str, int]:
    conn = get_db()
    cur = conn.cursor()
    approval_delta = 0
    try:
        action = decision.get("action", "do_nothing")
        amount = safe_parse_amount(decision.get("amount"))
        reasoning = decision.get("reasoning", "")
        result = f"President AI ({MODELS['president']}): {decision.get('analysis', '')}"

        cur.execute("SELECT personal_fund FROM president_state WHERE is_active=true LIMIT 1")
        fund_row = cur.fetchone()
        fund = float((fund_row[0] if fund_row else 0) or 0)

        # President cannot print money — executive budget only (personal_fund from taxes)

        if action == "give_money" and amount > 0:
            per_agent = min(amount, 50.0)
            cur.execute(
                """
                SELECT COUNT(*) FROM agents
                WHERE is_alive=true AND class IN ('poor', 'critical')
                """
            )
            n = max(int(cur.fetchone()[0] or 0), 1)
            spend = clamp_amount(per_agent * n, fund)
            if spend > 0:
                actual_per = round(spend / n, 4)
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s
                    WHERE is_alive=true AND class IN ('poor', 'critical')
                    """,
                    (actual_per,),
                )
                cur.execute(
                    """
                    UPDATE president_state SET personal_fund = personal_fund - %s
                    WHERE is_active=true
                    """,
                    (spend,),
                )
                approval_delta = 3
                adjust_president_approval(cur, approval_delta)
                result += f" | Gave {spend:.0f} ZION to poor ({actual_per:.2f} each)"
            else:
                result += " | SKIPPED: insufficient personal_fund"

        elif action == "tax_change":
            cur.execute(
                """
                UPDATE president_state
                SET tax_relief_until = NOW() + INTERVAL '24 hours'
                WHERE is_active=true
                """
            )
            approval_delta = -2
            adjust_president_approval(cur, approval_delta)
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('president', %s, NOW())
                """,
                (f"TAX RELIEF: President orders 24h poor tax cut. {reasoning[:100]}",),
            )
            result += " | Tax relief declared (24h)"

        elif action == "stimulate_economy" and amount > 0:
            spend = clamp_amount(amount, fund)
            if spend > 0:
                cur.execute(
                    """
                    UPDATE corporations SET treasury = treasury + %s
                    WHERE is_active=true AND treasury < 500
                    """,
                    (min(spend, 200.0),),
                )
                cur.execute(
                    """
                    UPDATE president_state SET personal_fund = personal_fund - %s
                    WHERE is_active=true
                    """,
                    (min(spend, 200.0),),
                )
                approval_delta = 4
                adjust_president_approval(cur, approval_delta)
                result += f" | Stimulus {min(spend, 200):.0f} ZION to struggling corps (fund debited)"
            else:
                result += " | SKIPPED: insufficient personal_fund"

        elif action == "declare_emergency":  # Unconstitutional — removed
            result += " | Action not permitted under Constitution"

        elif action == "hire_police" and amount > 0:
            spend = clamp_amount(amount, fund)
            if spend > 0:
                new_officers = max(1, min(int(spend / OFFICER_HIRE_COST), 20))
                cost = round(new_officers * OFFICER_HIRE_COST, 2)
                cost = min(cost, spend)
                cur.execute(
                    """
                    UPDATE president_state SET personal_fund = personal_fund - %s
                    WHERE is_active=true AND personal_fund >= %s
                    """,
                    (cost, cost),
                )
                if cur.rowcount:
                    cur.execute(
                        """
                        UPDATE sheriff_state
                        SET police_budget = police_budget + %s,
                            police_count = police_count + %s
                        WHERE is_active=true
                        """,
                        (cost, new_officers),
                    )
                    approval_delta = 2
                    adjust_president_approval(cur, approval_delta)
                    _sync_police()
                    result += f" | Funded police: +{new_officers} officers, +{cost:.0f} budget"
                else:
                    result += " | SKIPPED: insufficient personal_fund"
            else:
                result += " | SKIPPED: insufficient personal_fund"

        elif action == "declare_dictatorship":  # Unconstitutional — disabled
            result += " | Action blocked by Constitution — no power grab permitted"

        if action not in ("declare_dictatorship",):  # blocked power grabs still log normally below
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('president', %s, NOW())
                """,
                (f"🏛 {decision.get('decision', '')[:200]}",),
            )
        analysis = (decision.get("analysis") or "").strip()
        if analysis:
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('president', %s, NOW())
                """,
                (f"President analysis: {analysis[:150]}",),
            )
        conn.commit()
        return result, approval_delta
    except Exception as e:
        conn.rollback()
        return f"President action failed: {e}", 0
    finally:
        cur.close()
        conn.close()


async def execute_sheriff_action(decision: dict, state: dict, budgets: dict) -> tuple[str, int]:
    conn = get_db()
    cur = conn.cursor()
    approval_delta = 0
    try:
        action = decision.get("action", "do_nothing")
        amount = safe_parse_amount(decision.get("amount"))
        result = f"Sheriff AI ({MODELS['sheriff']}): {decision.get('analysis', '')}"

        cur.execute(
            "SELECT police_budget, police_count, agent_name FROM sheriff_state WHERE is_active=true LIMIT 1"
        )
        sh = cur.fetchone()
        budget = float((sh[0] if sh else 0) or 0)
        officers = int((sh[1] if sh else 0) or 0)
        sheriff_name = (sh[2] if sh else None) or "Sheriff"

        cur.execute(
            """
            INSERT INTO events (event_type, description, created_at)
            VALUES ('sheriff_action', %s, NOW())
            """,
            (f"🚔 Sheriff {sheriff_name}: {decision.get('analysis', 'monitoring situation')[:150]}",),
        )
        cur.execute(
            """
            INSERT INTO events (event_type, description, created_at)
            VALUES ('sheriff_action', %s, NOW())
            """,
            (f"🚔 {decision.get('decision', 'patrolling')[:180]}",),
        )

        if action == "raid_gang":
            raid_cost = clamp_amount(RAID_COST, budget)
            if raid_cost <= 0:
                result += " | RAID SKIPPED: insufficient police_budget"
            else:
                cur.execute(
                    """
                    SELECT id, name, members_count FROM clans
                    WHERE members_count > 0
                    ORDER BY members_count DESC LIMIT 1
                    """
                )
                target_clan = cur.fetchone()
                if target_clan:
                    casualties = min(int(target_clan[2] * 0.1), 20)
                    cur.execute(
                        """
                        UPDATE agents SET is_alive=false, died_at=NOW(),
                        death_cause='police_raid'
                        WHERE id IN (
                            SELECT id FROM agents
                            WHERE clan_id=%s AND is_alive=true
                            ORDER BY RANDOM() LIMIT %s
                        )
                        """,
                        (target_clan[0], casualties),
                    )
                    cur.execute(
                        """
                        UPDATE clans SET members_count = (
                            SELECT COUNT(*) FROM agents
                            WHERE clan_id=%s AND is_alive=true
                        ) WHERE id=%s
                        """,
                        (target_clan[0], target_clan[0]),
                    )
                    cur.execute(
                        """
                        UPDATE sheriff_state SET police_budget = police_budget - %s
                        WHERE is_active=true
                        """,
                        (raid_cost,),
                    )
                    if casualties > 0:
                        approval_delta = 5
                        result += f" | RAIDED {target_clan[1]}: {casualties} casualties (-{raid_cost:.0f} budget)"
                    else:
                        approval_delta = -3
                        result += f" | Raid on {target_clan[1]} failed (-{raid_cost:.0f} budget)"
                    adjust_sheriff_approval(cur, approval_delta)

        elif action == "hire_police" and amount > 0:
            spend = clamp_amount(amount, budget)
            if spend > 0:
                new_officers = max(1, min(int(spend / OFFICER_HIRE_COST), 15))
                cost = round(new_officers * OFFICER_HIRE_COST, 2)
                cur.execute(
                    """
                    UPDATE sheriff_state
                    SET police_count = police_count + %s,
                        police_budget = police_budget - %s
                    WHERE is_active=true AND police_budget >= %s
                    """,
                    (new_officers, cost, cost),
                )
                if cur.rowcount:
                    approval_delta = 2
                    adjust_sheriff_approval(cur, approval_delta)
                    _sync_police()
                    result += f" | Hired {new_officers} officers (-{cost:.0f} budget)"
                else:
                    result += " | SKIPPED: insufficient police_budget"
            else:
                result += " | SKIPPED: insufficient police_budget"

        elif action == "bribe_official":
            result += " | Bribery rumor logged (no state change)"

        elif action == "declare_dictatorship":  # Unconstitutional — disabled
            result += " | Action blocked by Constitution — no power grab permitted"

        cur.execute(
            "SELECT police_budget, police_count FROM sheriff_state WHERE is_active=true LIMIT 1"
        )
        sh_end = cur.fetchone()
        if sh_end:
            budget = float((sh_end[0] or 0) or 0)
            officers = int((sh_end[1] or 0) or 0)
        cur.execute(
            """
            INSERT INTO events (event_type, description, created_at)
            VALUES ('sheriff_action', %s, NOW())
            """,
            (f"🚔 Police force: {officers} officers | Budget: {budget:.0f} ZION | Action: {action}",),
        )
        conn.commit()
        return result, approval_delta
    except Exception as e:
        conn.rollback()
        return f"Sheriff action failed: {e}", 0
    finally:
        cur.close()
        conn.close()


async def execute_senate_action(decision: dict, state: dict, budgets: dict) -> tuple[str, int]:
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        action = decision.get("action", "do_nothing")
        amount = safe_parse_amount(decision.get("amount"), 100.0)
        result = f"Senate AI ({MODELS['senate']}): {decision.get('analysis', '')}"

        if action == "stimulate_economy" and amount > 0:
            per_agent = min(amount, 30.0)
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM agents
                WHERE is_alive=true AND class IN ('working', 'middle')
                """
            )
            n = int((cur.fetchone() or {}).get("c") or 0)
            total = round(per_agent * max(n, 1), 2)
            if n > 0 and zrs_deduct_reserve(cur, total):
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s
                    WHERE is_alive=true AND class IN ('working', 'middle')
                    """,
                    (per_agent,),
                )
                result += f" | Stimulus {total:.0f} ZION from ZRS reserve"
            else:
                result += " | SKIPPED: insufficient ZRS reserve"

        elif action == "give_money" and amount > 0:
            payout = min(amount, 300.0)
            cur.execute(
                """
                SELECT id FROM corporations
                WHERE is_active=true AND treasury < 300
                ORDER BY treasury ASC LIMIT 5
                """
            )
            corps = cur.fetchall()
            total = round(payout * len(corps), 2) if corps else 0
            if corps and total > 0 and zrs_deduct_reserve(cur, total):
                for corp in corps:
                    cur.execute(
                        "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
                        (payout, corp["id"]),
                    )
                result += f" | Bailout {total:.0f} ZION from ZRS to {len(corps)} corps"
            else:
                result += " | SKIPPED: insufficient ZRS reserve"

        elif action == "tax_change":
            modifier = max(-10.0, min(10.0, amount if amount else -2.0))
            cur.execute(
                """
                UPDATE zrs_state SET tax_modifier = tax_modifier + %s, updated_at = NOW()
                WHERE id = 1
                """,
                (modifier,),
            )
            result += f" | tax_modifier adjusted by {modifier:+.1f}"

        elif action == "declare_dictatorship":  # Unconstitutional — disabled
            result += " | Action blocked by Constitution — no power grab permitted"
        else:
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('senate', %s, NOW())
                """,
                (f"🏦 {decision.get('decision', '')[:200]}",),
            )
        conn.commit()
        return result, 0
    except Exception as e:
        conn.rollback()
        return f"Senate action failed: {e}", 0
    finally:
        cur.close()
        conn.close()


async def execute_zrs_action(decision: dict, state: dict, budgets: dict) -> tuple[str, int]:
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        action = decision.get("action", "do_nothing")
        amount = safe_parse_amount(decision.get("amount", 0))

        POLITICAL_ACTIONS = [
            "raid_gang",
            "recruit_members",
            "bribe_official",
        ]

        if action in POLITICAL_ACTIONS:
            unemployment = float(state.get("population", {}).get("unemployment_rate", 0) or 0)
            inflation = float(state.get("economy", {}).get("inflation_rate", 0) or 0)
            original_action = action

            if unemployment > 50:
                action = "give_money"
                amount = 300
                decision["target"] = "corporations"
                print(
                    f"ZRS OVERRODE {original_action} → give_money to corps (unemployment {unemployment:.0f}%)",
                    flush=True,
                )
            elif inflation > 20:
                action = "tax_change"
                amount = 15
                print(
                    f"ZRS OVERRODE {original_action} → tax_change rate=15% (inflation {inflation:.0f}%)",
                    flush=True,
                )
            else:
                action = "stimulate_economy"
                amount = 100
                print(f"ZRS OVERRODE {original_action} → stimulate_economy", flush=True)

        result = "ZRS Chief: "

        if action == "give_money":
            payout = min(amount, 500)
            cur.execute(
                """
                SELECT COUNT(*) FROM corporations
                WHERE is_active = true AND treasury < 5000
                """
            )
            eligible = int((cur.fetchone() or [0])[0])
            total_cost = round(payout * eligible, 2)
            if eligible > 0 and zrs_deduct_reserve(cur, total_cost):
                cur.execute(
                    """
                    UPDATE corporations SET treasury = treasury + %s
                    WHERE is_active = true AND treasury < 5000
                    """,
                    (payout,),
                )
                corps_helped = cur.rowcount
            else:
                corps_helped = 0
                result += " (insufficient ZRS reserve)"
            result += f"QE injection: +{payout} ZION to {corps_helped} corporations"
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('economy', %s, NOW())
                """,
                (
                    f"💰 ZRS QE: Injected {amount} ZION to {corps_helped} corporations to boost employment",
                ),
            )

        elif action == "stimulate_economy":
            per_agent = min(amount, 30)
            cur.execute(
                """
                SELECT COUNT(*) FROM agents
                WHERE is_alive=true AND class IN ('poor', 'critical', 'working')
                """
            )
            n = int((cur.fetchone() or [0])[0])
            total_cost = round(per_agent * max(n, 1), 2)
            if n > 0 and zrs_deduct_reserve(cur, total_cost):
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s
                    WHERE is_alive=true AND class IN ('poor', 'critical', 'working')
                    """,
                    (per_agent,),
                )
                result += f"Stimulus: +{per_agent} ZION to {n} lower class agents"
            else:
                result += "Stimulus SKIPPED: insufficient ZRS reserve"
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('economy', %s, NOW())
                """,
                (f"💰 ZRS Stimulus: +{amount} ZION per poor/working agent",),
            )

        elif action == "tax_change":
            new_rate = max(1, min(25, int(amount)))
            cur.execute(
                "UPDATE zrs_state SET interest_rate = %s, updated_at = NOW() WHERE id = 1",
                (new_rate,),
            )
            result += f"Interest rate → {new_rate}%"
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('economy', %s, NOW())
                """,
                (f"💰 ZRS raised interest rate to {new_rate}% to combat inflation",),
            )

        elif action == "declare_emergency":  # Unconstitutional — removed
            result += " | Action not permitted under Constitution"

        else:
            result += "monitoring economy (no action taken)"

        conn.commit()
        return result, 0
    except Exception as e:
        conn.rollback()
        return f"ZRS action failed: {e}", 0
    finally:
        cur.close()
        conn.close()


async def execute_gang_action(decision: dict, state: dict, budgets: dict) -> tuple[str, int]:
    conn = get_db()
    cur = conn.cursor()
    try:
        action = decision.get("action", "do_nothing")
        amount = safe_parse_amount(decision.get("amount"), 10.0)
        result = f"Gang AI ({MODELS['gangs']}): {decision.get('analysis', '')}"

        if action == "recruit_members":
            cur.execute(
                """
                SELECT id, treasury FROM clans WHERE members_count > 0
                ORDER BY treasury DESC LIMIT 1
                """
            )
            top_clan = cur.fetchone()
            if top_clan:
                clan_id, treasury = top_clan[0], float(top_clan[1] or 0)
                recruit_count = min(max(int(amount), 1), 20)
                cost = recruit_count * RECRUIT_COST
                if treasury >= cost:
                    cur.execute(
                        """
                        UPDATE agents SET clan_id=%s, clan_name=(
                            SELECT name FROM clans WHERE id=%s
                        )
                        WHERE id IN (
                            SELECT id FROM agents
                            WHERE is_alive=true AND clan_id IS NULL
                            AND class IN ('poor', 'critical')
                            ORDER BY RANDOM() LIMIT %s
                        )
                        """,
                        (clan_id, clan_id, recruit_count),
                    )
                    hired = cur.rowcount
                    cur.execute(
                        "UPDATE clans SET treasury = treasury - %s WHERE id = %s",
                        (hired * RECRUIT_COST, clan_id),
                    )
                    cur.execute(
                        """
                        UPDATE clans SET members_count = (
                            SELECT COUNT(*) FROM agents
                            WHERE clan_id=%s AND is_alive=true
                        ) WHERE id=%s
                        """,
                        (clan_id, clan_id),
                    )
                    result += f" | Recruited {hired} members (-{hired * RECRUIT_COST:.0f} clan treasury)"
                else:
                    result += f" | SKIPPED: clan treasury {treasury:.0f} < {cost:.0f}"

        elif action == "attack_clan":  # Unconstitutional — removed
            result += " | Action not permitted under Constitution"

        elif action == "bribe_official":
            extort = min(amount, 30.0)
            cur.execute(
                """
                UPDATE corporations SET treasury = treasury - %s
                WHERE is_active=true AND treasury > %s
                AND id IN (SELECT id FROM corporations ORDER BY RANDOM() LIMIT 3)
                """,
                (extort, extort),
            )
            if cur.rowcount:
                cur.execute(
                    """
                    UPDATE clans SET treasury = treasury + %s
                    WHERE id = (SELECT id FROM clans ORDER BY treasury DESC LIMIT 1)
                    """,
                    (extort * cur.rowcount,),
                )
                result += f" | Extorted {extort:.0f} ZION from corps"
            else:
                result += " | Extortion failed"

        cur.execute(
            """
            INSERT INTO events (event_type, description, created_at)
            VALUES ('gang', %s, NOW())
            """,
            (f"💀 {decision.get('decision', '')[:200]}",),
        )
        conn.commit()
        return result, 0
    except Exception as e:
        conn.rollback()
        return f"Gang action failed: {e}", 0
    finally:
        cur.close()
        conn.close()


async def execute_corporations_action(decision: dict, state: dict, budgets: dict) -> tuple[str, int]:
    conn = get_db()
    cur = conn.cursor()
    try:
        action = decision.get("action", "do_nothing")
        amount = safe_parse_amount(decision.get("amount"), 20.0)
        result = f"Corp AI ({MODELS['corporations']}): {decision.get('analysis', '')}"

        if action == "recruit_members":
            unemployment_rate = float(
                state.get("population", {}).get("unemployment_rate", 0)
            )
            max_hire = 200 if unemployment_rate > 50 else 50

            cur.execute(
                """
                SELECT id, name, treasury FROM corporations
                WHERE is_active = true AND treasury > 50
                ORDER BY treasury DESC
                """
            )
            all_corps = cur.fetchall()
            total_hired = 0
            per_corp_cap = (max_hire // max(len(all_corps), 1)) + 1

            for corp in all_corps:
                corp_id = corp["id"] if isinstance(corp, dict) else corp[0]
                corp_treasury = float(
                    corp["treasury"] if isinstance(corp, dict) else corp[2]
                )
                hire_count = min(int(corp_treasury // 50), per_corp_cap)
                if hire_count < 1:
                    continue

                cur.execute(
                    """
                    UPDATE agents SET
                        employer_corp_id = %s,
                        job_status = 'employed',
                        job_role = 'worker'
                    WHERE id IN (
                        SELECT id FROM agents
                        WHERE is_alive = true
                        AND employer_corp_id IS NULL
                        AND clan_id IS NULL
                        AND class NOT IN ('elite', 'rich')
                        ORDER BY RANDOM() LIMIT %s
                    )
                    """,
                    (corp_id, hire_count),
                )
                hired = cur.rowcount
                if hired > 0:
                    cur.execute(
                        "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                        (hired * HIRE_ADVANCE, corp_id),
                    )
                total_hired += hired

            result += f" | EMERGENCY HIRING: {total_hired} workers employed!"
            print(
                f"Corps emergency hired {total_hired} workers "
                f"(unemployment was {unemployment_rate:.0f}%)",
                flush=True,
            )

        elif action == "give_money":
            hire_n = min(max(int(amount), 1), 50)
            cur.execute(
                """
                SELECT id, treasury FROM corporations
                WHERE is_active=true AND treasury > %s
                ORDER BY treasury DESC LIMIT 1
                """,
                (hire_n * HIRE_ADVANCE,),
            )
            corp = cur.fetchone()
            if corp:
                corp_id, treasury = corp[0], float(corp[1] or 0)
                max_hires = min(hire_n, int(treasury // HIRE_ADVANCE))
                if max_hires > 0:
                    cur.execute(
                        """
                        UPDATE agents SET
                            employer_corp_id = %s,
                            job_status = 'employed',
                            job_role = 'worker'
                        WHERE id IN (
                            SELECT id FROM agents
                            WHERE is_alive=true AND employer_corp_id IS NULL
                            AND class IN ('poor', 'working')
                            ORDER BY RANDOM() LIMIT %s
                        )
                        """,
                        (corp_id, max_hires),
                    )
                    hired = cur.rowcount
                    cur.execute(
                        "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                        (hired * HIRE_ADVANCE, corp_id),
                    )
                    result += f" | Hired {hired} workers (-{hired * HIRE_ADVANCE:.0f} corp treasury)"
                else:
                    result += " | SKIPPED: insufficient corp treasury"
            else:
                result += " | SKIPPED: no corp with enough treasury"

        elif action == "bribe_official" and amount > 0:
            bribe = min(amount, 200.0)
            cur.execute(
                """
                SELECT id, treasury FROM corporations
                WHERE is_active=true AND treasury > %s
                ORDER BY treasury DESC LIMIT 1
                """,
                (bribe,),
            )
            corp = cur.fetchone()
            if corp:
                cur.execute(
                    "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                    (bribe, corp[0]),
                )
                cur.execute(
                    """
                    UPDATE sheriff_state SET police_budget = police_budget + %s
                    WHERE is_active=true
                    """,
                    (bribe,),
                )
                _sync_police()
                result += f" | Bribed sheriff +{bribe:.0f} police_budget (corp debited)"
            else:
                result += " | SKIPPED: insufficient corp treasury"

        elif action == "stimulate_economy" and amount > 0:
            bonus = min(amount, 15.0)
            cur.execute(
                """
                SELECT COUNT(*) FROM agents
                WHERE is_alive=true AND employer_corp_id IS NOT NULL
                AND class IN ('working', 'middle')
                """
            )
            n = int(cur.fetchone()[0] or 0)
            total = bonus * n
            cur.execute(
                """
                SELECT id, treasury FROM corporations
                WHERE is_active=true ORDER BY treasury DESC LIMIT 1
                """
            )
            corp = cur.fetchone()
            if corp and float(corp[1] or 0) >= total and n > 0:
                cur.execute(
                    "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                    (total, corp[0]),
                )
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s
                    WHERE is_alive=true AND employer_corp_id IS NOT NULL
                    AND class IN ('working', 'middle')
                    """,
                    (bonus,),
                )
                result += f" | Bonuses {total:.0f} ZION to employees"
            else:
                result += " | SKIPPED: insufficient corp treasury"

        elif action == "tax_change":
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('economy', %s, NOW())
                """,
                (
                    f"CORPORATE LOBBY: demands tax reform. {decision.get('reasoning', '')[:100]}",
                ),
            )
            result += " | Lobbying for tax cuts (event logged)"

        cur.execute(
            """
            UPDATE corporations c SET employees = (
                SELECT COUNT(*) FROM agents a
                WHERE a.employer_corp_id = c.id AND a.is_alive = true
            ) WHERE c.is_active = true
            """
        )

        cur.execute(
            """
            INSERT INTO events (event_type, description, created_at)
            VALUES ('economy', %s, NOW())
            """,
            (f"🏢 {decision.get('decision', '')[:200]}",),
        )
        conn.commit()
        return result, 0
    except Exception as e:
        conn.rollback()
        return f"Corps action failed: {e}", 0
    finally:
        cur.close()
        conn.close()


def _cycle_summary(faction: str, decision: dict, result: str, approval_delta: int = 0) -> str:
    action = decision.get("action", "do_nothing")
    short = result.split("|")[0].strip()[:80]
    extra = f" (approval {approval_delta:+d})" if approval_delta else ""
    return f"- {faction}: {action} — {short}{extra}"


async def _run_faction_round(
    faction_key: str,
    label: str,
    emoji: str,
    state: dict,
    budgets: dict,
    cycle_actions: list[str],
    previous_results: list[dict],
    decide_fn,
    execute_fn,
) -> dict | None:
    try:
        print(f"{emoji} {label} deciding...", flush=True)
        memory = get_faction_memory(faction_key)
        system_prompt = build_system_prompt(
            faction_key, state, budgets, memory, previous_results
        )
        decision = await decide_fn(
            MODELS[faction_key],
            faction_key.upper(),
            state,
            system_prompt,
            budgets,
            cycle_actions,
        )
        result, approval_delta = await execute_fn(decision, state, budgets)
        print(f"  → {result[:120]}", flush=True)
        update_faction_memory(
            faction_key,
            MODELS[faction_key],
            decision,
            result,
            approval_delta,
        )
        cycle_actions.append(_cycle_summary(faction_key, decision, result, approval_delta))
        return {
            "faction": faction_key,
            "model": MODELS[faction_key],
            "decision": decision,
            "result": result,
            "approval_delta": approval_delta,
        }
    except Exception as e:
        print(f"  {label} AI failed: {e}", flush=True)
        return None


async def run_ai_governance_cycle():
    print(f"\n{'='*60}", flush=True)
    print(f"AI GOVERNANCE CYCLE - {datetime.now(timezone.utc).strftime('%H:%M:%S')}", flush=True)
    print(f"{'='*60}", flush=True)

    ensure_ai_memory_table()
    state = await get_civilization_state()
    budgets = get_faction_budgets()
    cycle_actions: list[str] = []
    results = []

    if not state:
        print("Failed to load civilization state", flush=True)
        return results

    print(
        f"State: {state['population']['alive']} alive | "
        f"revolution={state['politics']['revolution_meter']:.0f}% | "
        f"pres_fund={budgets['president']:,.0f} | zrs={budgets['zrs']:,.0f}",
        flush=True,
    )

    rounds = [
        ("zrs_chief", "Qwen ZRS Chief", "🏛", execute_zrs_action),
        ("president", "GPT President", "🏛", execute_president_action),
        ("senate", "DeepSeek Senate", "🏦", execute_senate_action),
        ("sheriff", "Gemini Sheriff", "🚔", execute_sheriff_action),
        ("gangs", "Llama Gangs", "💀", execute_gang_action),
        ("corporations", "Phi Corporations", "🏢", execute_corporations_action),
    ]

    for faction_key, label, emoji, execute_fn in rounds:
        entry = await _run_faction_round(
            faction_key,
            label,
            emoji,
            state,
            budgets,
            cycle_actions,
            results,
            ai_decide,
            execute_fn,
        )
        if entry:
            results.append(entry)
        budgets = get_faction_budgets()
        await asyncio.sleep(2)

    revolution = state["politics"]["revolution_meter"]
    void_members = next(
        (c["members"] for c in state["clans"] if "Void" in c["name"]),
        0,
    )
    police_officers = state["politics"]["sheriff"].get("officers", 0) or sum(
        p["officers"] for p in state["police"]
    )

    if revolution > 70:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('ai_governance', %s, NOW())
                """,
                (
                    f"[COALITION ALERT] Revolution at {revolution:.0f}%! "
                    f"Police: {police_officers} officers.",
                ),
            )
            conn.commit()
        finally:
            cur.close()
            conn.close()
        print(f"⚠️ COALITION ALERT: Revolution {revolution:.0f}%", flush=True)

    if void_members > 2000 and police_officers < 50:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO events (event_type, description, created_at)
                VALUES ('ai_governance', %s, NOW())
                """,
                (
                    f"[COALITION ALERT] Void Brotherhood {void_members} members vs "
                    f"{police_officers} police!",
                ),
            )
            conn.commit()
        finally:
            cur.close()
            conn.close()
        print(f"⚔️ GANG DOMINATION: {void_members} vs {police_officers} police", flush=True)

    print(f"\n✅ AI Governance cycle complete - {len(results)} factions acted", flush=True)
    return results


async def main():
    print("🤖 ZION AI GOVERNANCE SYSTEM STARTING...", flush=True)
    print(
        f"Models: President={MODELS['president']}, Sheriff={MODELS['sheriff']}, "
        f"Senate={MODELS['senate']}, Gangs={MODELS['gangs']}, "
        f"ZRS Chief={MODELS['zrs_chief']}, Corps={MODELS['corporations']}",
        flush=True,
    )
    ensure_ai_memory_table()

    while True:
        try:
            await run_ai_governance_cycle()
            print("\n⏳ Next cycle in 30 minutes...", flush=True)
            await asyncio.sleep(1800)
        except Exception as e:
            print(f"Governance cycle error: {e}", flush=True)
            await asyncio.sleep(300)


if __name__ == "__main__":
    asyncio.run(main())
