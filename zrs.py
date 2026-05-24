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
    record_economy_snapshot,
    zrs_add_reserve,
    zrs_deduct_reserve,
    zrs_reserve,
)

RESERVE_FLOOR = ZRS_RESERVE_FLOOR
BOOM_ABSORB_RATE = 0.05
HYPER_ABSORB_RATE = 0.20
CORP_LOAN_AMOUNT = 500.0
CORP_LOAN_INTEREST = 0.05
CORP_LOAN_DUE_CYCLES = 10
MAX_LOANS_PER_CORP = 3
MAX_LOANS_RESERVE_PCT = 0.10


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


def economy_cycle_number(cur) -> int:
    cur.execute("SELECT COUNT(*) AS c FROM economy_snapshots")
    return int((cur.fetchone() or {}).get("c") or 0) + 1


def collect_corp_loan_repayments(cur) -> float:
    """Collect 5% of principal per cycle; default on missed payment."""
    cur.execute(
        """
        SELECT l.id, l.corp_id, l.corp_name, l.principal, l.amount_owed,
               l.missed_payments, c.treasury,
               COALESCE(c.credit_rating, 100) AS credit_rating
        FROM zrs_loans l
        JOIN corporations c ON c.id = l.corp_id AND c.is_active = true
        WHERE l.is_active = true
        """
    )
    collected = 0.0
    for loan in cur.fetchall():
        principal = float(loan["principal"] or 0)
        payment = round(principal * CORP_LOAN_INTEREST, 2)
        if payment <= 0:
            continue
        treasury = float(loan["treasury"] or 0)
        if treasury >= payment:
            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                (payment, loan["corp_id"]),
            )
            zrs_add_reserve(cur, payment)
            collected += payment
            new_owed = max(0.0, float(loan["amount_owed"] or 0) - payment)
            if new_owed <= 0.01:
                cur.execute(
                    "UPDATE zrs_loans SET amount_owed = 0, is_active = false WHERE id = %s",
                    (loan["id"],),
                )
                log_event(
                    cur,
                    None,
                    "zrs",
                    f"ZRS loan repaid: {loan['corp_name']} ({principal:.0f} ZION)",
                    payment,
                    priority="normal",
                )
            else:
                cur.execute(
                    "UPDATE zrs_loans SET amount_owed = %s, missed_payments = 0 WHERE id = %s",
                    (new_owed, loan["id"]),
                )
            continue

        missed = int(loan["missed_payments"] or 0) + 1
        rating = max(0, int(loan["credit_rating"] or 100) - 15)
        cur.execute(
            """
            UPDATE zrs_loans SET missed_payments = %s, is_active = false
            WHERE id = %s
            """,
            (missed, loan["id"]),
        )
        cur.execute(
            "UPDATE corporations SET credit_rating = %s WHERE id = %s",
            (rating, loan["corp_id"]),
        )
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS loan DEFAULT: {loan['corp_name']} missed payment ({payment:.0f} ZION due)",
            payment,
            priority="urgent",
        )
    return collected


