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
from corporations import zrs_corp_bailout

RESERVE_FLOOR = ZRS_RESERVE_FLOOR
BOOM_ABSORB_RATE = 0.05
HYPER_ABSORB_RATE = 0.20
CORP_LOAN_AMOUNT = 500.0
CORP_LOAN_INTEREST = 0.05
CORP_LOAN_DUE_CYCLES = 10
MAX_LOANS_PER_CORP = 3
MAX_LOANS_RESERVE_PCT = 0.10
ZRS_EVENT_TYPE = "economy"  # ECO-POL dashboard activity column


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
                    ZRS_EVENT_TYPE,
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
            ZRS_EVENT_TYPE,
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
            ZRS_EVENT_TYPE,
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

    if pop < 100000:
        conn.close()
        return

    if pop < 200000:
        drain_pct = 0.01
    elif pop < 400000:
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


from civ_economics import calculate_gini, fetch_economic_indicators

RESERVE_TARGET_PCT = 0.10
GINI_REDISTRIBUTE_THRESHOLD = 0.65
REDISTRIBUTE_SKIM_PCT = 0.02


def zrs_redistribute_wealth(
    cur,
    top_pct: float = 0.10,
    bottom_pct: float = 0.20,
    skim_pct: float = REDISTRIBUTE_SKIM_PCT,
) -> float:
    """Wealth tax on top decile → direct transfer to bottom quintile."""
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    n = max(int(cur.fetchone()["c"] or 0), 1)
    top_n = max(1, int(n * top_pct))
    bottom_n = max(1, int(n * bottom_pct))
    cur.execute(
        """
        SELECT id, balance FROM agents WHERE is_alive = true
        ORDER BY balance DESC LIMIT %s
        """,
        (top_n,),
    )
    collected = 0.0
    for ag in cur.fetchall():
        take = round(float(ag["balance"] or 0) * skim_pct, 4)
        if take <= 0:
            continue
        cur.execute(
            "UPDATE agents SET balance = balance - %s WHERE id = %s",
            (take, ag["id"]),
        )
        collected += take
    if collected <= 0:
        return 0.0
    per = round(collected / bottom_n, 4)
    cur.execute(
        """
        SELECT id FROM agents WHERE is_alive = true
        ORDER BY balance ASC LIMIT %s
        """,
        (bottom_n,),
    )
    for ag in cur.fetchall():
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (per, ag["id"]),
        )
    log_event(
        cur,
        None,
        ZRS_EVENT_TYPE,
        f"ZRS REDISTRIBUTION: {collected:.0f} ZION from top {top_pct*100:.0f}% → bottom {bottom_pct*100:.0f}%",
        collected,
        priority="breaking",
    )
    return collected


def zrs_trading_subsidy(cur) -> int:
    """Give ZRS subsidy to agents who are profitable in Z-PERPS."""
    try:
        cur.execute(
            """
            SELECT ap.agent_id, ap.total_pnl, ap.virtual_balance
            FROM agent_portfolio ap
            JOIN agents a ON a.id = ap.agent_id
            WHERE a.is_alive = true
            AND ap.total_pnl > 0
            AND ap.total_trades >= 1
            """
        )
        profitable_traders = cur.fetchall()

        subsidized = 0
        total_paid = 0.0
        for row in profitable_traders:
            agent_id = row["agent_id"]
            pnl = float(row["total_pnl"] or 0)
            subsidy = min(pnl * 0.10, 50.0)
            if subsidy <= 0:
                continue
            if not zrs_deduct_reserve(cur, subsidy):
                break
            cur.execute(
                """
                UPDATE agents SET balance = balance + %s
                WHERE id = %s AND is_alive = true
                """,
                (subsidy, agent_id),
            )
            if cur.rowcount > 0:
                subsidized += 1
                total_paid += subsidy

        if subsidized > 0:
            print(f"ZRS trading subsidy: {subsidized} agents rewarded")
            log_event(
                cur,
                None,
                ZRS_EVENT_TYPE,
                f"ZRS trading subsidy: {subsidized} agents rewarded ({total_paid:.0f} ZION from reserve)",
                total_paid,
                priority="normal",
            )
        return subsidized
    except Exception as e:
        print(f"Trading subsidy error: {e}")
        return 0


def zrs_stimulus(cur, per_agent: float) -> float:
    """QE to poor agents when reserves exceed target."""
    per_agent = round(float(per_agent), 2)
    if per_agent <= 0:
        return 0.0
    n, total = inject_to_agents(
        cur,
        per_agent,
        "is_alive = true AND class IN ('poor', 'critical', 'working')",
    )
    if total > 0:
        log_event(
            cur,
            None,
            ZRS_EVENT_TYPE,
            f"ZRS QE: {total:.0f} ZION stimulus to {n} agents ({per_agent:.0f} each)",
            total,
            priority="urgent",
        )
    return total


