#!/usr/bin/env python3
"""ZION Corporations — revenue, payroll, ZRS loans, gang extortion, bankruptcy."""
import random
from datetime import datetime

from civ_common import (
    SECTOR_MULTIPLIERS,
    ensure_schema,
    get_conn,
    get_cursor,
    get_zrs_state,
    log_event,
)

MAX_LOAN = 5000.0
MIN_LOAN = 100.0
SALARY_PER_EMP = 1.2  # payroll circulates to agents (see pay_payroll)
BASE_REVENUE_PER_EMP = 2.0  # floor so revenue can exceed payroll at typical headcount
BANKRUPTCY_CYCLES = 3


def pay_payroll(cur, emp: int, salary_pool: float) -> float:
    """Pay employees from corp treasury — keeps ZION in agent circulation."""
    if emp <= 0 or salary_pool <= 0:
        return 0.0
    per_emp = round(salary_pool / emp, 4)
    cur.execute(
        """
        UPDATE agents SET balance = balance + %s
        WHERE id IN (
            SELECT id FROM agents WHERE is_alive = true
            ORDER BY RANDOM() LIMIT %s
        )
        """,
        (per_emp, emp),
    )
    return round(per_emp * emp, 2)


def ensure_corp_tables(cur):
    ensure_schema(cur)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS corporation_meta (
            id INTEGER PRIMARY KEY DEFAULT 1,
            cycle INTEGER DEFAULT 0
        )
        """
    )
    cur.execute(
        "INSERT INTO corporation_meta (id, cycle) VALUES (1, 0) ON CONFLICT (id) DO NOTHING"
    )


def next_cycle(cur):
    cur.execute(
        "UPDATE corporation_meta SET cycle = cycle + 1 WHERE id = 1 RETURNING cycle"
    )
    row = cur.fetchone()
    return int(row["cycle"] if row else 1)


def sector_multiplier(corp_type: str) -> float:
    return SECTOR_MULTIPLIERS.get(corp_type or "industry", 1.0)


def run_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_corp_tables(cur)
    conn.commit()

    print(f"\n🏢 ZION Corporations — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    cycle = next_cycle(cur)
    zrs = get_zrs_state(cur) or {}
    interest = float(zrs.get("interest_rate") or 6.0)
    loans_frozen = bool(zrs.get("loans_frozen"))

    cur.execute(
        """
        SELECT id, name, corp_type, employees, treasury,
               COALESCE(debt, 0) AS debt, COALESCE(negative_cycles, 0) AS negative_cycles,
               controlled_by_clan_id
        FROM corporations WHERE is_active = true
        """
    )
    corps = cur.fetchall()

    for corp in corps:
        emp = int(corp["employees"] or 0)
        mult = sector_multiplier(corp["corp_type"])
        raw_rev = emp * mult * random.uniform(0.8, 1.2) if emp > 0 else 0.0
        revenue = round(max(raw_rev, emp * BASE_REVENUE_PER_EMP * mult * 0.5), 2) if emp > 0 else 0.0
        loan_interest = round(float(corp["debt"] or 0) * (interest / 100), 2)
        salary_pool = round(emp * SALARY_PER_EMP, 2)
        expenses = salary_pool + loan_interest

        treasury = float(corp["treasury"] or 0) + revenue - expenses
        pay_payroll(cur, emp, salary_pool)

        neg = int(corp["negative_cycles"] or 0)
        if treasury < 0:
            neg += 1
        else:
            neg = 0

        cur.execute(
            """
            UPDATE corporations SET
                treasury = %s, revenue = revenue + %s, last_cycle_revenue = %s,
                negative_cycles = %s
            WHERE id = %s
            """,
            (treasury, revenue, revenue, neg, corp["id"]),
        )

        if revenue > 500:
            log_event(
                cur,
                None,
                "corporation",
                f"📈 {corp['name']} strong quarter: +{revenue:.0f} ZION revenue",
                revenue,
                priority="normal",
            )

        if neg >= BANKRUPTCY_CYCLES:
            cur.execute(
                "UPDATE corporations SET is_active = false, employees = 0 WHERE id = %s",
                (corp["id"],),
            )
            cur.execute(
                "DELETE FROM clan_territory WHERE corp_id = %s", (corp["id"],)
            )
            log_event(
                cur,
                None,
                "corporation",
                f"💥 {corp['name']} BANKRUPT! Treasury negative {BANKRUPTCY_CYCLES} cycles. "
                f"{emp} workers unemployed",
                0,
                priority="breaking",
            )
            print(f"💥 BANKRUPT: {corp['name']}")

    if not loans_frozen:
        cur.execute(
            """
            SELECT id, name, treasury, employees FROM corporations
            WHERE is_active = true AND treasury < 200 AND employees > 0
            AND id NOT IN (SELECT corp_id FROM zrs_loans WHERE is_active = true AND corp_id IS NOT NULL)
            ORDER BY treasury ASC LIMIT 2
            """
        )
        for corp in cur.fetchall():
            principal = round(min(MAX_LOAN, max(MIN_LOAN, random.uniform(200, 1500))), 2)
            cur.execute(
                """
                INSERT INTO zrs_loans (corp_id, corp_name, principal, amount_owed, interest_rate, issued_cycle)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (corp["id"], corp["name"], principal, principal, interest, cycle),
            )
            cur.execute(
                "UPDATE corporations SET treasury = treasury + %s, debt = debt + %s WHERE id = %s",
                (principal, principal, corp["id"]),
            )
            log_event(
                cur,
                None,
                "corporation",
                f"🏦 ZRS loaned {corp['name']} {principal:.0f} ZION at {interest}%",
                principal,
                priority="urgent",
            )

    cur.execute(
        """
        SELECT l.id, l.corp_id, l.corp_name, l.principal, l.amount_owed, l.missed_payments,
               c.treasury
        FROM zrs_loans l JOIN corporations c ON c.id = l.corp_id
        WHERE l.is_active = true
        """
    )
    for loan in cur.fetchall():
        payment = round(float(loan["principal"]) * 0.10, 2)
        treasury = float(loan["treasury"] or 0)
        if treasury >= payment:
            new_principal = round(float(loan["principal"]) - payment, 2)
            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s, debt = GREATEST(0, debt - %s) WHERE id = %s",
                (payment, payment, loan["corp_id"]),
            )
            if new_principal <= 0.01:
                cur.execute("UPDATE zrs_loans SET is_active = false WHERE id = %s", (loan["id"],))
            else:
                cur.execute(
                    "UPDATE zrs_loans SET principal = %s, amount_owed = %s, missed_payments = 0 WHERE id = %s",
                    (new_principal, new_principal, loan["id"]),
                )
        else:
            missed = int(loan["missed_payments"] or 0) + 1
            if missed >= 3:
                cur.execute("UPDATE corporations SET is_active = false WHERE id = %s", (loan["corp_id"],))
                cur.execute("UPDATE zrs_loans SET is_active = false WHERE id = %s", (loan["id"],))
                log_event(
                    cur,
                    None,
                    "corporation",
                    f"💥 {loan['corp_name']} BANKRUPT — loan called after 3 missed payments",
                    float(loan["amount_owed"]),
                    priority="breaking",
                )
            else:
                cur.execute(
                    "UPDATE zrs_loans SET missed_payments = %s WHERE id = %s",
                    (missed, loan["id"]),
                )

    conn.commit()
    print(f"✅ Corporations cycle {cycle} complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run_cycle()
