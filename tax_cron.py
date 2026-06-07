#!/usr/bin/env python3
"""ZION hourly tax cycle — genius progressive tax, population pressure, hunger."""
from datetime import datetime

from civ_common import (
    agent_class_from_balance,
    check_money_conservation,
    ensure_schema,
    get_conn,
    get_cursor,
    get_daily_food_cost,
    get_tax_collection_multiplier,
    get_zrs_state,
    hungry_agent_pct,
    log_event,
    route_food_spending,
    route_agent_tax_revenue,
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
)

DEBT_DEATH_THRESHOLD = 50.0
STARVATION_BALANCE_THRESHOLD = 10.0
ZRS_EMERGENCY_AID = 10.0


def hunger_check(cur, pop: int) -> tuple[int, int, float, set[int]]:
    food_cost = get_daily_food_cost(cur) * get_population_food_multiplier(pop)
    deaths = 0
    hungry = 0
    food_spent = 0.0
    hungry_ids: set[int] = set()

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
            hungry_ids.add(int(ag["id"]))
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
    return deaths, hungry, food_spent, hungry_ids


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

    starvation_deaths, hungry_count, total_food, hungry_ids = hunger_check(cur, alive_count)

    cur.execute(
        "UPDATE civilization_state SET starvation_deaths_hour = %s WHERE id = 1",
        (starvation_deaths,),
    )
    if starvation_deaths >= 100:
        from senate import trigger_emergency_session
        from zrs import execute_frs_directive

        trigger_emergency_session(
            cur,
            f"{starvation_deaths} starvation deaths this cycle — humanitarian crisis",
        )
        ctx_emergency = {"senate": {"emergency_session": True}}
        from frs_chief import decide_frs_directive

        decide_frs_directive(cur, ctx_emergency)
        execute_frs_directive(cur, ctx_emergency)
        log_event(
            cur,
            None,
            "senate",
            f"EMERGENCY: {starvation_deaths} starvation deaths — Senate session + FRS aid triggered",
            starvation_deaths,
            priority="breaking",
        )

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
    cur.execute(
        """
        SELECT COALESCE(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY balance),
            1
        ) AS med
        FROM agents
        WHERE is_alive = TRUE
        """
    )
    median_balance = float((cur.fetchone() or {}).get("med") or 1.0)

    print(f"\n🌍 ZION Tax Cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(
        f"Processing {len(agents)} alive | Food×{get_population_food_multiplier(alive_count):.1f} | "
        f"Pop tax×{pop_mult} | Gini policy reserve {reserve:,.0f}\n"
    )

    total_tax = 0.0

    if tax_relief_active:
        log_event(
            cur,
            None,
            "tax",
            "Tax relief active — poor/critical pay 50% less tax this cycle",
            0,
            priority="urgent",
        )

    for ag in agents:
        balance = float(ag["balance"] or 0)
        debt = float(ag["debt"] or 0)
        tax_amount = calculate_agent_tax(ag, alive_count, reserve, tax_modifier_pct)
        if tax_relief_active and (ag.get("class") in ("poor", "critical")):
            tax_amount = round(tax_amount * 0.5, 4)
        if int(ag["id"]) in hungry_ids:
            tax_amount = round(tax_amount * 0.5, 4)

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

        new_class = agent_class_from_balance(new_balance, median_balance=median_balance)
        cur.execute(
            """
            UPDATE agents SET balance = %s, debt = %s, class = %s,
                age_days = COALESCE(age_days, 0) + 1
            WHERE id = %s
            """
            ,
            (new_balance, new_debt, new_class, ag["id"]),
        )
        total_tax += paid

    # Corp tax (15% net profit) is collected in corporations.run_cycle() only.
    # Do not double-tax here.

    if total_food > 0:
        route_food_spending(cur, total_food)

    grand_total = total_tax
    if grand_total > 0:
        from political_economy import is_crisis_active, route_crisis_tax

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
            route_agent_tax_revenue(cur, grand_total)
            log_event(
                cur,
                None,
                "tax",
                f"Agent tax {grand_total:.0f} ZION → 40% senate, 30% state, 30% ZRS",
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

    check_money_conservation(cur, label="tax_cycle")
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
    from civ_common import run_db_script

    run_db_script(apply_tax_cycle, "Tax cycle")