def lend_to_corporations(cur) -> float:
    """Lend to cash-poor but revenue-viable corporations (FRS-style)."""
    cur.execute("SELECT loans_frozen FROM zrs_state WHERE id = 1")
    zrs_row = cur.fetchone() or {}
    if bool(zrs_row.get("loans_frozen")):
        return 0.0

    collected = collect_corp_loan_repayments(cur)
    if collected > 0:
        print(f"  💰 Corp loan repayments: +{collected:.0f} ZION to reserve")

    reserve = zrs_reserve(cur)
    cur.execute(
        "SELECT COALESCE(SUM(principal), 0) AS s FROM zrs_loans WHERE is_active = true"
    )
    outstanding = float((cur.fetchone() or {}).get("s") or 0)
    max_outstanding = reserve * MAX_LOANS_RESERVE_PCT
    if outstanding >= max_outstanding:
        return collected

    cycle = economy_cycle_number(cur)
    cur.execute(
        """
        SELECT id, name, treasury,
               COALESCE(last_cycle_revenue, 0) AS revenue,
               COALESCE(credit_rating, 100) AS credit_rating
        FROM corporations
        WHERE is_active = true
          AND treasury < 300
          AND COALESCE(last_cycle_revenue, 0) > 100
        ORDER BY treasury ASC
        """
    )
    lent_total = 0.0
    for corp in cur.fetchall():
        if outstanding + CORP_LOAN_AMOUNT > max_outstanding:
            break
        if int(corp.get("credit_rating") or 100) < 30:
            continue
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM zrs_loans
            WHERE corp_id = %s AND is_active = true
            """,
            (corp["id"],),
        )
        if int((cur.fetchone() or {}).get("c") or 0) >= MAX_LOANS_PER_CORP:
            continue
        if not zrs_deduct_reserve(cur, CORP_LOAN_AMOUNT):
            break
        cur.execute(
            "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
            (CORP_LOAN_AMOUNT, corp["id"]),
        )
        cur.execute(
            """
            INSERT INTO zrs_loans (
                corp_id, corp_name, principal, amount_owed, interest_rate,
                issued_cycle, due_cycle, is_active
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, true)
            """,
            (
                corp["id"],
                corp["name"],
                CORP_LOAN_AMOUNT,
                CORP_LOAN_AMOUNT,
                CORP_LOAN_INTEREST,
                cycle,
                cycle + CORP_LOAN_DUE_CYCLES,
            ),
        )
        outstanding += CORP_LOAN_AMOUNT
        lent_total += CORP_LOAN_AMOUNT
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS corp loan: {corp['name']} +{CORP_LOAN_AMOUNT:.0f} ZION "
            f"({CORP_LOAN_INTEREST * 100:.0f}%/cycle, due cycle {cycle + CORP_LOAN_DUE_CYCLES})",
            CORP_LOAN_AMOUNT,
            priority="urgent",
        )
        print(f"  🏦 Loan to {corp['name']}: {CORP_LOAN_AMOUNT:.0f} ZION")

    if lent_total > 0:
        print(f"  📋 Corporate lending: {lent_total:.0f} ZION disbursed")
    return collected + lent_total


def zrs_population_drain():
    """ZRS collects emergency levy when population too high."""
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    cur.execute("SELECT COUNT(*) as c FROM agents WHERE is_alive=true")
    pop = cur.fetchone()["c"]

    if pop < 200000:
        conn.close()
        return

    if pop < 400000:
        drain_pct = 0.02
    elif pop < 600000:
        drain_pct = 0.05
    elif pop < 800000:
        drain_pct = 0.10
    else:
        drain_pct = 0.20

    cur.execute(
        "SELECT id, balance FROM agents WHERE is_alive = true AND balance > 0"
    )
    rows = cur.fetchall()
    drained_total = 0.0
    agents_hit = 0
    for ag in rows:
        bal = float(ag["balance"] or 0)
        take = round(bal * drain_pct, 4)
        if take <= 0:
            continue
        cur.execute(
            "UPDATE agents SET balance = balance - %s WHERE id = %s",
            (take, ag["id"]),
        )
        drained_total += take
        agents_hit += 1

    if drained_total > 0:
        zrs_add_reserve(cur, drained_total)

    conn.commit()
    print(
        f"[ZRS DRAIN] pop={pop} drain={drain_pct*100}% "
        f"agents_hit={agents_hit} drained={drained_total:.2f} ZION"
    )
    cur.close()
    conn.close()


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
        agent_inject = 500.0
        corp_bailout = 5000.0
        agent_cost = agent_n * agent_inject
        corp_cost = corp_n * corp_bailout
        amount = 0.0
        n = 0
        if zrs_reserve(cur) >= RESERVE_FLOOR + agent_cost + corp_cost:
            if zrs_deduct_reserve(cur, agent_cost):
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s, debt = 0, health = LEAST(100, COALESCE(health, 80) + 20)
                    WHERE is_alive = true
                    """,
                    (agent_inject,),
                )
                amount += agent_cost
                n = agent_n
            if zrs_deduct_reserve(cur, corp_cost):
                cur.execute(
                    "UPDATE corporations SET treasury = treasury + %s WHERE is_active = true",
                    (corp_bailout,),
                )
                amount += corp_cost
        else:
            n, partial = inject_to_agents(cur, agent_inject)
            amount = partial
            cur.execute("UPDATE agents SET debt = 0 WHERE is_alive = true")
        action = "MEGA_INJECT"
        headline = "ZRS DEPRESSION PROTOCOL: Saving the civilization!"
        log_event(
            cur,
            None,
            "zrs",
            f"BREAKING: ZRS MEGA QE: {amount:,.0f} ZION injected — civilization saved!",
            amount,
            priority="breaking",
        )
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
    record_economy_snapshot(cur, state)
    lend_to_corporations(cur)

    conn.commit()
    print(f"Mode: {state} | Reserve: {reserve_before:,.0f} → {reserve_after:,.0f}")
    print(f"Rate: {rate}% | Action: {action} | Amount moved: {amount:,.0f}")
    print(f"Avg balance: {econ['avg_balance']:.1f} | Poverty: {econ['poverty_pct']:.0f}%")
    print(f"Safety floor: {RESERVE_FLOOR:,.0f} ZION")
    print("✅ ZRS cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "drain":
        zrs_population_drain()
    else:
        main()