def zrs_monetary_policy(cur) -> dict:
    """Central bank: Gini-based redistribution, reserve ratio, QE/QT."""
    ind = fetch_economic_indicators(cur)
    gini = ind["gini_coefficient"]
    total_economy = ind["total_economy"]
    reserve = ind["zrs_reserve"]
    moved = 0.0
    action = "MONETARY_HOLD"

    if gini > GINI_REDISTRIBUTE_THRESHOLD:
        moved += zrs_redistribute_wealth(cur)
        action = "REDISTRIBUTE"

    target_reserve = total_economy * RESERVE_TARGET_PCT
    if target_reserve > 0 and reserve < target_reserve * 0.5:
        log_event(
            cur,
            None,
            ZRS_EVENT_TYPE,
            f"ZRS RESERVE LOW: {reserve:,.0f} / target {target_reserve:,.0f} — fiscal tightening signal",
            reserve,
            priority="urgent",
        )
        action = "TIGHTEN"
    elif reserve > target_reserve * 2 and target_reserve > 0:
        stimulus = min(1000.0, reserve * 0.01)
        moved += zrs_stimulus(cur, stimulus / max(ind["alive"] // 4, 1))
        action = "QE"

    print(
        f"  Monetary policy: Gini={gini:.3f} | Economy={total_economy:,.0f} | "
        f"Reserve={reserve:,.0f} ({reserve/max(target_reserve,1)*100:.0f}% of target) | {action}"
    )
    return {**ind, "policy_action": action, "amount_moved": moved}


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


def inject_to_corporations(cur, total_amount: float, where_sql: str = "is_active = true") -> tuple[int, float]:
    """Reserve-backed QE to corporations only."""
    total_amount = round(float(total_amount), 2)
    if total_amount <= 0:
        return 0, 0.0
    if not zrs_deduct_reserve(cur, total_amount):
        return 0, 0.0
    cur.execute(f"SELECT id FROM corporations WHERE {where_sql}")
    corps = cur.fetchall()
    if not corps:
        zrs_add_reserve(cur, total_amount)
        return 0, 0.0
    per_corp = round(total_amount / len(corps), 2)
    for row in corps:
        cur.execute(
            "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
            (per_corp, row["id"]),
        )
    return len(corps), round(per_corp * len(corps), 2)


def execute_frs_directive(cur, ctx: dict | None = None) -> dict:
    """Execute FRS Chief directive — sole monetary policy writer."""
    import json

    cur.execute("SELECT pending_directive, chief_name, is_active FROM frs_chief_state WHERE id = 1")
    row = cur.fetchone() or {}
    if not row.get("is_active"):
        return {"action": "skipped", "reason": "no_active_frs_chief"}

    directive = row.get("pending_directive") or {}
    if isinstance(directive, str):
        try:
            directive = json.loads(directive)
        except json.JSONDecodeError:
            directive = {}

    action = directive.get("action", "do_nothing")
    amount = float(directive.get("amount", 0) or 0)
    policy_mode = directive.get("policy_mode", "NORMAL")
    chief_name = row.get("chief_name") or "FRS Chief"
    moved = 0.0
    headline = ""

    if action == "tax_change":
        rate = max(0.0, min(25.0, amount if amount else 5.0))
        cur.execute(
            """
            UPDATE zrs_state SET interest_rate = %s, policy_mode = %s, updated_at = NOW()
            WHERE id = 1
            """,
            (rate, policy_mode),
        )
        headline = f"FRS Chief {chief_name} sets interest rate to {rate}%"
    elif action == "absorb_money" and amount > 0:
        absorbed = absorb_from_agents(cur, min(0.05, float(amount)))
        moved = absorbed
        cur.execute(
            "UPDATE zrs_state SET policy_mode = %s, updated_at = NOW() WHERE id = 1",
            (policy_mode,),
        )
        headline = f"FRS Chief {chief_name} absorbed {absorbed:.0f} ZION (boom policy)"
    elif action == "stimulate_economy" and amount > 0:
        n, total = inject_to_corporations(
            cur, amount, "is_active = true AND treasury < 5000"
        )
        moved = total
        cur.execute(
            "UPDATE zrs_state SET policy_mode = %s, updated_at = NOW() WHERE id = 1",
            (policy_mode,),
        )
        headline = f"FRS Chief {chief_name} corp QE: {total:.0f} ZION to {n} corporations"
    elif action == "declare_emergency":
        corp_qe = min(float(amount or 0), zrs_reserve(cur) - ZRS_RESERVE_FLOOR)
        n_corp, corp_total = inject_to_corporations(
            cur, max(0, corp_qe * 0.7), "is_active = true"
        )
        n_ag, ag_total = inject_to_agents(
            cur, 40.0, "is_alive = true AND class IN ('poor', 'critical')"
        )
        moved = corp_total + ag_total
        cur.execute(
            "UPDATE zrs_state SET policy_mode = 'EMERGENCY', updated_at = NOW() WHERE id = 1"
        )
        headline = (
            f"FRS Chief {chief_name} EMERGENCY QE: {corp_total:.0f} to {n_corp} corps, "
            f"{ag_total:.0f} to {n_ag} agents"
        )
    else:
        cur.execute(
            "UPDATE zrs_state SET policy_mode = %s, updated_at = NOW() WHERE id = 1",
            (policy_mode,),
        )
        headline = f"FRS Chief {chief_name}: hold ({policy_mode})"

    if headline:
        log_event(cur, None, ZRS_EVENT_TYPE, headline, moved, priority="urgent")
    result = {"action": action, "amount": amount, "headline": headline, "moved": moved}
    if ctx is not None:
        ctx["zrs_execution"] = result
    return result


def run_zrs_maintenance(cur):
    """Non-policy maintenance: corp loans, snapshots, subsidies."""
    econ = economy_snapshot(cur)
    cur.execute("SELECT policy_mode FROM zrs_state WHERE id = 1")
    state = (cur.fetchone() or {}).get("policy_mode") or "NORMAL"
    record_zrs_policy(cur, state, "MAINTENANCE", 0, "ZRS maintenance cycle", econ, 0)
    record_economy_snapshot(cur, state)
    loan_flow = lend_to_corporations(cur)
    zrs_corp_bailout(cur)
    subsidized = zrs_trading_subsidy(cur)
    reserve = zrs_reserve(cur)
    log_event(
        cur,
        None,
        ZRS_EVENT_TYPE,
        f"ZRS maintenance ({state}): reserve {reserve:,.0f} ZION | "
        f"loans {loan_flow:,.0f} | {subsidized} trading subsidies",
        loan_flow,
        priority="normal",
    )


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🏦 ZION Reserve System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    result = execute_frs_directive(cur)
    print(f"  FRS directive: {result.get('headline') or result.get('reason', '—')}")
    run_zrs_maintenance(cur)
    conn.commit()
    print("✅ ZRS maintenance complete!\n")
    cur.close()
    conn.close()


def _legacy_autonomous_policy_disabled():
    """Legacy autonomous ZRS policy — disabled; FRS Chief is sole authority."""
    monetary = zrs_monetary_policy(cur)
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
            ZRS_EVENT_TYPE,
            headline,
            absorbed,
            priority="urgent",
        )
    elif state == "NORMAL":
        action = "HOLD"
        headline = f"ZRS NORMAL: Interest {rate}%. Minor adjustments only."
        log_event(cur, None, ZRS_EVENT_TYPE, headline, 0, priority="normal")
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
        log_event(cur, None, ZRS_EVENT_TYPE, headline, total, priority="urgent")
    elif state == "CRISIS":
        n, total = inject_to_agents(cur, 100.0)
        amount = total
        action = "INJECT_LARGE"
        headline = "ZRS EMERGENCY QE: Major liquidity injection!"
        log_event(cur, None, ZRS_EVENT_TYPE, headline, total, priority="breaking")

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
                    ZRS_EVENT_TYPE,
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
            ZRS_EVENT_TYPE,
            f"BREAKING: ZRS MEGA QE: {amount:,.0f} ZION injected — civilization saved!",
            amount,
            priority="breaking",
        )
        log_event(cur, None, ZRS_EVENT_TYPE, headline, amount, priority="breaking")
        rate = 0.0
    elif state == "HYPERINFLATION":
        tax_mod = 20.0
        loans_frozen = True
        absorbed = absorb_from_agents(cur, HYPER_ABSORB_RATE)
        amount = absorbed
        action = "ABSORB_AGGRESSIVE"
        headline = "ZRS EMERGENCY: Hyperinflation detected! Absorbing excess ZION"
        log_event(cur, None, ZRS_EVENT_TYPE, headline, absorbed, priority="breaking")

    if state != prev_mode:
        log_event(
            cur,
            None,
            ZRS_EVENT_TYPE,
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
    bailed = zrs_corp_bailout(cur)
    if bailed:
        print(f"  🏦 ZRS corp bootstrap bailout: {bailed} corps")
    zrs_trading_subsidy(cur)

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

    from civ_common import run_db_script

    if len(sys.argv) > 1 and sys.argv[1] == "drain":
        run_db_script(zrs_population_drain, "ZRS population drain")
    else:
        run_db_script(main, "ZRS cycle")
