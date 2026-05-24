#!/usr/bin/env python3
"""ZION hourly tax cycle — genius progressive tax, population pressure, hunger."""
from datetime import datetime

from civ_common import (
    agent_class_from_balance,
    ensure_schema,
    get_conn,
    get_cursor,
    get_daily_food_cost,
    get_tax_collection_multiplier,
    get_zrs_state,
    hungry_agent_pct,
    log_event,
    route_food_spending,
    route_tax_revenue,
    settle_agent_death,
    zrs_deduct_reserve,
    zrs_reserve,
    ZRS_RESERVE_FLOOR,
)
from civ_economics import (
    calculate_agent_tax,
    get_population_food_multiplier,
    get_population_tax_multiplier,
    population_pressure_label,
    CORP_TAX_RATE,
)

DEBT_DEATH_THRESHOLD = 50.0
STARVATION_BALANCE_THRESHOLD = 10.0
ZRS_EMERGENCY_AID = 10.0


def hunger_check(cur, pop: int) -> tuple[int, int, float]:
    food_cost = get_daily_food_cost(cur) * get_population_food_multiplier(pop)
    deaths = 0
    hungry = 0
    food_spent = 0.0

    cur.execute(
        """
        SELECT id, name, balance, COALESCE(health, 100) AS health, class
        FROM agents WHERE is_alive = TRUE
        """
    )
    for ag in cur.fetchall():
        balance = float(ag["balance"] or 0)
        health = int(ag["health"] or 100)
        paid = min(food_cost, balance)
        balance = round(balance - paid, 4)
        food_spent += paid

        if paid < food_cost:
            health -= 15 if pop >= 500_000 else 10
            hungry += 1
            if health <= 0:
                settle_agent_death(cur, ag["id"])
                cur.execute(
                    """
                    UPDATE agents SET is_alive = FALSE, died_at = NOW(),
                        death_cause = 'starvation', health = 0
                    WHERE id = %s
                    """,
                    (ag["id"],),
                )
                deaths += 1
                log_event(
                    cur,
                    ag["id"],
                    "death",
                    f"💀 {ag['name']} died of starvation — could not afford food",
                    0,
                    priority="breaking",
                )
                continue

        cur.execute(
            "UPDATE agents SET balance = %s, health = %s WHERE id = %s",
            (balance, health, ag["id"]),
        )

    cur.execute(
        """
        UPDATE agents SET dust_days = dust_days + 1
        WHERE is_alive = true AND balance < %s
        """,
        (food_cost,),
    )
    cur.execute(
        """
        UPDATE agents SET dust_days = 0
        WHERE is_alive = true AND balance >= %s AND dust_days > 0
        """,
        (food_cost,),
    )

    if hungry > 0:
        cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
        total = max(int((cur.fetchone() or {}).get("c") or 0), 1)
        pct = round(hungry / total * 100, 1)
        if pct >= 10:
            log_event(
                cur,
                None,
                "tax",
                f"BREAKING: ECONOMIC COLLAPSE: {pct}% agents cannot afford food!",
                hungry,
                priority="breaking",
            )
    return deaths, hungry, food_spent


