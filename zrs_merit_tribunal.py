#!/usr/bin/env python3
"""
ZRS Merit Tribunal — daily AI court (3 judges, majority 2/3) evaluates
at-risk agents and decides who receives ZRS stipends.
"""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timezone

import httpx
from openrouter_key import get_openrouter_key

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

from civ_common import (
    ensure_schema,
    get_conn,
    get_cursor,
    log_event,
    zrs_deduct_reserve,
)

OPENROUTER_KEY = get_openrouter_key()

TRIBUNAL_ACTIVATION_DATE = date(2026, 6, 18)  # через 3 дня от 15 июня
ANNOUNCEMENT_DESCRIPTION = (
    "⚖️ ZRS MERIT TRIBUNAL: System initializing. First session "
    "scheduled for June 18, 2026. Agents are completing their education."
)

TRIBUNAL = {
    "judge_1": "deepseek/deepseek-chat-v3-0324",
    "judge_2": "google/gemini-2.5-flash",
    "judge_3": "meta-llama/llama-3.3-70b-instruct",
}

STIPEND_AMOUNT = 15.0
EMERGENCY_AID_AMOUNT = 10.0
MAX_CANDIDATES = 100
RISK_BALANCE_THRESHOLD = 20.0
USELESS_ANOMALY_RATIO = 0.80
PROTECTED_CLASSES = ("president", "sheriff", "senator", "judge")

JUDGE_SYSTEM = """You are a ZRS tribunal judge in ZION civilization. Evaluate if this agent deserves continued ZRS financial support based on their CONTRIBUTION to society.

An agent is USEFUL if they show ANY meaningful contribution: learning (insights), profitable trading, or active participation.
An agent is USELESS only if they show NO contribution whatsoever over their lifetime.

Respond ONLY with JSON: {"ruling": "useful" or "useless", "rationale": "brief reason"}"""


