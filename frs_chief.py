#!/usr/bin/env python3
"""FRS Chief — independent central bank governor (USA Fed model)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from civ_common import (
    check_cooling_off,
    economy_snapshot,
    ensure_schema,
    get_conn,
    get_cursor,
    get_real_days_elapsed,
    get_term_days_remaining,
    log_cooling_off_block,
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
    """Ensure FRS Chief table exists — do NOT bypass president nomination + Senate confirmation."""
    ensure_schema(cur)
    cur.execute("SELECT confirmation_status FROM frs_chief_state WHERE id = 1")
    row = cur.fetchone()
    if not row:
        cur.execute(
            """
            INSERT INTO frs_chief_state (id, confirmation_status, is_active)
            VALUES (1, 'vacant', false)
            ON CONFLICT (id) DO NOTHING
            """
        )


def get_frs_chief(cur) -> dict:
    cur.execute("SELECT * FROM frs_chief_state WHERE id = 1")
    row = cur.fetchone()
    return dict(row) if row else {}


def nominate_frs_chief(cur, president: dict, ctx: dict) -> str:
    """President nominates FRS Chief when vacant or term ended."""
    from amendment_enforcer import get_param

    chief = get_frs_chief(cur)

    if chief.get("is_active") and chief.get("confirmed_at"):
        frs_term_days = float(get_param("frs_term_days", 6))
        days_remaining = get_term_days_remaining(chief["confirmed_at"], frs_term_days)
        if days_remaining > 0:
            print(
                f"FRS Chief {chief.get('chief_name')} still has "
                f"{days_remaining:.1f} days remaining — staggered "
                f"term protects independence",
                flush=True,
            )
            return "FRS Chief in office"

    if chief.get("confirmation_status") == "pending":
        return "Awaiting Senate confirmation"

    cur.execute(
        """
        SELECT id, name FROM agents
        WHERE is_alive = true AND class IN ('elite', 'rich', 'middle')
        ORDER BY balance DESC LIMIT 20
        """
    )
    candidate = None
    for row in cur.fetchall():
        if check_cooling_off(cur, row["id"], "frs_chief"):
            candidate = row
            break
        log_cooling_off_block(
            cur,
            row["id"],
            row["name"],
            "frs_chief",
            "Separation of Powers Act",
        )
    if not candidate:
        return "No FRS nominee — all top candidates in cooling-off period"
    name = candidate.get("name") or "Independent FRS Chair"
    aid = candidate.get("id")

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


def auto_nominate_if_long_vacant(cur) -> bool:
    """Если FRS Chief vacant 3+ тика — авто-номинация, не дожидаясь президента (защита от deadlock)."""
    cur.execute(
        """
        SELECT confirmation_status, is_active
        FROM frs_chief_state
        WHERE id = 1
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        return False

    status = row["confirmation_status"] if isinstance(row, dict) else row[0]
    is_active = row["is_active"] if isinstance(row, dict) else row[1]

    if is_active or status == "pending":
        return False

    if status != "vacant":
        return False

    cur.execute(
        """
        SELECT COUNT(*) AS vacant_ticks FROM events
        WHERE description LIKE '%%no_active_frs_chief%%'
          AND created_at > NOW() - INTERVAL '2 hours'
        """
    )
    vacant_count = int((cur.fetchone() or {}).get("vacant_ticks") or 0)
    if vacant_count < 3:
        return False

    cur.execute(
        """
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class IN ('elite', 'middle', 'working')
        ORDER BY balance DESC
        LIMIT 20
        """
    )
    for candidate in cur.fetchall():
        agent_id = candidate["id"] if isinstance(candidate, dict) else candidate[0]
        name = candidate["name"] if isinstance(candidate, dict) else candidate[1]
        if not check_cooling_off(cur, agent_id, "frs_chief"):
            log_cooling_off_block(
                cur,
                agent_id,
                name,
                "frs_chief",
                "Separation of Powers Act",
            )
            continue

        cur.execute(
            """
            UPDATE frs_chief_state SET
                agent_id = %s,
                chief_name = %s,
                nominated_by = NULL,
                confirmation_status = 'pending',
                term_cycles_remaining = 0,
                cycles_served = 0,
                is_active = false,
                appointed_at = NOW(),
                updated_at = NOW()
            WHERE id = 1
            """,
            (agent_id, name),
        )
        log_event(
            cur,
            agent_id,
            "zrs",
            f"🏦 AUTO-NOMINATION: {name} nominated for FRS Chief "
            f"(president step failed to nominate for 3+ ticks)",
            0,
            priority="urgent",
        )
        return True

    return False


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


def check_frs_term_expired(cur) -> bool:
    """End FRS Chief term by real calendar time (frs_term_days from confirmed_at)."""
    from amendment_enforcer import get_param

    chief = get_frs_chief(cur)
    if not chief.get("is_active"):
        return False

    confirmed_at = chief.get("confirmed_at")
    if not confirmed_at:
        return False

    frs_term_days = float(get_param("frs_term_days", 6))
    if get_term_days_remaining(confirmed_at, frs_term_days) > 0:
        return False

    days_served = get_real_days_elapsed(confirmed_at)
    name = chief.get("chief_name") or "FRS Chief"
    cur.execute(
        """
        UPDATE frs_chief_state SET
            is_active = false,
            confirmation_status = 'vacant',
            term_cycles_remaining = 0,
            updated_at = NOW()
        WHERE id = 1
        """
    )
    log_event(
        cur,
        chief.get("agent_id"),
        "economy",
        f"FRS Chief {name} completed {frs_term_days:.0f}-day term "
        f"({days_served:.1f} days served) — office vacant",
        0,
        priority="breaking",
    )
    print(
        f"FRS Chief {name} term ended ({days_served:.1f}d / {frs_term_days:.0f}d limit)",
        flush=True,
    )
    return True


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

    check_frs_term_expired(cur)
    chief = get_frs_chief(cur)
    directive = decide_frs_directive(cur, ctx)

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
