#!/usr/bin/env python3
"""
ZION Corporate Political Economy.
Corporations compete for top traders, run on ZION credit (interest + bankruptcy),
poach talent from rivals, and lobby for laws. Creates capital-vs-labor conflict
as a research subject for Track I. Built on existing corporations table.
"""
import math
import os
import random

import psycopg2
import psycopg2.extras

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}


def db():
    return psycopg2.connect(**DB)


CREDIT_INTEREST = 0.05  # 5% per cycle on outstanding ZION credit
SALARY_PREMIUM = 1.25  # corps pay above trader earnings (was 1.4 — caused overpay)
REVENUE_PER_EMPLOYEE = 25.0  # ZION revenue per employee per cycle
PAYROLL_MARGIN = 0.80  # payroll must stay <= revenue * this fraction
HIRE_BUDGET_FACTOR = 0.70  # hiring cap: new payroll room = revenue * this - current payroll
SOFT_LAYOFF_FRACTION = 0.30
SOFT_TREASURY_BUFFER = 50.0
MIN_HIRE_TREASURY = 100.0
MAX_CYCLE_SALARY = 30.0

CORP_TYPE_MULT = {
    "tech": 1.20,
    "pharma": 1.15,
    "biotech": 1.15,
    "media": 1.00,
    "finance": 1.10,
    "defense": 1.05,
    "agriculture": 0.90,
    "farming": 0.90,
}

STARTUP_NAMES = [
    "Quantum Dynamics",
    "Apex Industries",
    "Stellar Holdings",
    "Nexus Group",
    "Horizon Ventures",
    "Catalyst Corp",
]


def ensure_schema():
    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT param_value FROM constitutional_params
            WHERE param_key = 'schema_initialized' LIMIT 1
            """
        )
        row = cur.fetchone()
        if isinstance(row, dict):
            val = row.get("param_value")
        elif row:
            val = row[0]
        else:
            val = None
        if val is not None and float(val) >= 1:
            cur.close()
            conn.close()
            return  # schema already initialized globally; skip local DDL
    except Exception:
        # If constitutional_params is unavailable, fall back to local DDL attempts.
        pass

    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS zion_credit NUMERIC(20,2) DEFAULT 0"
    )
    cur.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS employer_corp_id INTEGER")
    cur.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS corp_salary NUMERIC(20,2) DEFAULT 0"
    )
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS last_cycle_revenue NUMERIC(20,2) DEFAULT 0"
    )
    cur.execute(
        """CREATE TABLE IF NOT EXISTS corp_events (
        id SERIAL PRIMARY KEY, corp_id INTEGER, event_type VARCHAR(40),
        detail TEXT, amount NUMERIC(20,2), created_at TIMESTAMP DEFAULT NOW())"""
    )
    conn.commit()
    cur.close()
    conn.close()


def trader_earnings(cur, agent_id):
    cur.execute(
        "SELECT COALESCE(SUM(pnl),0) AS total_pnl FROM agent_trades WHERE agent_id=%s AND status='CLOSED'",
        (agent_id,),
    )
    row = cur.fetchone()
    if isinstance(row, dict):
        return float(row.get("total_pnl") or 0)
    if row:
        return float(row[0] or 0)
    return 0.0


def _corp_employee_count(cur, corp_id: int) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS employee_count FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        """,
        (corp_id,),
    )
    row = cur.fetchone()
    if isinstance(row, dict):
        return int(row.get("employee_count") or 0)
    if row:
        return int(row[0] or 0)
    return 0


def _corp_payroll(cur, corp_id: int) -> float:
    cur.execute(
        """
        SELECT COALESCE(SUM(corp_salary), 0) AS payroll
        FROM agents
        WHERE is_alive = true AND employer_corp_id = %s AND corp_salary > 0
        """,
        (corp_id,),
    )
    return float((cur.fetchone() or {}).get("payroll") or 0)


def projected_cycle_revenue(cur, corp_id: int, corp_type: str | None, employees: int) -> float:
    if employees <= 0:
        return 0.0
    mult = CORP_TYPE_MULT.get((corp_type or "").lower(), 1.0)
    return round(employees * REVENUE_PER_EMPLOYEE * mult, 2)


