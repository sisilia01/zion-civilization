#!/usr/bin/env python3
"""Shared DB helpers and schema for ZION civilization workers."""
import psycopg2
import psycopg2.extras

DB_CONFIG = {
    "host": "localhost",
    "database": "zion_db",
    "user": "zion_user",
    "password": "zion2026",
}

SECTOR_MULTIPLIERS = {
    "tech": 1.5,
    "finance": 1.3,
    "industry": 1.0,
    "agro": 0.8,
    "agriculture": 0.8,
    "military": 1.2,
    "pharma": 1.2,
    "media": 1.0,
}


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def get_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def log_event(cur, agent_id, event_type, description, amount=0, priority="normal"):
    try:
        cur.execute(
            """
            INSERT INTO events (agent_id, event_type, description, zion_amount, priority)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (agent_id, event_type, description, amount, priority),
        )
    except Exception:
        cur.execute(
            """
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, %s, %s, %s)
            """,
            (agent_id, event_type, description, amount),
        )


ZRS_RESERVE_FLOOR = 50_000.0  # 5% of 400k ZRS reserve (1M total supply)

# Education & living costs (1M supply economy)
UNIVERSITY_COST = 50
ACADEMY_COST = 25
DAILY_FOOD_COST = 1


def agent_class_from_balance(balance: float) -> str:
    """1M supply tiers (~130 avg per agent): poor / working / middle / elite."""
    if balance > 500:
        return "elite"
    if balance >= 100:
        return "middle"
    if balance >= 10:
        return "working"
    return "poor"


def tax_rate_for_balance(balance: float) -> float:
    """Base rates before ZRS modifier (0/5/10/20% by class tier)."""
    if balance > 500:
        return 0.20
    if balance >= 100:
        return 0.10
    if balance >= 10:
        return 0.05
    return 0.0  # poor exempt


def reclassify_all_agents(cur):
    """Apply class tiers from balance for all alive agents."""
    cur.execute(
        """
        UPDATE agents SET class = CASE
            WHEN balance < 10 THEN 'poor'
            WHEN balance < 100 THEN 'working'
            WHEN balance < 500 THEN 'middle'
            ELSE 'elite'
        END
        WHERE is_alive = true
        """
    )


def _add_columns(cur, table: str, columns: list[tuple[str, str]]):
    """Add missing columns on existing tables (CREATE IF NOT EXISTS does not migrate)."""
    for name, typedef in columns:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {typedef}")


def ensure_schema(cur):
    cur.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS debt NUMERIC(20,2) DEFAULT 0")
    cur.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS home_zone INTEGER DEFAULT 1")
    cur.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS clan_name VARCHAR(100)")
    _add_columns(
        cur,
        "agents",
        [
            ("intelligence", "INTEGER DEFAULT 10"),
            ("strength", "INTEGER DEFAULT 10"),
            ("education_status", "VARCHAR(30) DEFAULT 'child'"),
            ("education_start_day", "INTEGER"),
            ("education_path", "VARCHAR(20)"),
            ("job_status", "VARCHAR(30) DEFAULT 'unemployed'"),
            ("employer_corp_id", "INTEGER"),
            ("job_role", "VARCHAR(20)"),
            ("gender", "VARCHAR(10)"),
            ("age_days", "INTEGER DEFAULT 0"),
            ("prays", "BOOLEAN DEFAULT false"),
        ],
    )
    cur.execute("ALTER TABLE corporations ADD COLUMN IF NOT EXISTS debt NUMERIC(20,2) DEFAULT 0")
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS negative_cycles INTEGER DEFAULT 0"
    )
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS controlled_by_clan_id INTEGER"
    )
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS last_cycle_revenue NUMERIC(20,2) DEFAULT 0"
    )
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS police_protection BOOLEAN DEFAULT false"
    )
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true"
    )
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS owner VARCHAR(50) DEFAULT 'private'"
    )
    _add_columns(
        cur,
        "clans",
        [
            ("wins", "INTEGER DEFAULT 0"),
            ("losses", "INTEGER DEFAULT 0"),
            ("members_count", "INTEGER DEFAULT 0"),
            ("treasury", "NUMERIC(20,2) DEFAULT 0"),
        ],
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER,
            event_type VARCHAR(50),
            description TEXT,
            zion_amount NUMERIC(20,2) DEFAULT 0,
            priority VARCHAR(20) DEFAULT 'normal',
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    _add_columns(
        cur,
        "events",
        [
            ("priority", "VARCHAR(20) DEFAULT 'normal'"),
            ("created_at", "TIMESTAMP DEFAULT NOW()"),
            ("zion_amount", "NUMERIC(20,2) DEFAULT 0"),
        ],
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS state_treasury (
            id INTEGER PRIMARY KEY DEFAULT 1,
            zrs_fund NUMERIC(20,2) DEFAULT 0,
            president_fund NUMERIC(20,2) DEFAULT 0,
            police_fund NUMERIC(20,2) DEFAULT 0,
            social_fund NUMERIC(20,2) DEFAULT 0,
            corruption_index NUMERIC(5,2) DEFAULT 50
        )
        """
    )
    cur.execute(
        "INSERT INTO state_treasury (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zrs_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            policy_mode VARCHAR(30) DEFAULT 'NORMAL',
            interest_rate NUMERIC(5,2) DEFAULT 6.0,
            tax_modifier NUMERIC(5,2) DEFAULT 0,
            loans_frozen BOOLEAN DEFAULT false,
            consecutive_crisis INTEGER DEFAULT 0,
            prev_policy_mode VARCHAR(30),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute("ALTER TABLE zrs_state ADD COLUMN IF NOT EXISTS reserve NUMERIC(20,2) DEFAULT 0")
    cur.execute("INSERT INTO zrs_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS church_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            treasury NUMERIC(20,2) DEFAULT 0,
            clinic_built BOOLEAN DEFAULT false,
            hospital_built BOOLEAN DEFAULT false,
            school_built BOOLEAN DEFAULT false,
            university_built BOOLEAN DEFAULT false,
            disease_reduction_pct NUMERIC(5,2) DEFAULT 0,
            tuition_discount_pct NUMERIC(5,2) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute("INSERT INTO church_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS civilization_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            revolution_meter NUMERIC(8,2) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "INSERT INTO civilization_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zrs_policy (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW(),
            state VARCHAR(20),
            avg_balance NUMERIC(10,2),
            poverty_pct NUMERIC(5,2),
            corp_treasury_total NUMERIC(20,2),
            inflation_index NUMERIC(10,2),
            interest_rate NUMERIC(5,2),
            action_taken VARCHAR(50),
            amount NUMERIC(20,2),
            news_headline TEXT
        )
        """
    )
    _add_columns(
        cur,
        "zrs_policy",
        [
            ("created_at", "TIMESTAMP DEFAULT NOW()"),
            ("state", "VARCHAR(20)"),
            ("avg_balance", "NUMERIC(10,2)"),
            ("poverty_pct", "NUMERIC(5,2)"),
            ("corp_treasury_total", "NUMERIC(20,2)"),
            ("inflation_index", "NUMERIC(10,2)"),
            ("interest_rate", "NUMERIC(5,2)"),
            ("action_taken", "VARCHAR(50)"),
            ("amount", "NUMERIC(20,2)"),
            ("news_headline", "TEXT"),
            # legacy columns kept for old readers
            ("policy_mode", "VARCHAR(20)"),
            ("poor_pct", "NUMERIC(5,2)"),
            ("total_money", "NUMERIC(20,2)"),
            ("recorded_at", "TIMESTAMP DEFAULT NOW()"),
        ],
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zrs_loans (
            id SERIAL PRIMARY KEY,
            corp_id INTEGER REFERENCES corporations(id),
            corp_name VARCHAR(100),
            principal NUMERIC(20,2) NOT NULL,
            amount_owed NUMERIC(20,2) NOT NULL,
            interest_rate NUMERIC(5,2) DEFAULT 6,
            missed_payments INTEGER DEFAULT 0,
            issued_cycle INTEGER NOT NULL DEFAULT 0,
            due_cycle INTEGER,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "ALTER TABLE zrs_loans ADD COLUMN IF NOT EXISTS missed_payments INTEGER DEFAULT 0"
    )
    cur.execute(
        "ALTER TABLE zrs_loans ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5,2) DEFAULT 6"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS clan_territory (
            clan_id INTEGER REFERENCES clans(id),
            corp_id INTEGER REFERENCES corporations(id),
            PRIMARY KEY (clan_id, corp_id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS clan_alliances (
            clan_a INTEGER REFERENCES clans(id),
            clan_b INTEGER REFERENCES clans(id),
            PRIMARY KEY (clan_a, clan_b)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sheriff_orders (
            id SERIAL PRIMARY KEY,
            president_id INTEGER,
            order_type VARCHAR(50) NOT NULL,
            payload JSONB,
            status VARCHAR(20) DEFAULT 'pending',
            result_text TEXT,
            faked BOOLEAN DEFAULT false,
            issued_at TIMESTAMP DEFAULT NOW(),
            executed_at TIMESTAMP
        )
        """
    )

    for col, typedef in [
        ("revolution_meter", "NUMERIC(8,2) DEFAULT 0"),
        ("orders_given_cycle", "INTEGER DEFAULT 0"),
        ("compliance_low_cycles", "INTEGER DEFAULT 0"),
    ]:
        try:
            cur.execute(
                f"ALTER TABLE president_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
            )
        except Exception:
            pass

    for col, typedef in [
        ("coup_points", "INTEGER DEFAULT 0"),
        ("orders_executed_cycle", "INTEGER DEFAULT 0"),
        ("orders_ignored_cycle", "INTEGER DEFAULT 0"),
    ]:
        try:
            cur.execute(
                f"ALTER TABLE sheriff_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
            )
        except Exception:
            pass


def get_zrs_state(cur):
    cur.execute("SELECT * FROM zrs_state WHERE id = 1")
    return cur.fetchone()


def route_tax_revenue(cur, total_tax: float):
    """40% president | 30% ZRS reserve | 20% sheriff | 10% burned."""
    pres = round(total_tax * 0.40, 2)
    zrs = round(total_tax * 0.30, 2)
    sheriff = round(total_tax * 0.20, 2)
    burned = round(total_tax - pres - zrs - sheriff, 2)
    cur.execute(
        "UPDATE zrs_state SET reserve = COALESCE(reserve, 0) + %s WHERE id = 1",
        (zrs,),
    )
    cur.execute(
        """
        UPDATE president_state SET personal_fund = personal_fund + %s
        WHERE is_active = true
        """,
        (pres,),
    )
    cur.execute(
        """
        UPDATE sheriff_state SET police_budget = police_budget + %s
        WHERE is_active = true
        """,
        (sheriff,),
    )
    return pres, zrs, sheriff, burned


def zrs_reserve(cur) -> float:
    cur.execute("SELECT COALESCE(reserve, 0) AS r FROM zrs_state WHERE id = 1")
    row = cur.fetchone()
    return float(row["r"] if row else 0)


def zrs_deduct_reserve(cur, amount: float) -> bool:
    """Deduct from ZRS reserve; returns False if below safety floor (50M)."""
    reserve = zrs_reserve(cur)
    floor = ZRS_RESERVE_FLOOR
    if reserve - amount < floor:
        return False
    cur.execute(
        "UPDATE zrs_state SET reserve = reserve - %s, updated_at = NOW() WHERE id = 1",
        (amount,),
    )
    return True


def zrs_add_reserve(cur, amount: float):
    cur.execute(
        "UPDATE zrs_state SET reserve = COALESCE(reserve, 0) + %s, updated_at = NOW() WHERE id = 1",
        (amount,),
    )


def economy_snapshot(cur):
    cur.execute(
        """
        SELECT COUNT(*) AS total,
               COALESCE(AVG(balance), 0) AS avg_balance,
               COALESCE(SUM(balance), 0) AS total_money,
               COUNT(*) FILTER (WHERE balance < 10 OR class IN ('poor','critical')) AS poor_count
        FROM agents WHERE is_alive = true
        """
    )
    s = cur.fetchone()
    total = max(int(s["total"] or 0), 1)
    cur.execute(
        "SELECT COALESCE(SUM(treasury), 0) AS t FROM corporations WHERE is_active = true"
    )
    corp_t = float(cur.fetchone()["t"] or 0)
    avg_bal = float(s["avg_balance"] or 0)
    poverty_pct = float(s["poor_count"] or 0) / total * 100

    cur.execute(
        "SELECT avg_balance FROM zrs_policy ORDER BY id DESC LIMIT 1"
    )
    prev = cur.fetchone()
    prev_avg = float(prev["avg_balance"]) if prev and prev.get("avg_balance") is not None else avg_bal
    inflation_index = round(
        max(0.0, ((avg_bal - prev_avg) / max(prev_avg, 0.01)) * 100 + poverty_pct * 0.5),
        2,
    )

    return {
        "total": total,
        "avg_balance": avg_bal,
        "total_money": float(s["total_money"] or 0),
        "poverty_pct": poverty_pct,
        "corp_treasury_total": corp_t,
        "inflation_index": inflation_index,
    }
