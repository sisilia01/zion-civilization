#!/usr/bin/env python3
"""ZION hourly tax cycle — tiered rates, ZRS-modified, starvation with emergency aid."""
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
    zrs_deduct_reserve,
    zrs_reserve,
    ZRS_RESERVE_FLOOR,
)

DEBT_DEATH_THRESHOLD = 50.0
STARVATION_BALANCE_THRESHOLD = 10.0  # only destitute agents (< 10 ZION) can starve
CORP_TAX_RATE = 0.08
ZRS_EMERGENCY_AID = 10.0


def apply_tax_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    zrs = get_zrs_state(cur) or {}
    tax_modifier_pct = float(zrs.get("tax_modifier") or 0) / 100.0

    cur.execute(
        """
        SELECT id, name, class, balance, COALESCE(debt, 0) AS debt
        FROM agents WHERE is_alive = TRUE
        """
    )
    agents = cur.fetchall()

    print(f"\n🌍 ZION Tax Cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Processing {len(agents)} alive agents | ZRS modifier +{tax_modifier_pct*100:.1f}%\n")

    total_tax = 0.0
    starvation_deaths = 0

    for ag in agents:
        balance = float(ag["balance"] or 0)
        debt = float(ag["debt"] or 0)
        base_rate = tax_rate_for_balance(balance)
        rate = max(0.0, base_rate + tax_modifier_pct)
        tax_amount = round(balance * rate, 4)

        paid = min(tax_amount, balance)
        unpaid = round(tax_amount - paid, 4)
        new_balance = round(balance - paid, 4)
        new_debt = round(debt + unpaid, 4)

        if new_balance < STARVATION_BALANCE_THRESHOLD and new_debt > DEBT_DEATH_THRESHOLD:
            if zrs_reserve(cur) >= ZRS_RESERVE_FLOOR + ZRS_EMERGENCY_AID:
                zrs_deduct_reserve(cur, ZRS_EMERGENCY_AID)
                new_balance = ZRS_EMERGENCY_AID
                new_debt = new_debt
                log_event(
                    cur,
                    ag["id"],
                    "zrs",
                    f"ZRS emergency aid: {ag['name']} received {ZRS_EMERGENCY_AID} ZION before starvation",
                    ZRS_EMERGENCY_AID,
                    priority="urgent",
                )
            else:
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
                    f"💀 {ag['name']} died of starvation — balance 0, debt {new_debt:.0f} ZION",
                    new_debt,
                    priority="breaking",
                )
                print(f"💀 {ag['name']} STARVED")
                continue

        new_class = agent_class_from_balance(new_balance)
        cur.execute(
            """
            UPDATE agents SET balance = %s, debt = %s, class = %s,
                age_days = COALESCE(age_days, 0) + 1
            WHERE id = %s
            """,
            (new_balance, new_debt, new_class, ag["id"]),
        )
        total_tax += paid

    corp_tax_total = 0.0
    cur.execute(
        """
        SELECT id, name, COALESCE(last_cycle_revenue, revenue, 0) AS rev, treasury
        FROM corporations WHERE is_active = TRUE
        """
    )
    for corp in cur.fetchall():
        rev = float(corp["rev"] or 0)
        if rev <= 0:
            continue
        ctax = round(rev * CORP_TAX_RATE, 2)
        treasury = float(corp["treasury"] or 0)
        paid = min(ctax, max(treasury, 0))
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (paid, corp["id"]),
        )
        corp_tax_total += paid

    grand_total = total_tax + corp_tax_total
    if grand_total > 0:
        pres, zrs_amt, sheriff, burned = route_tax_revenue(cur, grand_total)
        log_event(
            cur,
            None,
            "tax",
            f"Tax {grand_total:.0f} ZION — President {pres:.0f} | ZRS {zrs_amt:.0f} | "
            f"Sheriff {sheriff:.0f} | Burned {burned:.0f}",
            grand_total,
            priority="normal",
        )

    if starvation_deaths >= 3:
        log_event(
            cur,
            None,
            "tax",
            f"TRAGEDY: {starvation_deaths} agents died of starvation this cycle",
            starvation_deaths,
            priority="breaking",
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
