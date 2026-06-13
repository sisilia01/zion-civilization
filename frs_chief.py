#!/usr/bin/env python3
"""FRS Chief — independent central bank governor (USA Fed model)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from civ_common import (
    economy_snapshot,
    ensure_schema,
    get_conn,
    get_cursor,
    log_event,
    zrs_deduct_reserve,
    zrs_reserve,
    ZRS_RESERVE_FLOOR,
)
from civ_economics import fetch_economic_indicators

FRS_TERM_CYCLES = 12
FRS_MODEL = "microsoft/phi-4-mini-instruct"
OPENROUTER_KEY = os.getenv("OPENROUTER_KEY", "")


def ensure_frs_chief(cur):
    """Ensure FRS Chief exists - auto-nominate if empty."""
    ensure_schema(cur)
    cur.execute("SELECT is_active FROM frs_chief_state WHERE id = 1")
    row = cur.fetchone()
    is_active = (row or {}).get("is_active") if isinstance(row, dict) else (row[0] if row else False)
    if is_active:
        return

    cur.execute(
        """
        SELECT id, name FROM agents
        WHERE is_alive = true
        AND class IN ('rich', 'elite', 'middle')
        ORDER BY balance DESC LIMIT 1
        """
    )
    agent = cur.fetchone()
    if not agent:
        cur.execute("SELECT id, name FROM agents WHERE is_alive = true LIMIT 1")
        agent = cur.fetchone()

    if not agent:
        return

    agent_id = agent["id"] if isinstance(agent, dict) else agent[0]
    agent_name = agent["name"] if isinstance(agent, dict) else agent[1]

    cur.execute(
        """
        UPDATE frs_chief_state SET
            agent_id = %s,
            chief_name = %s,
            nominated_by = NULL,
            confirmation_status = 'confirmed',
            term_cycles_remaining = %s,
            cycles_served = 0,
            is_active = true,
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE id = 1
        """,
        (agent_id, agent_name, FRS_TERM_CYCLES),
    )
    print(f"FRS Chief auto-nominated: {agent_name}", flush=True)


def get_frs_chief(cur) -> dict:
    cur.execute("SELECT * FROM frs_chief_state WHERE id = 1")
    row = cur.fetchone()
    return dict(row) if row else {}


def nominate_frs_chief(cur, president: dict, ctx: dict) -> str:
    """President nominates FRS Chief when vacant or term ended."""
    chief = get_frs_chief(cur)
    if chief.get("is_active") and int(chief.get("term_cycles_remaining") or 0) > 0:
        return "FRS Chief in office"

    if chief.get("confirmation_status") == "pending":
        return "Awaiting Senate confirmation"

    cur.execute(
        """
        SELECT id, name FROM agents
        WHERE is_alive = true AND class IN ('elite', 'rich', 'middle')
        ORDER BY balance DESC LIMIT 1
        """
    )
    candidate = cur.fetchone()
    name = (candidate or {}).get("name") or "Independent FRS Chair"
    aid = (candidate or {}).get("id")

    cur.execute(
        """
        UPDATE frs_chief_state SET
            agent_id = %s,
            chief_name = %s,
            nominated_by = %s,
            confirmation_status = 'pending',
            term_cycles_remaining = 0,
            is_active = false,
            appointed_at = NOW(),
            updated_at = NOW()
        WHERE id = 1
        """,
        (aid, name, president.get("agent_id")),
    )
    msg = f"President {president.get('agent_name')} nominates {name} as FRS Chief"
    log_event(cur, president.get("agent_id"), "economy", msg, 0, priority="urgent")
    ctx["frs_nomination"] = name
    return msg


def senate_confirm_frs_chief(cur, ctx: dict) -> str:
    """Senate confirms FRS Chief by majority."""
    chief = get_frs_chief(cur)
    if chief.get("confirmation_status") != "pending":
        return "No pending FRS nomination"

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    n = int((cur.fetchone() or {}).get("c") or 0)
    if n < 3:
        cur.execute(
            """
            UPDATE frs_chief_state SET
                confirmation_status = 'confirmed',
                is_active = true,
                term_cycles_remaining = %s,
                confirmed_at = NOW(),
                updated_at = NOW()
            WHERE id = 1
            """,
            (FRS_TERM_CYCLES,),
        )
        msg = f"Senate confirms {chief.get('chief_name')} as FRS Chief ({FRS_TERM_CYCLES} cycles)"
        log_event(cur, None, "senate", msg, 0, priority="breaking")
        ctx["frs_confirmed"] = chief.get("chief_name")
        return msg

    votes_for = max(1, int(n * 0.55))
    cur.execute(
        """
        UPDATE frs_chief_state SET
            confirmation_status = 'confirmed',
            is_active = true,
            term_cycles_remaining = %s,
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE id = 1
        """,
        (FRS_TERM_CYCLES,),
    )
    msg = (
        f"Senate confirms FRS Chief {chief.get('chief_name')} "
        f"({votes_for}-{n - votes_for}) — 12-cycle term begins"
    )
    log_event(cur, None, "senate", msg, 0, priority="breaking")
    ctx["frs_confirmed"] = chief.get("chief_name")
    return msg


def _rule_based_directive(cur, ctx: dict) -> dict:
    """Federal Reserve monetary policy — independent of political pressure."""
    from civ_economics import fetch_live_agent_metrics

    econ = economy_snapshot(cur)
    indicators = fetch_economic_indicators(cur)
    metrics = fetch_live_agent_metrics(cur)
    unemployment = float(metrics.get("unemployment_rate") or 0)
    inflation = float(indicators.get("inflation_rate") or econ.get("inflation_index") or 0)
    reserve = zrs_reserve(cur)

    # HYPERINFLATION: stop all QE, max rates
    if inflation > 50:
        return {
            "action": "tax_change",
            "amount": 20.0,
            "policy_mode": "HYPERINFLATION",
            "reasoning": f"Inflation {inflation:.1f}% — STOP QE, rates to 20%",
        }

    # CRISIS: unemployment > 80% OR inflation > 30%
    if unemployment > 80 or inflation > 30:
        qe = min(100_000.0, max(0, reserve - ZRS_RESERVE_FLOOR) * 0.10)
        return {
            "action": "stimulate_economy",
            "amount": qe,
            "policy_mode": "RECESSION",
            "reasoning": f"High unemployment {unemployment:.0f}%, inflation {inflation:.1f}% — lawful corp QE",
        }

    # RECESSION: unemployment > 50% — QE to corps only
    if unemployment > 50:
        qe = min(50_000.0, max(0, reserve - ZRS_RESERVE_FLOOR) * 0.05)
        return {
            "action": "stimulate_economy",
            "amount": qe,
            "policy_mode": "RECESSION",
            "reasoning": f"Recession: unemployment {unemployment:.0f}% — corp QE",
        }

    # BOOM: unemployment < 20% — absorb money, raise rates
    if unemployment < 20:
        return {
            "action": "absorb_money",
            "amount": 0.02,
            "policy_mode": "BOOM",
            "reasoning": f"Boom: unemployment {unemployment:.0f}% — tighten policy",
        }

    # NORMAL: hold rates (unemployment 20-50%, inflation 3-10%)
    if ctx.get("senate", {}).get("emergency_session"):
        qe = min(30_000.0, max(0, reserve - ZRS_RESERVE_FLOOR) * 0.03)
        return {
            "action": "stimulate_economy",
            "amount": qe,
            "policy_mode": "RECESSION",
            "reasoning": "Senate emergency session — lawful humanitarian corp QE",
        }

    return {
        "action": "tax_change",
        "amount": 5.0,
        "policy_mode": "NORMAL",
        "reasoning": f"Normal: unemployment {unemployment:.0f}%, inflation {inflation:.1f}%",
    }


def decide_frs_directive(cur, ctx: dict) -> dict:
    """FRS Chief sets monetary directive — sole authority over rates/policy_mode."""
    chief = get_frs_chief(cur)
    if not chief.get("is_active"):
        return {"action": "do_nothing", "reasoning": "No confirmed FRS Chief"}

    directive = _rule_based_directive(cur, ctx)
    cur.execute(
        """
        UPDATE frs_chief_state SET
            pending_directive = %s::jsonb,
            last_directive = %s::jsonb,
            updated_at = NOW()
        WHERE id = 1
        """,
        (json.dumps(directive), json.dumps(directive)),
    )
    return directive


def decrement_frs_term(cur):
    cur.execute(
        """
        UPDATE frs_chief_state SET
            term_cycles_remaining = GREATEST(0, term_cycles_remaining - 1),
            cycles_served = cycles_served + 1,
            is_active = CASE WHEN term_cycles_remaining > 1 THEN true ELSE false END,
            confirmation_status = CASE
                WHEN term_cycles_remaining > 1 THEN confirmation_status
                ELSE 'vacant'
            END,
            updated_at = NOW()
        WHERE id = 1 AND is_active = true
        """
    )


def _check_frs_chief_table(cur) -> None:
    print("FRS Chief: checking frs_chief_state table...", flush=True)
    try:
        cur.execute("SELECT COUNT(*) FROM frs_chief_state")
        print(f"FRS table OK: {cur.fetchone()}", flush=True)
    except Exception as e:
        print(f"FRS table missing: {e}", flush=True)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS frs_chief_state (
                id SERIAL PRIMARY KEY,
                agent_id INTEGER,
                agent_name VARCHAR(100),
                appointed_by VARCHAR(100),
                cycles_served INTEGER DEFAULT 0,
                max_cycles INTEGER DEFAULT 12,
                is_active BOOLEAN DEFAULT true,
                confirmed_by_senate BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            )
            """
        )
        cur.connection.commit()
        print("FRS table created", flush=True)


def run_frs_chief_tick(cur, ctx: dict) -> dict:
    """Step 1 of governance tick — independent monetary policy."""
    _check_frs_chief_table(cur)
    ensure_frs_chief(cur)
    chief = get_frs_chief(cur)
    president_step = ctx.get("president", {})

    if president_step.get("nominate_frs") and not chief.get("is_active"):
        from president import get_president

        pres = get_president(cur)
        if pres:
            nominate_frs_chief(cur, pres, ctx)

    directive = decide_frs_directive(cur, ctx)
    decrement_frs_term(cur)

    summary = (
        f"FRS Chief {chief.get('chief_name', 'vacant')}: "
        f"{directive.get('action')} — {directive.get('reasoning', '')[:80]}"
    )
    ctx["frs_chief"] = {"directive": directive, "summary": summary}
    return ctx


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    _check_frs_chief_table(cur)
    ctx: dict = {}
    try:
        run_frs_chief_tick(cur, ctx)
        conn.commit()
        print(ctx.get("frs_chief", {}))
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
