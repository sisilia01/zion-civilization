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
SALARY_PER_EMP = 3.0
BANKRUPTCY_CYCLES = 3


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
        revenue = round(emp * mult * random.uniform(0.8, 1.2), 2) if emp > 0 else 0.0
        loan_interest = round(float(corp["debt"] or 0) * (interest / 100), 2)
        expenses = round(emp * SALARY_PER_EMP + loan_interest, 2)

        treasury = float(corp["treasury"] or 0) + revenue - expenses
        if emp > 0 and revenue > expenses:
            pay_each = round((revenue - loan_interest) / max(emp, 1) * 0.3, 2)
            cur.execute(
                """
                UPDATE agents SET balance = balance + %s
                WHERE is_alive = true AND id IN (
                    SELECT id FROM agents WHERE is_alive = true
                    ORDER BY RANDOM() LIMIT %s
                )
                """,
                (min(pay_each, SALARY_PER_EMP * 2), emp),
            )

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

    extort_corps(cur)
    conn.commit()
    print(f"✅ Corporations cycle {cycle} complete!\n")
    cur.close()
    conn.close()


def extort_corps(cur):
    cur.execute(
        """
        SELECT c.id, c.name, c.treasury, ct.clan_id, cl.name AS clan_name
        FROM corporations c
        JOIN clan_territory ct ON ct.corp_id = c.id
        JOIN clans cl ON cl.id = ct.clan_id
        WHERE c.is_active = true
        """
    )
    for row in cur.fetchall():
        treasury = float(row["treasury"] or 0)
        if treasury < 5:
            continue
        tribute = round(treasury * 0.15, 2)
        if random.random() < 0.25:
            log_event(
                cur,
                None,
                "clan_war",
                f"⚔️ {row['clan_name']} attacked {row['name']} — refused tribute!",
                tribute,
                priority="urgent",
            )
            continue
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (tribute, row["id"]),
        )
        cur.execute(
            "UPDATE clans SET treasury = treasury + %s WHERE id = %s",
            (tribute, row["clan_id"]),
        )


if __name__ == "__main__":
    run_cycle()
