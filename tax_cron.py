#!/usr/bin/env python3
"""ZION hourly tax cycle — tiered rates, debt, corporate tax, revenue routing."""
import random
from datetime import datetime

from civ_common import (
    agent_class_from_balance,
    ensure_schema,
    get_conn,
    get_cursor,
    get_zrs_state,
    log_event,
    route_tax_revenue,
    tax_rate_for_balance,
)

DEBT_DEATH_THRESHOLD = 5.0
CORP_TAX_RATE = 0.10


def apply_tax_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    zrs = get_zrs_state(cur) or {}
    tax_modifier_pct = float(zrs.get("tax_modifier") or 0) / 100.0

    cur.execute(
        "SELECT id, name, class, balance, COALESCE(debt, 0) AS debt FROM agents WHERE is_alive = TRUE"
    )
    agents = cur.fetchall()

    print(f"\n🌍 ZION Tax Cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Processing {len(agents)} alive agents...\n")

    total_tax = 0.0
    starvation_deaths = 0
    debt_events = 0

    for ag in agents:
        balance = float(ag["balance"] or 0)
        debt = float(ag["debt"] or 0)
        rate = max(0.0, tax_rate_for_balance(balance) + tax_modifier_pct)
        tax_amount = round(balance * rate, 4)

        paid = min(tax_amount, balance)
        unpaid = round(tax_amount - paid, 4)
        new_balance = round(balance - paid, 4)
        new_debt = round(debt + unpaid, 4)

        if new_debt > DEBT_DEATH_THRESHOLD:
            cur.execute(
                """
                UPDATE agents SET is_alive = FALSE, died_at = NOW(),
                    death_cause = 'starvation', balance = 0, debt = 0
                WHERE id = %s
                """,
                (ag["id"],),
            )
            starvation_deaths += 1
            log_event(
                cur,
                ag["id"],
                "death",
                f"💀 {ag['name']} died of starvation — tax debt exceeded {DEBT_DEATH_THRESHOLD} ZION",
                new_debt,
                priority="breaking",
            )
            print(f"💀 {ag['name']} STARVED (debt {new_debt:.2f} ZION)")
            continue

        new_class = agent_class_from_balance(new_balance)
        cur.execute(
            """
            UPDATE agents SET balance = %s, debt = %s, class = %s,
                dust_days = CASE WHEN %s < 1 THEN dust_days + 1 ELSE 0 END,
                age_days = age_days + 1
            WHERE id = %s
            """,
            (new_balance, new_debt, new_class, new_balance, ag["id"]),
        )
        total_tax += paid

        if unpaid > 0.01:
            debt_events += 1
            if debt_events <= 5:
                print(f"⚠️  {ag['name']}: owed {unpaid:.2f} → debt {new_debt:.2f}")

    corp_tax_total = 0.0
    cur.execute(
        """
        SELECT id, name, COALESCE(last_cycle_revenue, revenue, 0) AS rev
        FROM corporations WHERE is_active = TRUE
        """
    )
    for corp in cur.fetchall():
        rev = float(corp["rev"] or 0)
        if rev <= 0:
            continue
        ctax = round(rev * CORP_TAX_RATE, 2)
        cur.execute(
            "SELECT treasury FROM corporations WHERE id = %s",
            (corp["id"],),
        )
        treasury = float(cur.fetchone()["treasury"] or 0)
        paid = min(ctax, max(treasury, 0))
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (paid, corp["id"]),
        )
        corp_tax_total += paid

    grand_total = total_tax + corp_tax_total
    if grand_total > 0:
        pres, zrs, sheriff, burned = route_tax_revenue(cur, grand_total)
        log_event(
            cur,
            None,
            "tax",
            f"Tax collected {grand_total:.0f} ZION — President {pres:.0f} | ZRS {zrs:.0f} | "
            f"Sheriff {sheriff:.0f} | Burned {burned:.0f}",
            grand_total,
            priority="normal",
        )

    if starvation_deaths >= 3:
        log_event(
            cur,
            None,
            "tax",
            f"TRAGEDY: {starvation_deaths} agents died of tax starvation this cycle",
            starvation_deaths,
            priority="breaking",
        )
    elif grand_total > 5000:
        log_event(
            cur,
            None,
            "tax",
            f"Record tax haul: {grand_total:.0f} ZION collected from {len(agents)} citizens",
            grand_total,
            priority="urgent",
        )

    conn.commit()
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()["c"]
    print(f"\n📊 Tax: {grand_total:.0f} ZION | Starvation deaths: {starvation_deaths} | Alive: {alive}")
    print("✅ Tax cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    apply_tax_cycle()
