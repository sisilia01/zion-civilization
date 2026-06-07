#!/usr/bin/env python3
"""ZION Senate Budget — 10% tax allocation, investigations, social programs."""
from __future__ import annotations

import random
from datetime import datetime

from civ_common import (
    ensure_schema,
    get_conn,
    get_cursor,
    log_event,
)
from political_economy import is_crisis_active

SENATE_TAX_SHARE = 0.10


def get_budget(cur) -> dict:
    cur.execute("SELECT * FROM senate_budget WHERE id = 1")
    row = cur.fetchone()
    return dict(row) if row else {"balance": 0}


def allocate_from_tax(cur, total_tax: float) -> float:
    """Senate receives 10% of tax revenue (skipped during crisis)."""
    if is_crisis_active(cur):
        return 0.0
    share = round(float(total_tax) * SENATE_TAX_SHARE, 2)
    if share <= 0:
        return 0.0
    cur.execute(
        """
        INSERT INTO senate_budget (id, balance, total_received)
        VALUES (1, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            balance = senate_budget.balance + EXCLUDED.balance,
            total_received = senate_budget.total_received + EXCLUDED.total_received,
            updated_at = NOW()
        """,
        (share, share),
    )
    return share


def spend_investigation(cur, cost: float = 500.0) -> bool:
    budget = get_budget(cur)
    if float(budget.get("balance") or 0) < cost:
        return False
    cur.execute(
        """
        UPDATE senate_budget SET balance = balance - %s, total_spent = total_spent + %s
        WHERE id = 1
        """,
        (cost, cost),
    )
    cur.execute(
        """
        UPDATE president_state SET
            approval_rating = GREATEST(0, approval_rating - 10),
            personal_fund = GREATEST(0, personal_fund - %s)
        WHERE is_active = true
        """,
        (cost * 0.5,),
    )
    log_event(
        cur,
        None,
        "senate",
        f"Senate investigation costs president {cost:.0f} ZION in political capital",
        cost,
        priority="urgent",
    )
    return True


def spend_social_programs(cur, cost: float = 1000.0) -> bool:
    budget = get_budget(cur)
    if float(budget.get("balance") or 0) < cost:
        return False
    cur.execute(
        """
        UPDATE senate_budget SET
            balance = balance - %s,
            total_spent = total_spent + %s,
            social_programs_active = true
        WHERE id = 1
        """,
        (cost, cost),
    )
    cur.execute(
        """
        UPDATE agents SET balance = balance + %s
        WHERE id IN (
            SELECT id FROM agents WHERE is_alive = true AND class IN ('poor', 'critical')
            ORDER BY balance ASC LIMIT 100
        )
        """,
        (cost / 100,),
    )
    cur.execute(
        """
        UPDATE crisis_state SET social_debt = GREATEST(0, social_debt - %s) WHERE id = 1
        """,
        (cost * 0.5,),
    )
    cur.execute(
        """
        UPDATE president_state SET approval_rating = LEAST(100, approval_rating + 5)
        WHERE is_active = true
        """
    )
    log_event(
        cur,
        None,
        "senate",
        f"Senate social programs: {cost:.0f} ZION to poor — approval +5, social debt reduced",
        cost,
        priority="normal",
    )
    return True


def spend_emergency_session(cur, cost: float = 300.0) -> bool:
    budget = get_budget(cur)
    if float(budget.get("balance") or 0) < cost:
        return False
    cur.execute(
        """
        UPDATE senate_budget SET
            balance = balance - %s,
            total_spent = total_spent + %s,
            president_blocked_until = NOW() + INTERVAL '1 hour',
            laws_blocked_this_month = laws_blocked_this_month + 1
        WHERE id = 1
        """,
        (cost, cost),
    )
    log_event(
        cur,
        None,
        "senate",
        "Senate emergency session blocks president actions for 1 cycle",
        cost,
        priority="urgent",
    )
    return True