def corp_hiring_budget(cur, corp_id: int, corp_type: str | None) -> float:
    """Remaining payroll room before over-hiring (revenue * HIRE_BUDGET_FACTOR - current payroll)."""
    employees = _corp_employee_count(cur, corp_id)
    cur.execute("SELECT COALESCE(treasury, 0) AS treasury FROM corporations WHERE id = %s", (corp_id,))
    treasury_row = cur.fetchone()
    if isinstance(treasury_row, dict):
        treasury = float(treasury_row.get("treasury") or 0)
    elif treasury_row:
        treasury = float(treasury_row[0] or 0)
    else:
        treasury = 0.0

    if employees == 0 and treasury > 500:
        # Bootstrap hiring: seed first hires directly from treasury before revenue exists.
        return round(min(treasury * 0.3, 150.0), 2)

    revenue = projected_cycle_revenue(cur, corp_id, corp_type, employees)
    if revenue <= 0:
        return 0.0
    max_payroll = revenue * HIRE_BUDGET_FACTOR
    return max(0.0, round(max_payroll - _corp_payroll(cur, corp_id), 2))


def generate_corp_revenue():
    """Active corps earn revenue from employees before payroll is due."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur2 = conn.cursor()
    cur.execute(
        """
        SELECT c.id, c.name, c.corp_type, c.market_share,
               COUNT(a.id) AS emp_count
        FROM corporations c
        LEFT JOIN agents a ON a.employer_corp_id = c.id AND a.is_alive = true
        WHERE c.is_active = true
        GROUP BY c.id, c.name, c.corp_type, c.market_share
        """
    )
    rows = cur.fetchall()
    total_revenue = 0.0
    corps_paid = 0

    cur.execute(
        """
        SELECT COUNT(*) FILTER (WHERE employer_corp_id IS NOT NULL)::float /
               NULLIF(COUNT(*), 0) AS employment_rate
        FROM agents WHERE is_alive = true
        """
    )
    demand_row = cur.fetchone() or {}
    employment_rate = float(demand_row.get("employment_rate") or 0.5)
    unemployment_rate = (1.0 - max(0.0, min(employment_rate, 1.0))) * 100.0
    demand_mult = 0.5 + max(0.0, min(employment_rate, 1.0))

    cur.execute(
        "SELECT COALESCE(economic_phase, 'NORMAL') AS economic_phase FROM crisis_state WHERE id = 1"
    )
    phase_row = cur.fetchone() or {}
    econ_phase = (phase_row.get("economic_phase") or "").strip().upper()
    if econ_phase not in {"BOOM", "RECESSION", "NORMAL", "DEPRESSION"}:
        if unemployment_rate > 80:
            econ_phase = "RECESSION"
        elif unemployment_rate < 30:
            econ_phase = "BOOM"
        else:
            econ_phase = "NORMAL"
    phase_mult = {
        "BOOM": 1.3,
        "RECESSION": 0.7,
        "DEPRESSION": 0.7,
        "NORMAL": 1.0,
    }.get(econ_phase, 1.0)

    for row in rows:
        emp = int(row["emp_count"] or 0)
        if emp <= 0:
            cur2.execute(
                "UPDATE corporations SET last_cycle_revenue = 0, employees = 0 WHERE id = %s",
                (row["id"],),
            )
            continue

        type_mult = CORP_TYPE_MULT.get((row["corp_type"] or "").lower(), 1.0)
        market_share = float(row.get("market_share") or 0)
        market_bonus = 1.0 + max(0.0, market_share) / 100.0
        base = emp * REVENUE_PER_EMPLOYEE
        revenue = round(
            base * type_mult * phase_mult * demand_mult * market_bonus * random.uniform(0.95, 1.05),
            2,
        )
        cur2.execute(
            """
            UPDATE corporations SET
                treasury = treasury + %s,
                revenue = COALESCE(revenue, 0) + %s,
                last_cycle_revenue = %s,
                employees = %s
            WHERE id = %s
            """,
            (revenue, revenue, revenue, emp, row["id"]),
        )
        cur2.execute(
            """
            INSERT INTO corp_events (corp_id, event_type, detail, amount)
            VALUES (%s, %s, %s, %s)
            """,
            (
                row["id"],
                "revenue",
                f"{row['name']}: emp={emp}, phase={econ_phase}, demand={demand_mult:.2f}, market={market_share:.1f}",
                revenue,
            ),
        )
        total_revenue += revenue
        corps_paid += 1

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(
        f"[corp] revenue: {total_revenue:.0f} ZION across {corps_paid} corps "
        f"(phase={econ_phase}, demand={demand_mult:.2f}, base={REVENUE_PER_EMPLOYEE:.0f}/employee)"
    )


def spawn_startup_corp():
    """Spawn startup when active corps are low and unemployment is high."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur2 = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) AS cnt FROM corporations WHERE is_active = true")
        active_count = int((cur.fetchone() or {}).get("cnt") or 0)
        if active_count >= 8:
            conn.commit()
            return

        cur.execute(
            """
            SELECT COUNT(*) FILTER (WHERE employer_corp_id IS NULL)::float /
                   NULLIF(COUNT(*), 0) * 100 AS unemployment
            FROM agents WHERE is_alive = true
            """
        )
        unemployment = float((cur.fetchone() or {}).get("unemployment") or 0)
        if unemployment < 50:
            conn.commit()
            return

        cur.execute("SELECT name FROM corporations")
        existing = {row["name"] for row in cur.fetchall() if row.get("name")}
        available = [name for name in STARTUP_NAMES if name not in existing]
        if not available:
            conn.commit()
            return

        seed_capital = 1500.0
        if not zrs_deduct_reserve(cur2, seed_capital):
            conn.commit()
            return

        new_name = random.choice(available)
        new_type = random.choice(["tech", "pharma", "agriculture", "defense", "finance"])
        cur2.execute(
            """
            INSERT INTO corporations (name, corp_type, treasury, is_active, employees, market_share)
            VALUES (%s, %s, %s, true, 0, 1.0)
            """,
            (new_name, new_type, seed_capital),
        )
        cur2.execute(
            """
            INSERT INTO corp_events (corp_id, event_type, detail, amount)
            VALUES (
                (SELECT id FROM corporations WHERE name = %s ORDER BY id DESC LIMIT 1),
                %s, %s, %s
            )
            """,
            (
                new_name,
                "startup",
                f"NEW STARTUP: {new_name} ({new_type}) founded with {seed_capital:.0f} ZION seed capital",
                seed_capital,
            ),
        )
        try:
            from civ_common import log_event

            log_event(
                cur2,
                None,
                "economy",
                f"NEW STARTUP: {new_name} ({new_type}) founded with {seed_capital:.0f} ZION "
                f"seed capital — responding to {unemployment:.0f}% unemployment",
                seed_capital,
                priority="urgent",
            )
        except Exception:
            pass
        conn.commit()
        print(
            f"[corp] startup spawned: {new_name} ({new_type}) "
            f"at unemployment {unemployment:.1f}%"
        )
    finally:
        cur.close()
        cur2.close()
        conn.close()