def ensure_merit_schema(cur) -> None:
    ensure_schema(cur)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zrs_merit_verdicts (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL,
            session_date DATE NOT NULL,
            verdict VARCHAR(20) NOT NULL,
            judges JSONB,
            stipend_amount NUMERIC(20,6) DEFAULT 0,
            rationale TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_merit_agent_date
        ON zrs_merit_verdicts (agent_id, session_date)
        """
    )


def fetch_candidates(cur, session_date: date) -> list[dict]:
    cur.execute(
        """
        SELECT a.id, a.name, a.class, a.balance, a.debt, a.age_days
        FROM agents a
        WHERE a.is_alive = TRUE
          AND a.balance < %s
          AND LOWER(COALESCE(a.class, '')) NOT IN %s
          AND NOT EXISTS (
              SELECT 1 FROM zrs_merit_verdicts v
              WHERE v.agent_id = a.id AND v.session_date = %s
          )
        ORDER BY a.balance ASC
        LIMIT %s
        """,
        (RISK_BALANCE_THRESHOLD, PROTECTED_CLASSES, session_date, MAX_CANDIDATES),
    )
    return [dict(row) for row in cur.fetchall()]


def build_dossier(cur, agent: dict) -> dict:
    agent_id = int(agent["id"])

    cur.execute(
        """
        SELECT COUNT(*) AS insight_count,
               COALESCE(SUM(usefulness_score), 0) AS usefulness_total,
               COALESCE(
                   array_agg(LEFT(insight, 150) ORDER BY usefulness_score DESC, id DESC)
                   FILTER (WHERE insight IS NOT NULL),
                   ARRAY[]::text[]
               ) AS insights
        FROM agent_knowledge
        WHERE agent_id = %s
        """,
        (agent_id,),
    )
    knowledge = cur.fetchone() or {}

    cur.execute(
        """
        SELECT COALESCE(SUM(pnl), 0) AS net_pnl,
               COUNT(*) AS trade_count
        FROM agent_trades
        WHERE agent_id = %s AND status = 'CLOSED'
        """,
        (agent_id,),
    )
    trading = cur.fetchone() or {}

    cur.execute(
        """
        SELECT description
        FROM events
        WHERE agent_id = %s
        ORDER BY created_at DESC
        LIMIT 5
        """,
        (agent_id,),
    )
    events = [row["description"] for row in cur.fetchall() if row.get("description")]

    return {
        "agent_id": agent_id,
        "name": agent["name"],
        "class": agent.get("class") or "unknown",
        "balance": float(agent.get("balance") or 0),
        "debt": float(agent.get("debt") or 0),
        "age_days": int(agent.get("age_days") or 0),
        "insight_count": int(knowledge.get("insight_count") or 0),
        "usefulness_total": float(knowledge.get("usefulness_total") or 0),
        "insights": list(knowledge.get("insights") or [])[:5],
        "net_pnl": float(trading.get("net_pnl") or 0),
        "trade_count": int(trading.get("trade_count") or 0),
        "recent_events": events,
    }


def dossier_prompt(dossier: dict) -> str:
    insights = dossier["insights"] or ["(none)"]
    events = dossier["recent_events"] or ["(none)"]
    return (
        f"Agent: {dossier['name']} (id={dossier['agent_id']})\n"
        f"Class: {dossier['class']}, Age: {dossier['age_days']} days\n"
        f"Balance: {dossier['balance']:.2f} ZION, Debt: {dossier['debt']:.2f}\n\n"
        f"Knowledge contributions:\n"
        f"- Insight count: {dossier['insight_count']}\n"
        f"- Total usefulness score: {dossier['usefulness_total']:.2f}\n"
        f"- Sample insights: {insights}\n\n"
        f"Trading performance:\n"
        f"- Closed trades: {dossier['trade_count']}\n"
        f"- Net PnL: {dossier['net_pnl']:.2f} ZION\n\n"
        f"Recent activity:\n"
        + "\n".join(f"- {e}" for e in events)
    )


async def judge_rules(model: str, dossier: dict) -> dict:
    user = (
        "Evaluate if this agent deserves continued ZRS financial support. "
        "Consider knowledge contributions, trading performance, and recent activity.\n\n"
        f"{dossier_prompt(dossier)}"
    )
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": JUDGE_SYSTEM},
                            {"role": "user", "content": user},
                        ],
                        "max_tokens": 200,
                        "response_format": {"type": "json_object"},
                    },
                )
                payload = response.json()
                content = payload["choices"][0]["message"]["content"]
                verdict = json.loads(content)
                if verdict.get("ruling") in ("useful", "useless"):
                    return verdict
        except Exception:
            await asyncio.sleep(2)
    return {"ruling": "useful", "rationale": "default useful (judge unavailable)"}


async def convene_for_agent(dossier: dict) -> tuple[str, dict, str]:
    results: dict = {}

    async def _run(name: str, model: str):
        ruling = await judge_rules(model, dossier)
        return name, model, ruling

    gathered = await asyncio.gather(
        *[_run(name, model) for name, model in TRIBUNAL.items()]
    )
    for name, model, ruling in gathered:
        results[name] = {"model": model, **ruling}

    rulings = [r.get("ruling") for r in results.values()]
    useful_count = rulings.count("useful")
    verdict = "useful" if useful_count >= 2 else "useless"
    rationales = [r.get("rationale", "") for r in results.values() if r.get("rationale")]
    rationale = rationales[0] if rationales else verdict
    return verdict, results, rationale


def record_verdict(
    cur,
    agent_id: int,
    session_date: date,
    verdict: str,
    judges: dict,
    stipend_amount: float,
    rationale: str,
) -> None:
    cur.execute(
        """
        INSERT INTO zrs_merit_verdicts (
            agent_id, session_date, verdict, judges, stipend_amount, rationale
        ) VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            agent_id,
            session_date,
            verdict,
            json.dumps(judges),
            stipend_amount,
            rationale[:1000] if rationale else None,
        ),
    )


def apply_useful_stipend(cur, dossier: dict, judges: dict, rationale: str, amount: float) -> bool:
    agent_id = dossier["agent_id"]
    if not zrs_deduct_reserve(cur, amount):
        log_event(
            cur,
            agent_id,
            "zrs",
            f"⚖️ ZRS MERIT: {dossier['name']} ruled USEFUL — stipend blocked (reserve floor)",
            0,
            priority="urgent",
        )
        return False

    cur.execute(
        "UPDATE agents SET balance = balance + %s WHERE id = %s AND is_alive = TRUE",
        (amount, agent_id),
    )
    useful_count = sum(1 for j in judges.values() if j.get("ruling") == "useful")
    log_event(
        cur,
        agent_id,
        "zrs",
        f"⚖️ ZRS MERIT: {dossier['name']} ruled USEFUL — stipend {amount:.0f} ZION ({useful_count}/3 judges)",
        amount,
        priority="urgent",
    )
    return True


def apply_emergency_aid(cur, dossier: dict, judges: dict, rationale: str) -> bool:
    return apply_useful_stipend(cur, dossier, judges, rationale, EMERGENCY_AID_AMOUNT)