def spend_bribe_senators(cur, cost: float = 400.0) -> bool:
    budget = get_budget(cur)
    if float(budget.get("balance") or 0) < cost:
        return False
    cur.execute(
        """
        UPDATE senate_budget SET balance = balance - %s, total_spent = total_spent + %s
        WHERE id = 1
        """,
        (cost, cost),
    )
    cur.execute(
        """
        UPDATE senate SET approval_rating = LEAST(100, approval_rating + 10)
        WHERE id IN (
            SELECT id FROM senate WHERE is_active = true
            AND party_id != COALESCE((SELECT party FROM president_state WHERE is_active = true LIMIT 1), '')
            LIMIT 3
        )
        """
    )
    log_event(
        cur,
        None,
        "senate",
        f"Senate cross-party bribes (+10 approval to swing senators) — {cost:.0f} ZION",
        cost,
        priority="normal",
    )
    return True


def emergency_police_loan(cur) -> float:
    """Issue emergency ZRS loan to police during near-anarchy."""
    cur.execute(
        "SELECT police_budget, police_count FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    sheriff = cur.fetchone()
    if not sheriff:
        return 0.0

    police_budget = float(sheriff.get("police_budget") or 0)
    police_count = int(sheriff.get("police_count") or 0)

    cur.execute("SELECT COALESCE(SUM(members_count), 0) AS gang_total FROM clans WHERE members_count > 0")
    gang_total = int((cur.fetchone() or {}).get("gang_total") or 0)

    anarchy_threshold = gang_total > police_count * 5
    budget_critical = police_budget < 500
    if not (anarchy_threshold and budget_critical):
        return 0.0

    cur.execute("SELECT reserve FROM zrs_state LIMIT 1")
    row = cur.fetchone()
    zrs = float(row.get("reserve") or 0) if row else 0.0
    if zrs <= 50000:
        return 0.0

    loan_amount = min(20000.0, zrs * 0.05)
    interest_rate = 0.10
    repayment = loan_amount * (1 + interest_rate)

    cur.execute(
        "UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active = true",
        (loan_amount,),
    )
    cur.execute(
        "UPDATE zrs_state SET reserve = reserve - %s",
        (loan_amount,),
    )
    cur.execute(
        """
        INSERT INTO active_effects (effect_type, expires_at, metadata)
        VALUES ('POLICE_LOAN', NOW() + INTERVAL '30 days', %s::jsonb)
        """,
        (
            (
                '{"repayment": '
                + str(round(repayment, 2))
                + ', "loan_amount": '
                + str(round(loan_amount, 2))
                + ', "interest_rate": '
                + str(round(interest_rate, 4))
                + "}"
            ),
        ),
    )
    log_event(
        cur,
        None,
        "zrs",
        f"ZRS EMERGENCY LOAN: {loan_amount:.0f} ZION to police at {interest_rate*100:.0f}% interest. "
        f"Gang ratio: {gang_total}/{police_count}. Repayment: {repayment:.0f} ZION in 30 days",
        loan_amount,
        priority="urgent",
    )
    return loan_amount


def process_police_loan_repayments(cur) -> int:
    """Repay or roll over expired POLICE_LOAN effects."""
    cur.execute(
        """
        SELECT id, metadata FROM active_effects
        WHERE effect_type = 'POLICE_LOAN' AND expires_at < NOW()
        """
    )
    loans = cur.fetchall()
    processed = 0
    for loan in loans:
        metadata = loan.get("metadata") or {}
        repayment = float(metadata.get("repayment") or 0)
        if repayment <= 0:
            cur.execute("DELETE FROM active_effects WHERE id = %s", (loan["id"],))
            processed += 1
            continue
        cur.execute("SELECT police_budget FROM sheriff_state WHERE is_active = true LIMIT 1")
        pb = cur.fetchone()
        if pb and float(pb.get("police_budget") or 0) >= repayment:
            cur.execute(
                "UPDATE sheriff_state SET police_budget = police_budget - %s WHERE is_active = true",
                (repayment,),
            )
            cur.execute(
                "UPDATE zrs_state SET reserve = reserve + %s",
                (repayment,),
            )
            cur.execute("DELETE FROM active_effects WHERE id = %s", (loan["id"],))
            log_event(cur, None, "zrs", f"Police repaid ZRS loan: {repayment:.0f} ZION", repayment)
        else:
            cur.execute(
                """
                UPDATE active_effects
                SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{repayment}',
                        to_jsonb(%s::numeric)
                    ),
                    expires_at = NOW() + INTERVAL '7 days'
                WHERE id = %s
                """,
                (round(repayment * 1.1, 2), loan["id"]),
            )
            log_event(
                cur,
                None,
                "zrs",
                f"Police defaulted on ZRS loan! Penalty added. New debt: {repayment*1.1:.0f} ZION",
                repayment,
                priority="urgent",
            )
        processed += 1
    return processed


def appropriate_police_budget(cur) -> float:
    """Congress appropriates police funding from senate_budget (USA model)."""
    budget = get_budget(cur)
    balance = float(budget.get("balance") or 0)
    if balance < 500:
        return 0.0
    try:
        from political_economy import compute_macro_metrics

        metrics = compute_macro_metrics(cur)
        crime = float(metrics.get("crime_rate") or 0)
        unemployment = float(metrics.get("unemployment_rate") or 0)
    except Exception:
        crime, unemployment = 0.0, 0.0
    if crime < 0.3 and unemployment < 50:
        return 0.0
    amount = round(min(balance * 0.20, 5000.0), 2)
    if amount <= 0:
        return 0.0
    cur.execute(
        "UPDATE senate_budget SET balance = balance - %s, total_spent = total_spent + %s WHERE id = 1",
        (amount, amount),
    )
    cur.execute(
        "UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active = true",
        (amount,),
    )
    log_event(
        cur,
        None,
        "senate",
        f"Congress appropriated {amount:.0f} ZION to police budget",
        amount,
        priority="normal",
    )
    return amount


def run_budget_cycle(cur) -> None:
    """Auto-spend senate budget based on civilization needs."""
    budget = get_budget(cur)
    balance = float(budget.get("balance") or 0)
    if balance < 200:
        return

    cur.execute("SELECT social_debt, unemployment_rate FROM crisis_state WHERE id = 1")
    crisis = cur.fetchone() or {}
    social_debt = float(crisis.get("social_debt") or 0)
    unemployment = float(crisis.get("unemployment_rate") or 0)

    roll = random.random()
    appropriate_police_budget(cur)
    if social_debt > 1000 and roll < 0.4:
        spend_social_programs(cur, min(1000, balance * 0.3))
    elif unemployment > 60 and roll < 0.35:
        spend_social_programs(cur, min(800, balance * 0.25))
    elif roll < 0.25:
        spend_investigation(cur, min(500, balance * 0.2))
    elif roll < 0.40:
        spend_emergency_session(cur, min(300, balance * 0.15))
    elif roll < 0.55:
        spend_bribe_senators(cur, min(400, balance * 0.15))


def run_cycle() -> dict:
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    process_police_loan_repayments(cur)
    emergency_police_loan(cur)
    run_budget_cycle(cur)
    budget = get_budget(cur)
    conn.commit()
    cur.close()
    conn.close()
    return {"balance": float(budget.get("balance") or 0)}


def main():
    print(f"\n💰 ZION Senate Budget — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    try:
        result = run_cycle()
    except Exception as exc:
        print(f"❌ Senate budget cycle failed: {exc}")
        print("⚠️ Check PostgreSQL connection settings in civ_common.py and DB service status.\n")
        return
    print(f"  Senate balance: {result['balance']:.0f} ZION")
    print("✅ Senate budget cycle complete!\n")


if __name__ == "__main__":
    main()