def apply_tax_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    zrs = get_zrs_state(cur) or {}
    tax_modifier_pct = float(zrs.get("tax_modifier") or 0) / 100.0
    tax_collection_mult = get_tax_collection_multiplier(cur)
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
    alive_count = int(cur.fetchone()["c"] or 0)
    pop_mult = get_population_tax_multiplier(alive_count)
    reserve = zrs_reserve(cur)

    if tax_collection_mult == 0:
        print("⚡ UPRISING: ANTI-TAX at 0 officers — no tax collection")

    starvation_deaths, hungry_count, total_food = hunger_check(cur, alive_count)

    cur.execute(
        "SELECT tax_relief_until FROM president_state WHERE is_active = true LIMIT 1"
    )
    relief_row = cur.fetchone()
    tax_relief_active = False
    if relief_row and relief_row.get("tax_relief_until"):
        cur.execute(
            "SELECT (tax_relief_until > NOW()) AS active FROM president_state WHERE is_active = true LIMIT 1"
        )
        tax_relief_active = bool((cur.fetchone() or {}).get("active"))

    cur.execute(
        """
        SELECT id, name, class, balance, COALESCE(debt, 0) AS debt
        FROM agents WHERE is_alive = TRUE
        """
    )
    agents = cur.fetchall()

    print(f"\n🌍 ZION Tax Cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(
        f"Processing {len(agents)} alive | Food×{get_population_food_multiplier(alive_count):.1f} | "
        f"Pop tax×{pop_mult} | Gini policy reserve {reserve:,.0f}\n"
    )

    total_tax = 0.0
    corp_tax_total = 0.0

    if tax_relief_active:
        log_event(
            cur,
            None,
            "tax",
            "Tax relief active — president cancelled collections this cycle",
            0,
            priority="urgent",
        )
        for ag in agents:
            cur.execute(
                "UPDATE agents SET age_days = COALESCE(age_days, 0) + 1 WHERE id = %s",
                (ag["id"],),
            )
    else:
        for ag in agents:
            balance = float(ag["balance"] or 0)
            debt = float(ag["debt"] or 0)
            tax_amount = calculate_agent_tax(ag, alive_count, reserve, tax_modifier_pct)

            paid = round(min(tax_amount, balance) * tax_collection_mult, 4)
            unpaid = round(tax_amount - paid, 4)
            new_balance = round(balance - paid, 4)
            new_debt = round(debt + unpaid, 4)

            if new_balance < STARVATION_BALANCE_THRESHOLD and new_debt > DEBT_DEATH_THRESHOLD:
                if zrs_reserve(cur) >= ZRS_RESERVE_FLOOR + ZRS_EMERGENCY_AID:
                    zrs_deduct_reserve(cur, ZRS_EMERGENCY_AID)
                    new_balance = ZRS_EMERGENCY_AID
                    log_event(
                        cur,
                        ag["id"],
                        "zrs",
                        f"ZRS emergency aid: {ag['name']} received {ZRS_EMERGENCY_AID} ZION",
                        ZRS_EMERGENCY_AID,
                        priority="urgent",
                    )
                else:
                    settle_agent_death(cur, ag["id"])
                    cur.execute(
                        """
                        UPDATE agents SET is_alive = FALSE, died_at = NOW(),
                            death_cause = 'starvation', debt = 0, health = 0
                        WHERE id = %s
                        """,
                        (ag["id"],),
                    )
                    starvation_deaths += 1
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
            ctax = round(rev * CORP_TAX_RATE * tax_collection_mult * pop_mult, 2)
            treasury = float(corp["treasury"] or 0)
            paid = min(ctax, max(treasury, 0))
            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                (paid, corp["id"]),
            )
            corp_tax_total += paid

    if total_food > 0:
        route_food_spending(cur, total_food)

    grand_total = total_tax + corp_tax_total
    if grand_total > 0:
        from political_economy import is_crisis_active, route_crisis_tax
        from senate_budget import allocate_from_tax

        if is_crisis_active(cur):
            route_crisis_tax(cur, grand_total)
            log_event(
                cur,
                None,
                "tax",
                f"CRISIS TAX: {grand_total:.0f} ZION → 100% sheriff budget",
                grand_total,
                priority="breaking",
            )
        else:
            senate_share = allocate_from_tax(cur, grand_total)
            remainder = round(grand_total - senate_share, 2)
            route_tax_revenue(cur, remainder)
            log_event(
                cur,
                None,
                "tax",
                f"Tax {grand_total:.0f} ZION (senate {senate_share:.0f}, routed {remainder:.0f})",
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
    print(
        f"\n📊 Tax: {grand_total:.0f} | Food: {total_food:.0f} | Hungry: {hungry_count} | "
        f"Deaths: {starvation_deaths} | Alive: {alive} | Pressure: {population_pressure_label(alive)}"
    )
    print("✅ Tax cycle complete!\n")
    cur.close()
    conn.close()


# Re-export for API compatibility
def get_population_tax_multiplier_reexport(pop=None):
    return get_population_tax_multiplier(pop)


if __name__ == "__main__":
    apply_tax_cycle()