def _calc_hire_salary(corp: dict, trader_net: float) -> float:
    base = max(5.0, float(trader_net) * 0.08)
    wealth_bonus = min(float(corp["treasury"]) / 2000.0, 5.0)
    salary = round((base + wealth_bonus) * SALARY_PREMIUM, 2)
    return min(salary, MAX_CYCLE_SALARY)


def hire_top_traders():
    """Corporations hire successful traders, paying above their own earnings."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, name, treasury, zion_credit, corp_type
        FROM corporations
        WHERE is_active = true
        ORDER BY treasury DESC
        """
    )
    corps = [dict(r) for r in cur.fetchall()]
    cur.execute(
        """
        SELECT a.id, a.name, COALESCE(SUM(t.pnl), 0) net
        FROM agents a
        JOIN agent_trades t ON t.agent_id = a.id
        WHERE a.is_alive = true
          AND a.employer_corp_id IS NULL
          AND t.status = 'CLOSED'
        GROUP BY a.id, a.name
        HAVING COALESCE(SUM(t.pnl), 0) > 0
        ORDER BY net DESC
        LIMIT 30
        """
    )
    talents = [dict(r) for r in cur.fetchall()]
    cur2 = conn.cursor()
    hired = 0
    skipped_budget = 0

    eligible = [c for c in corps if float(c["treasury"]) > MIN_HIRE_TREASURY]
    if not eligible:
        conn.commit()
        cur.close()
        cur2.close()
        conn.close()
        print("[corp] no corp can afford hiring")
        return

    ci = 0
    for talent in talents:
        corp = eligible[ci % len(eligible)]
        ci += 1
        budget_room = corp_hiring_budget(cur, corp["id"], corp.get("corp_type"))
        if budget_room < 5.0:
            skipped_budget += 1
            continue

        salary = min(_calc_hire_salary(corp, float(talent["net"])), budget_room)
        if salary < 5.0:
            skipped_budget += 1
            continue

        cur2.execute(
            "UPDATE agents SET employer_corp_id=%s, corp_salary=%s WHERE id=%s",
            (corp["id"], salary, talent["id"]),
        )
        cur2.execute(
            """
            INSERT INTO corp_events (corp_id, event_type, detail, amount)
            VALUES (%s, %s, %s, %s)
            """,
            (
                corp["id"],
                "hire",
                f"Hired top trader {talent['name']} (net {talent['net']:.1f}) at salary {salary}",
                salary,
            ),
        )
        hired += 1

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(
        f"[corp] hired {hired} top traders across {len(eligible)} corporations "
        f"(skipped {skipped_budget} — payroll budget cap)"
    )