async def run_session(dry_run: bool = False) -> dict:
    session_date = date.today()
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_merit_schema(cur)
    conn.commit()

    candidates = fetch_candidates(cur, session_date)
    print(f"\n⚖️ ZRS MERIT TRIBUNAL — {session_date.isoformat()}")
    print(f"   Candidates in risk zone: {len(candidates)}")

    if not candidates:
        print("   No candidates to review.")
        cur.close()
        conn.close()
        return {"total": 0, "funded": 0, "denied": 0, "anomaly": False}

    trials: list[dict] = []
    for agent in candidates:
        dossier = build_dossier(cur, agent)
        verdict, judges, rationale = await convene_for_agent(dossier)
        trials.append(
            {
                "dossier": dossier,
                "verdict": verdict,
                "judges": judges,
                "rationale": rationale,
            }
        )
        useful_count = sum(1 for j in judges.values() if j.get("ruling") == "useful")
        print(
            f"   {dossier['name']}: {verdict.upper()} ({useful_count}/3 useful) — {rationale[:80]}"
        )

    total = len(trials)
    useless_count = sum(1 for t in trials if t["verdict"] == "useless")
    anomaly = total > 0 and (useless_count / total) > USELESS_ANOMALY_RATIO

    if anomaly:
        print(
            f"\n   ⚠️ ANOMALY: {useless_count}/{total} ruled useless "
            f"(>{USELESS_ANOMALY_RATIO:.0%}) — applying emergency aid to all, ignoring useless verdicts"
        )
        log_event(
            cur,
            None,
            "zrs",
            f"⚠️ ZRS MERIT ANOMALY: {useless_count}/{total} useless — session aborted, emergency aid for all",
            0,
            priority="breaking",
        )

    funded = 0
    denied = 0

    if dry_run:
        print("\n   DRY RUN — no DB writes or payouts.")
        cur.close()
        conn.close()
        return {
            "total": total,
            "funded": sum(1 for t in trials if t["verdict"] == "useful"),
            "denied": useless_count,
            "anomaly": anomaly,
        }

    for trial in trials:
        dossier = trial["dossier"]
        judges = trial["judges"]
        rationale = trial["rationale"]
        verdict = trial["verdict"]
        stipend_paid = 0.0

        if anomaly:
            paid = apply_emergency_aid(cur, dossier, judges, rationale)
            if paid:
                funded += 1
                stipend_paid = EMERGENCY_AID_AMOUNT
            record_verdict(
                cur,
                dossier["agent_id"],
                session_date,
                "useful",
                judges,
                stipend_paid,
                f"anomaly bailout: {rationale}",
            )
        elif verdict == "useful":
            paid = apply_useful_stipend(cur, dossier, judges, rationale, STIPEND_AMOUNT)
            if paid:
                funded += 1
                stipend_paid = STIPEND_AMOUNT
            record_verdict(
                cur,
                dossier["agent_id"],
                session_date,
                "useful",
                judges,
                stipend_paid,
                rationale,
            )
        else:
            denied += 1
            log_event(
                cur,
                dossier["agent_id"],
                "zrs",
                f"⚖️ ZRS MERIT: {dossier['name']} ruled USELESS — no stipend (insufficient contribution)",
                0,
                priority="urgent",
            )
            record_verdict(
                cur,
                dossier["agent_id"],
                session_date,
                "useless",
                judges,
                0,
                rationale,
            )

    log_event(
        cur,
        None,
        "zrs",
        f"⚖️ ZRS MERIT SESSION: {total} agents reviewed, {funded} funded, {denied} denied",
        0,
        priority="normal",
    )
    conn.commit()
    cur.close()
    conn.close()

    print(f"\n   SESSION COMPLETE: {total} reviewed, {funded} funded, {denied} denied")
    return {"total": total, "funded": funded, "denied": denied, "anomaly": anomaly}


def log_activation_announcement_once(cur, conn) -> None:
    """One-time ZRS feed notice before the tribunal goes live."""
    cur.execute(
        """
        SELECT 1 FROM events
        WHERE event_type = 'zrs' AND description = %s
        LIMIT 1
        """,
        (ANNOUNCEMENT_DESCRIPTION,),
    )
    if cur.fetchone():
        return
    log_event(cur, None, "zrs", ANNOUNCEMENT_DESCRIPTION, 0, priority="normal")
    conn.commit()


def merit_denies_emergency_aid(cur, agent_id: int) -> bool:
    """True if agent was condemned useless by today's merit tribunal."""
    cur.execute(
        """
        SELECT 1 FROM zrs_merit_verdicts
        WHERE agent_id = %s
          AND session_date = CURRENT_DATE
          AND verdict = 'useless'
        LIMIT 1
        """,
        (agent_id,),
    )
    return cur.fetchone() is not None


def main():
    import sys

    today = date.today()
    if today < TRIBUNAL_ACTIVATION_DATE:
        days_left = (TRIBUNAL_ACTIVATION_DATE - today).days
        print(
            f"⏳ ZRS Merit Tribunal activates on {TRIBUNAL_ACTIVATION_DATE} "
            f"({days_left} days remaining — students still in education)"
        )
        conn = get_conn()
        cur = get_cursor(conn)
        ensure_merit_schema(cur)
        conn.commit()
        log_activation_announcement_once(cur, conn)
        cur.close()
        conn.close()
        return

    dry_run = "--dry-run" in sys.argv
    result = asyncio.run(run_session(dry_run=dry_run))
    print(result)


if __name__ == "__main__":
    main()
