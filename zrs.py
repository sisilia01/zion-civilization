#!/usr/bin/env python3
"""ZION Reserve System (ZRS) — central bank with 400k reserve (1M supply), inject/absorb."""
from datetime import datetime

from civ_common import (
    ZRS_RESERVE_FLOOR,
    ensure_schema,
    economy_snapshot,
    get_conn,
    get_cursor,
    log_event,
    zrs_add_reserve,
    zrs_deduct_reserve,
    zrs_reserve,
)

RESERVE_FLOOR = ZRS_RESERVE_FLOOR
BOOM_ABSORB_RATE = 0.05
HYPER_ABSORB_RATE = 0.20


def determine_state(econ: dict, consecutive_crisis: int) -> str:
    """Thresholds for 1M supply (~130 avg per agent)."""
    avg = econ["avg_balance"]
    poor = econ["poverty_pct"]

    if avg > 1_000:
        return "HYPERINFLATION"
    if consecutive_crisis >= 2:
        return "DEPRESSION"
    if avg > 200 and poor < 20:
        return "BOOM"
    if 50 <= avg <= 200:
        return "NORMAL"
    if 10 <= avg < 50 and poor > 40:
        return "RECESSION"
    if avg < 10 and poor > 60:
        return "CRISIS"
    if poor > 60:
        return "CRISIS"
    if avg < 50 and poor > 40:
        return "RECESSION"
    if 50 <= avg <= 200:
        return "NORMAL"
    if avg > 200:
        return "BOOM"
    return "RECESSION"


def interest_for_state(state: str) -> float:
    return {
        "BOOM": 10.0,
        "NORMAL": 5.0,
        "RECESSION": 3.0,
        "CRISIS": 0.0,
        "DEPRESSION": 0.0,
        "HYPERINFLATION": 0.0,
    }.get(state, 5.0)


def inject_to_agents(cur, amount: float, where_sql: str = "is_alive = true") -> tuple[int, float]:
    cur.execute(f"SELECT COUNT(*) AS c FROM agents WHERE {where_sql}")
    n = int(cur.fetchone()["c"] or 0)
    total = amount * n
    if n == 0 or total <= 0:
        return 0, 0.0
    if not zrs_deduct_reserve(cur, total):
        return 0, 0.0
    cur.execute(
        f"UPDATE agents SET balance = balance + %s WHERE {where_sql}",
        (amount,),
    )
    return n, total