def poach_talent():
    """Rich corps poach successful employees from rivals (talent war)."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, name, treasury, corp_type
        FROM corporations
        WHERE is_active = true AND treasury > 500
        ORDER BY treasury DESC
        LIMIT 5
        """
    )
    rich = [dict(r) for r in cur.fetchall()]
    poached = 0
    cur2 = conn.cursor()
    for corp in rich:
        cur.execute(
            """
            SELECT a.id, a.name, a.corp_salary, a.employer_corp_id
            FROM agents a
            WHERE a.employer_corp_id IS NOT NULL
              AND a.employer_corp_id <> %s
              AND a.is_alive = true
            ORDER BY RANDOM()
            LIMIT 1
            """,
            (corp["id"],),
        )
        target = cur.fetchone()
        if not target or random.random() >= 0.5:
            continue

        budget_room = corp_hiring_budget(cur, corp["id"], corp.get("corp_type"))
        new_salary = min(
            round(float(target["corp_salary"] or 5) * 1.2, 2),
            MAX_CYCLE_SALARY,
            budget_room,
        )
        if new_salary < 5.0:
            continue

        cur2.execute(
            "UPDATE agents SET employer_corp_id=%s, corp_salary=%s WHERE id=%s",
            (corp["id"], new_salary, target["id"]),
        )
        cur2.execute(
            """
            INSERT INTO corp_events (corp_id, event_type, detail, amount)
            VALUES (%s, %s, %s, %s)
            """,
            (
                corp["id"],
                "poach",
                f"Poached {target['name']} from corp {target['employer_corp_id']} (+20% salary)",
                new_salary,
            ),
        )
        poached += 1

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(f"[corp] poached {poached} traders between corporations")


def soft_bankruptcy_protection(cur, cur2, corp_id: int, corp_name: str, treasury: float) -> bool:
    """Lay off 30% of highest-paid staff and inject a small treasury buffer before hard bankruptcy."""
    if treasury >= 0:
        return False

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE employer_corp_id = %s AND is_alive = true
        """,
        (corp_id,),
    )
    count = int((cur.fetchone() or {}).get("c") or 0)
    if count <= 0:
        return False

    layoff_n = max(1, math.ceil(count * SOFT_LAYOFF_FRACTION))
    cur.execute(
        """
        SELECT id, name FROM agents
        WHERE employer_corp_id = %s AND is_alive = true
        ORDER BY corp_salary DESC NULLS LAST, id
        LIMIT %s
        """,
        (corp_id, layoff_n),
    )
    to_layoff = cur.fetchall()
    for row in to_layoff:
        cur2.execute(
            """
            UPDATE agents SET employer_corp_id = NULL, corp_salary = 0
            WHERE id = %s
            """,
            (row["id"],),
        )

    cur2.execute(
        "UPDATE corporations SET treasury = %s WHERE id = %s",
        (SOFT_TREASURY_BUFFER, corp_id),
    )
    cur2.execute(
        """
        INSERT INTO corp_events (corp_id, event_type, detail, amount)
        VALUES (%s, %s, %s, %s)
        """,
        (
            corp_id,
            "layoff",
            f"{corp_name} laid off {len(to_layoff)} employees to avoid bankruptcy (treasury was {treasury:.1f})",
            len(to_layoff),
        ),
    )

    try:
        from civ_common import log_event

        log_event(
            cur2,
            None,
            "economy",
            f"Corp {corp_name} laid off {len(to_layoff)} employees to avoid bankruptcy",
            0,
            priority="urgent",
        )
    except Exception:
        pass

    return True


def pay_corporate_salaries():
    """Pay corp_salary from corporation treasury to employed agents."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT a.id AS agent_id, a.employer_corp_id, a.corp_salary,
               c.treasury, c.name AS corp_name
        FROM agents a
        INNER JOIN corporations c ON c.id = a.employer_corp_id AND c.is_active = true
        WHERE a.is_alive = true
          AND a.employer_corp_id IS NOT NULL
          AND a.corp_salary > 0
        ORDER BY a.employer_corp_id, a.id
        """
    )
    rows = cur.fetchall()
    cur2 = conn.cursor()
    corp_treasury: dict[int, float] = {}
    corp_names: dict[int, str] = {}
    paid = 0
    total_paid = 0.0
    bankrupt = 0
    rescued = 0

    for row in rows:
        cid = int(row["employer_corp_id"])
        if cid not in corp_treasury:
            corp_treasury[cid] = float(row["treasury"] or 0)
            corp_names[cid] = row["corp_name"] or f"corp #{cid}"
        salary = round(float(row["corp_salary"] or 0), 2)
        if salary <= 0:
            continue
        corp_treasury[cid] = round(corp_treasury[cid] - salary, 2)
        cur2.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (salary, row["agent_id"]),
        )
        paid += 1
        total_paid += salary

    for cid, treasury in corp_treasury.items():
        corp_name = corp_names.get(cid) or f"corp #{cid}"
        if treasury < 0:
            if soft_bankruptcy_protection(cur, cur2, cid, corp_name, treasury):
                rescued += 1
                continue

        cur2.execute(
            "UPDATE corporations SET treasury = %s WHERE id = %s",
            (treasury, cid),
        )
        if treasury < 0:
            cur2.execute(
                "UPDATE corporations SET is_active = false WHERE id = %s",
                (cid,),
            )
            cur2.execute(
                """
                UPDATE agents SET employer_corp_id = NULL, corp_salary = 0
                WHERE employer_corp_id = %s
                """,
                (cid,),
            )
            cur2.execute(
                """
                INSERT INTO corp_events (corp_id, event_type, detail, amount)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    cid,
                    "bankruptcy",
                    f"{corp_name} bankrupt after payroll — treasury {treasury:.1f}",
                    abs(treasury),
                ),
            )
            bankrupt += 1

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(
        f"[corp] payroll: {paid} salaries paid ({total_paid:.0f} ZION) | "
        f"{rescued} corps rescued via layoffs | {bankrupt} bankrupt"
    )


def service_credit_and_bankruptcy():
    """Corps pay interest on ZION credit; insolvent corps go bankrupt."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, name, treasury, zion_credit FROM corporations WHERE is_active = true"
    )
    corps = [dict(r) for r in cur.fetchall()]
    cur2 = conn.cursor()
    bankrupt = 0
    rescued = 0

    for corp in corps:
        credit = float(corp["zion_credit"] or 0)
        treasury = float(corp["treasury"] or 0)
        if credit > 0:
            interest = round(credit * CREDIT_INTEREST, 2)
            treasury -= interest
            cur2.execute(
                "UPDATE corporations SET treasury=%s WHERE id=%s",
                (treasury, corp["id"]),
            )
            cur2.execute(
                """
                INSERT INTO corp_events (corp_id, event_type, detail, amount)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    corp["id"],
                    "interest",
                    f"Paid {interest:.1f} interest on ZION credit",
                    interest,
                ),
            )

        if treasury < 0 and credit > 0:
            if soft_bankruptcy_protection(cur, cur2, corp["id"], corp["name"], treasury):
                rescued += 1
                continue
            cur2.execute(
                "UPDATE corporations SET is_active=false WHERE id=%s",
                (corp["id"],),
            )
            cur2.execute(
                """
                UPDATE agents SET employer_corp_id=NULL, corp_salary=0
                WHERE employer_corp_id=%s
                """,
                (corp["id"],),
            )
            cur2.execute(
                """
                INSERT INTO corp_events (corp_id, event_type, detail, amount)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    corp["id"],
                    "bankruptcy",
                    f"{corp['name']} went bankrupt — could not service ZION credit",
                    credit,
                ),
            )
            bankrupt += 1

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(
        f"[corp] credit serviced | {rescued} corps rescued via layoffs | "
        f"{bankrupt} corporations went bankrupt"
    )


def run_cycle():
    ensure_schema()
    spawn_startup_corp()
    generate_corp_revenue()
    hire_top_traders()
    poach_talent()
    pay_corporate_salaries()
    service_credit_and_bankruptcy()
    print("[corp] corporate political economy cycle complete")


if __name__ == "__main__":
    run_cycle()