def record_zrs_policy(
    cur,
    state: str,
    action: str,
    amount: float,
    headline: str,
    econ: dict | None = None,
    rate: float = 0.0,
):
    """Always log latest ZRS action for API / eco-pol (ORDER BY created_at DESC)."""
    cur.execute(
        """
        INSERT INTO zrs_policy (
            state, action_taken, amount, news_headline, created_at,
            avg_balance, poverty_pct, corp_treasury_total, inflation_index,
            interest_rate, policy_mode, poor_pct, total_money
        ) VALUES (%s, %s, %s, %s, NOW(), %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            state,
            action,
            round(amount, 2),
            headline,
            round((econ or {}).get("avg_balance", 0), 2),
            round((econ or {}).get("poverty_pct", 0), 2),
            round((econ or {}).get("corp_treasury_total", 0), 2),
            (econ or {}).get("inflation_index", 0),
            rate,
            state,
            round((econ or {}).get("poverty_pct", 0), 2),
            round((econ or {}).get("total_money", 0), 2),
        ),
    )


def absorb_from_agents(cur, rate: float) -> float:
    cur.execute(
        "SELECT id, balance FROM agents WHERE is_alive = true AND balance > 0"
    )
    absorbed = 0.0
    for ag in cur.fetchall():
        bal = float(ag["balance"] or 0)
        take = round(bal * rate, 4)
        if take <= 0:
            continue
        cur.execute(
            "UPDATE agents SET balance = balance - %s WHERE id = %s",
            (take, ag["id"]),
        )
        absorbed += take
    if absorbed > 0:
        zrs_add_reserve(cur, absorbed)
    return absorbed


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🏦 ZION Reserve System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    econ = economy_snapshot(cur)
    cur.execute("SELECT * FROM zrs_state WHERE id = 1")
    zrs = cur.fetchone() or {}
    prev_mode = zrs.get("prev_policy_mode") or zrs.get("policy_mode") or "NORMAL"
    consecutive = int(zrs.get("consecutive_crisis") or 0)

    state = determine_state(econ, consecutive)
    if state == "CRISIS":
        consecutive += 1
    elif state != "DEPRESSION":
        consecutive = 0

    rate = interest_for_state(state)
    tax_mod = 0.0
    loans_frozen = False
    action = "HOLD"
    amount = 0.0
    headline = ""

    reserve_before = zrs_reserve(cur)

    if state == "BOOM":
        tax_mod = 5.0
        absorbed = absorb_from_agents(cur, BOOM_ABSORB_RATE)
        amount = absorbed
        action = "ABSORB"
        headline = "ZRS TIGHTENING: Absorbing 5% excess liquidity"
        log_event(
            cur,
            None,
            "zrs",
            headline,
            absorbed,
            priority="urgent",
        )
    elif state == "NORMAL":
        action = "HOLD"
        headline = f"ZRS NORMAL: Interest {rate}%. Minor adjustments only."
        log_event(cur, None, "zrs", headline, 0, priority="normal")
    elif state == "RECESSION":
        tax_mod = -2.0
        n, total = inject_to_agents(
            cur,
            20.0,
            "is_alive = true AND balance < 10",
        )
        amount = total
        action = "INJECT_SMALL"
        headline = f"ZRS STIMULUS: Injecting liquidity to support economy ({n} poor agents)"
        log_event(cur, None, "zrs", headline, total, priority="urgent")
    elif state == "CRISIS":
        n, total = inject_to_agents(cur, 100.0)
        amount = total
        action = "INJECT_LARGE"
        headline = "ZRS EMERGENCY QE: Major liquidity injection!"
        log_event(cur, None, "zrs", headline, total, priority="breaking")

        cur.execute(
            """
            SELECT id, name, treasury FROM corporations
            WHERE is_active = true ORDER BY treasury ASC LIMIT 3
            """
        )
        bailouts = 0.0
        for corp in cur.fetchall():
            if zrs_deduct_reserve(cur, 10000.0):
                cur.execute(
                    "UPDATE corporations SET treasury = treasury + 10000 WHERE id = %s",
                    (corp["id"],),
                )
                bailouts += 10000.0
                log_event(
                    cur,
                    None,
                    "zrs",
                    f"ZRS bailout: {corp['name']} +10000 ZION",
                    10000,
                    priority="urgent",
                )
        amount += bailouts
    elif state == "DEPRESSION":
        cur.execute("SELECT COUNT(*) AS c FROM corporations WHERE is_active = true")
        corp_n = int(cur.fetchone()["c"] or 0)
        cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
        agent_n = int(cur.fetchone()["c"] or 0)
        corp_cost = corp_n * 20000.0
        agent_cost = agent_n * 500.0
        if zrs_reserve(cur) >= RESERVE_FLOOR + agent_cost + corp_cost:
            zrs_deduct_reserve(cur, agent_cost)
            cur.execute(
                "UPDATE agents SET balance = balance + 500, debt = 0 WHERE is_alive = true"
            )
            zrs_deduct_reserve(cur, corp_cost)
            cur.execute(
                "UPDATE corporations SET treasury = treasury + 20000 WHERE is_active = true"
            )
            amount = agent_cost + corp_cost
            n = agent_n
        else:
            n, amount = inject_to_agents(cur, 500.0)
            cur.execute("UPDATE agents SET debt = 0 WHERE is_alive = true")
        action = "MEGA_INJECT"
        headline = "ZRS DEPRESSION PROTOCOL: Maximum stimulus activated!"
        log_event(cur, None, "zrs", headline, amount, priority="breaking")
        rate = 0.0
    elif state == "HYPERINFLATION":
        tax_mod = 20.0
        loans_frozen = True
        absorbed = absorb_from_agents(cur, HYPER_ABSORB_RATE)
        amount = absorbed
        action = "ABSORB_AGGRESSIVE"
        headline = "ZRS EMERGENCY: Hyperinflation detected! Absorbing excess ZION"
        log_event(cur, None, "zrs", headline, absorbed, priority="breaking")

    if state != prev_mode:
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS STATE CHANGE: {prev_mode} → {state}. Interest rate {rate}%",
            amount,
            priority="breaking",
        )

    cur.execute(
        """
        UPDATE zrs_state SET
            policy_mode = %s, prev_policy_mode = %s, interest_rate = %s,
            tax_modifier = %s, loans_frozen = %s, consecutive_crisis = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (state, prev_mode, rate, tax_mod, loans_frozen, consecutive),
    )

    reserve_after = zrs_reserve(cur)
    if not headline:
        headline = (
            f"ZRS {state}: {action} — reserve {reserve_after:,.0f} ZION, "
            f"interest {rate}%, avg {econ['avg_balance']:.1f}, poverty {econ['poverty_pct']:.0f}%"
        )

    record_zrs_policy(cur, state, action, amount, headline, econ, rate)

    conn.commit()
    print(f"Mode: {state} | Reserve: {reserve_before:,.0f} → {reserve_after:,.0f}")
    print(f"Rate: {rate}% | Action: {action} | Amount moved: {amount:,.0f}")
    print(f"Avg balance: {econ['avg_balance']:.1f} | Poverty: {econ['poverty_pct']:.0f}%")
    print(f"Safety floor: {RESERVE_FLOOR:,.0f} ZION")
    print("✅ ZRS cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
