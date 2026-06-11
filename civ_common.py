#!/usr/bin/env python3
"""Shared DB helpers and schema for ZION civilization workers."""
import json
import os

import psycopg2
import psycopg2.errors
import psycopg2.extras

# Read-only view name — avoids contending with writers on civilization_state row
CIV_STATE_READ = "civilization_state_read"

LOCK_ERRORS = (
    psycopg2.errors.LockNotAvailable,
    psycopg2.errors.DeadlockDetected,
    psycopg2.errors.QueryCanceled,
)


def is_db_lock_error(exc: BaseException) -> bool:
    return isinstance(exc, LOCK_ERRORS)

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
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


def run_db_script(fn, label: str = "Script") -> None:
    """Run a one-shot worker; print a clear message if PostgreSQL is down."""
    import sys

    try:
        fn()
    except psycopg2.OperationalError as exc:
        print(f"\n❌ {label}: database unavailable — {exc}")
        print("   Ensure PostgreSQL is running and civ_common.DB_CONFIG is correct.\n")
        sys.exit(1)


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
OFFICER_SALARY_PER_CYCLE = 15
CRISIS_ZRS_MODES = frozenset({"RECESSION", "CRISIS", "DEPRESSION"})


def agent_class_from_balance(balance: float, median_balance: float | None = None) -> str:
    """Six-tier ladder — delegates to civ_economics genius model."""
    from civ_economics import agent_class_from_balance as _genius_class

    return _genius_class(balance, median_balance=median_balance)


def tax_rate_for_balance(balance: float) -> float:
    """Legacy flat rate; genius tax uses civ_economics.calculate_agent_tax."""
    cls = agent_class_from_balance(balance)
    from civ_economics import BASE_TAX_RATES

    return BASE_TAX_RATES.get(cls, 0.02)


def reclassify_all_agents(cur):
    """Apply six-tier classes from balance for all alive agents."""
    cur.execute(
        """
        WITH m AS (
            SELECT COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY balance),
                1
            ) AS med
            FROM agents
            WHERE is_alive = true
        )
        UPDATE agents
        SET class = CASE
            WHEN balance <= 0 THEN 'critical'
            WHEN balance < (SELECT med * 0.3 FROM m) THEN 'poor'
            WHEN balance < (SELECT med * 2 FROM m) THEN 'working'
            WHEN balance < (SELECT med * 10 FROM m) THEN 'middle'
            WHEN balance < (SELECT med * 50 FROM m) THEN 'rich'
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
            ("health", "INTEGER DEFAULT 100"),
            ("infected", "BOOLEAN DEFAULT false"),
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
    cur.execute(
        "ALTER TABLE corporations ADD COLUMN IF NOT EXISTS credit_rating INTEGER DEFAULT 100"
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
    _add_columns(
        cur,
        "zrs_state",
        [
            ("corporate_crisis", "BOOLEAN DEFAULT FALSE"),
            ("corporate_crisis_cycle", "TIMESTAMP"),
        ],
    )
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
    _add_columns(
        cur,
        "civilization_state",
        [
            ("last_sheriff_agent_id", "INTEGER"),
            ("uprising_active", "BOOLEAN DEFAULT FALSE"),
            ("uprising_start", "TIMESTAMP"),
            ("division_officers_baseline", "JSONB"),
            ("last_meter_delta", "INTEGER DEFAULT 0"),
            ("last_meter_reason", "VARCHAR(200)"),
            ("media_sentiment", "NUMERIC(6,2) DEFAULT 0"),
            ("pending_gang_retaliation", "BOOLEAN DEFAULT FALSE"),
            ("last_raid_failed_clan_id", "INTEGER"),
            ("starvation_deaths_hour", "INTEGER DEFAULT 0"),
            ("last_total_zion", "NUMERIC(24,2)"),
            ("governance_tick_id", "INTEGER DEFAULT 0"),
            ("tick_context", "JSONB DEFAULT '{}'::jsonb"),
            ("martial_law_until", "TIMESTAMP"),
            ("last_impeached_agent_id", "INTEGER"),
            ("president_election_cycles", "INTEGER DEFAULT 0"),
        ],
    )
    cur.execute(
        f"""
        CREATE OR REPLACE VIEW {CIV_STATE_READ} AS
        SELECT * FROM civilization_state WHERE id = 1
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS frs_chief_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            agent_id INTEGER,
            chief_name VARCHAR(120) DEFAULT 'FRS Chair',
            nominated_by INTEGER,
            confirmation_status VARCHAR(20) DEFAULT 'vacant',
            term_cycles_remaining INTEGER DEFAULT 0,
            cycles_served INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT FALSE,
            appointed_at TIMESTAMP,
            confirmed_at TIMESTAMP,
            pending_directive JSONB DEFAULT '{}'::jsonb,
            last_directive JSONB DEFAULT '{}'::jsonb,
            model VARCHAR(80) DEFAULT 'microsoft/phi-4-mini-instruct',
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute("INSERT INTO frs_chief_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS governance_tick_log (
            id SERIAL PRIMARY KEY,
            tick_id INTEGER NOT NULL,
            step VARCHAR(40) NOT NULL,
            summary TEXT,
            context JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS court_cases (
            id SERIAL PRIMARY KEY,
            defendant_agent_id INTEGER,
            case_type VARCHAR(40) DEFAULT 'corruption',
            status VARCHAR(20) DEFAULT 'pending',
            verdict VARCHAR(20),
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            resolved_at TIMESTAMP
        )
        """
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
        ("hours_in_power", "INTEGER DEFAULT 0"),
        ("dissolved_until", "TIMESTAMP"),
        ("dictatorship_mode", "BOOLEAN DEFAULT false"),
        ("vetoes_used", "INTEGER DEFAULT 0"),
        ("election_delayed", "BOOLEAN DEFAULT false"),
        ("martial_law_until", "TIMESTAMP"),
        ("tax_relief_until", "TIMESTAMP"),
        ("corruption_index", "NUMERIC(5,2) DEFAULT 30"),
        ("impeachment_votes", "INTEGER DEFAULT 0"),
    ]:
        try:
            cur.execute(
                f"ALTER TABLE president_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
            )
        except Exception:
            pass

    try:
        cur.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS president_state_one_active
            ON president_state (is_active) WHERE is_active = true
            """
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

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS police_divisions (
            id SERIAL PRIMARY KEY,
            division_name VARCHAR(30) UNIQUE NOT NULL,
            officers INTEGER DEFAULT 0,
            budget NUMERIC(20,2) DEFAULT 0,
            role VARCHAR(40) DEFAULT 'patrol'
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS economy_snapshots (
            id SERIAL PRIMARY KEY,
            snapshot_at TIMESTAMP DEFAULT NOW(),
            avg_balance NUMERIC(12,2),
            total_zion NUMERIC(20,2),
            poverty_pct NUMERIC(6,2),
            zrs_state VARCHAR(20)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS active_effects (
            id SERIAL PRIMARY KEY,
            effect_type VARCHAR(50) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            crime_modifier NUMERIC(6,3) DEFAULT 0,
            poverty_modifier NUMERIC(6,3) DEFAULT 0,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS crisis_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            is_active BOOLEAN DEFAULT FALSE,
            started_at TIMESTAMP,
            crime_rate FLOAT DEFAULT 0,
            unemployment_rate FLOAT DEFAULT 0,
            social_debt FLOAT DEFAULT 0,
            revolution_pressure FLOAT DEFAULT 0,
            cycles_active INT DEFAULT 0,
            economic_phase VARCHAR(20) DEFAULT 'NORMAL',
            last_gdp FLOAT DEFAULT 0,
            gdp_growth_rate FLOAT DEFAULT 0,
            gini_coefficient FLOAT DEFAULT 0,
            police_effectiveness FLOAT DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "INSERT INTO crisis_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )
    _add_columns(
        cur,
        "crisis_state",
        [
            ("unemployment_rate", "FLOAT DEFAULT 0"),
            ("economic_phase", "VARCHAR(20) DEFAULT 'NORMAL'"),
            ("last_gdp", "FLOAT DEFAULT 0"),
            ("gdp_growth_rate", "FLOAT DEFAULT 0"),
            ("gini_coefficient", "FLOAT DEFAULT 0"),
            ("police_effectiveness", "FLOAT DEFAULT 0"),
            ("updated_at", "TIMESTAMP DEFAULT NOW()"),
        ],
    )

    # Legacy table — clans used instead
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS gangs (
            id SERIAL PRIMARY KEY,
            name TEXT,
            members INT DEFAULT 10,
            treasury FLOAT DEFAULT 100,
            territory_control FLOAT DEFAULT 5,
            gang_health FLOAT DEFAULT 100,
            leader_id INT REFERENCES agents(id),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    _add_columns(
        cur,
        "gangs",
        [
            ("gang_health", "FLOAT DEFAULT 100"),
            ("is_active", "BOOLEAN DEFAULT TRUE"),
        ],
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS senate_budget (
            id INTEGER PRIMARY KEY DEFAULT 1,
            balance FLOAT DEFAULT 0,
            total_received FLOAT DEFAULT 0,
            total_spent FLOAT DEFAULT 0,
            laws_blocked_this_month INT DEFAULT 0,
            social_programs_active BOOLEAN DEFAULT FALSE,
            president_blocked_until TIMESTAMP,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "INSERT INTO senate_budget (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )
    _add_columns(
        cur,
        "senate_budget",
        [
            ("laws_blocked_this_month", "INT DEFAULT 0"),
            ("social_programs_active", "BOOLEAN DEFAULT FALSE"),
            ("president_blocked_until", "TIMESTAMP"),
            ("updated_at", "TIMESTAMP DEFAULT NOW()"),
        ],
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS power_log (
            id SERIAL PRIMARY KEY,
            event_type TEXT,
            description TEXT,
            president_power FLOAT,
            sheriff_power FLOAT,
            senate_power FLOAT,
            outcome TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )

    _add_columns(
        cur,
        "sheriff_state",
        [
            ("crime_cleared", "INTEGER DEFAULT 0"),
            ("alliance_mode", "BOOLEAN DEFAULT FALSE"),
        ],
    )
    _add_columns(
        cur,
        "president_state",
        [
            ("laws_passed_this_month", "INTEGER DEFAULT 0"),
            ("crime_cleared", "INTEGER DEFAULT 0"),
        ],
    )


POLICE_DIVISION_SPLITS = [
    ("SWAT", 0.40, 0.40, "gang_raids"),
    ("ANTI-TAX", 0.15, 0.15, "tax_collection"),
    ("PRES.GUARD", 0.05, 0.05, "president_guard"),
    ("ANTI-CORR", 0.10, 0.10, "anti_corruption"),
    ("RIOT CTRL", 0.30, 0.30, "riot_control"),
]

UPRISING_STEAL_PCT = {
    "SWAT": 0.50,
    "ANTI-TAX": 0.80,
    "ANTI-CORR": 0.60,
    "PRES.GUARD": 0.30,
}

UPRISING_START_THRESHOLD = 50
UPRISING_END_THRESHOLD = 50
RIOT_CTRL_STRONG = 20


def ensure_martial_law_columns(cur) -> None:
    """Lightweight migration — martial_law_until on president_state and civilization_state."""
    for table in ("president_state", "civilization_state"):
        try:
            cur.execute(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS martial_law_until TIMESTAMP"
            )
        except Exception:
            pass
    try:
        cur.execute(
            f"""
            CREATE OR REPLACE VIEW {CIV_STATE_READ} AS
            SELECT * FROM civilization_state WHERE id = 1
            """
        )
    except Exception:
        pass


def read_civilization_state(cur) -> dict:
    """Lock-free read via civilization_state_read view."""
    cur.execute(f"SELECT * FROM {CIV_STATE_READ} LIMIT 1")
    row = cur.fetchone()
    return dict(row) if row else {}


def get_civilization_state(cur) -> dict:
    return read_civilization_state(cur)


def get_revolution_meter(cur) -> int:
    cur.execute(
        f"SELECT COALESCE(revolution_meter, 0) AS m FROM {CIV_STATE_READ} LIMIT 1"
    )
    row = cur.fetchone()
    return int(float((row or {}).get("m") or 0))


def get_impeachment_revolution_level(cur) -> float:
    """Article XV threshold: civilization unrest (meter + economic pressure)."""
    meter = float(get_revolution_meter(cur))
    try:
        cur.execute(
            "SELECT COALESCE(revolution_pressure, 0) AS p FROM crisis_state WHERE id = 1"
        )
        row = cur.fetchone()
        pressure = float((row or {}).get("p") or 0)
    except Exception:
        pressure = 0.0
    return meter + pressure


def is_uprising_active(cur) -> bool:
    cur.execute(
        f"SELECT COALESCE(uprising_active, false) AS a FROM {CIV_STATE_READ} LIMIT 1"
    )
    row = cur.fetchone()
    return bool((row or {}).get("a"))


def update_revolution_meter(cur, delta: int, reason: str = "") -> int:
    meter = max(0, min(100, get_revolution_meter(cur) + int(delta)))
    cur.execute(
        """
        UPDATE civilization_state SET
            revolution_meter = %s,
            last_meter_delta = %s,
            last_meter_reason = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (meter, int(delta), (reason or "")[:200]),
    )
    cur.execute(
        "UPDATE president_state SET revolution_meter = %s WHERE is_active = true",
        (meter,),
    )
    return meter


def _division_snapshot(cur) -> dict:
    cur.execute(
        "SELECT division_name, officers, budget FROM police_divisions ORDER BY division_name"
    )
    return {
        r["division_name"]: {
            "officers": int(r["officers"] or 0),
            "budget": float(r["budget"] or 0),
        }
        for r in cur.fetchall()
    }


def _apply_division_counts(cur, counts: dict):
    for name, data in counts.items():
        cur.execute(
            """
            UPDATE police_divisions SET officers = %s, budget = %s
            WHERE division_name = %s
            """,
            (int(data["officers"]), float(data["budget"]), name),
        )


def redistribute_uprising_officers(cur, baseline: dict) -> dict:
    """RIOT CTRL seizes officers from other divisions per UPRISING_STEAL_PCT."""
    import json

    counts = {k: dict(v) for k, v in baseline.items()}
    stolen = 0
    for div, pct in UPRISING_STEAL_PCT.items():
        if div not in counts:
            continue
        orig = counts[div]["officers"]
        take = int(orig * pct)
        counts[div]["officers"] = max(0, orig - take)
        stolen += take
    if "RIOT CTRL" in counts:
        counts["RIOT CTRL"]["officers"] = counts["RIOT CTRL"]["officers"] + stolen
    _apply_division_counts(cur, counts)
    return counts


def start_uprising(cur) -> bool:
    """Begin uprising: save baseline and redistribute officers to RIOT CTRL."""
    import json

    if is_uprising_active(cur):
        return False

    sync_police_divisions(cur)
    baseline = _division_snapshot(cur)
    if not baseline:
        return False

    redistribute_uprising_officers(cur, baseline)
    cur.execute(
        """
        UPDATE civilization_state SET
            uprising_active = true,
            uprising_start = NOW(),
            division_officers_baseline = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (json.dumps(baseline),),
    )
    cur.execute(
        "SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND balance < 50"
    )
    rebel_count = int((cur.fetchone() or {}).get("c") or 0)
    meter = get_revolution_meter(cur)
    log_event(
        cur,
        None,
        "revolution",
        f"BREAKING: UPRISING BEGINS! {rebel_count} citizens take to streets! Revolution meter: {meter}%",
        meter,
        priority="breaking",
    )
    log_event(
        cur,
        None,
        "revolution",
        "URGENT: Corruption surges as ANTI-CORR officers reassigned to riot duty!",
        0,
        priority="urgent",
    )
    log_event(
        cur,
        None,
        "revolution",
        "URGENT: Police divisions stretched thin — uprising drains SWAT and ANTI-TAX!",
        0,
        priority="urgent",
    )
    return True


def end_uprising(cur, police_won: bool = True) -> bool:
    """Restore division officers from baseline; resume normal operations."""
    import json

    if not is_uprising_active(cur):
        return False

    cur.execute(
        f"SELECT division_officers_baseline FROM {CIV_STATE_READ} LIMIT 1"
    )
    row = cur.fetchone()
    baseline = row.get("division_officers_baseline") if row else None
    if isinstance(baseline, str):
        baseline = json.loads(baseline)
    if baseline:
        _apply_division_counts(cur, baseline)

    meter = 20 if police_won else 60
    cur.execute(
        """
        UPDATE civilization_state SET
            uprising_active = false,
            uprising_start = NULL,
            division_officers_baseline = NULL,
            revolution_meter = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (meter,),
    )
    cur.execute(
        "UPDATE president_state SET revolution_meter = %s WHERE is_active = true",
        (meter,),
    )
    sync_police_divisions(cur)

    if police_won:
        log_event(
            cur,
            None,
            "revolution",
            "BREAKING: REVOLUTION SUPPRESSED! RIOT CTRL defeats rebels. Order restored.",
            meter,
            priority="breaking",
        )
    return True


def compute_revolution_delta(cur, president: dict) -> tuple[int, str]:
    """Return (delta, human-readable reason) for this cycle."""
    if not president:
        return 0, ""

    econ = economy_snapshot(cur)
    approval = int(president.get("approval_rating") or 50)
    corruption = float(president.get("corruption_index") or 30)
    poverty = float(econ.get("poverty_pct") or 0)
    delta = 0
    reasons = []

    if poverty > 50:
        delta += 5
        reasons.append("poverty rising")
    if approval < 20:
        delta += 10
        reasons.append("low approval")
    if corruption > 60:
        delta += 8
        reasons.append("high corruption")
    cur.execute(
        """
        SELECT COUNT(DISTINCT corp_id) AS c FROM clan_territory ct
        JOIN corporations c ON c.id = ct.corp_id AND c.is_active = true
        """
    )
    gang_corps = int((cur.fetchone() or {}).get("c") or 0)
    if gang_corps > 3:
        delta += 5
        reasons.append("gangs control corps")

    cur.execute("SELECT policy_mode FROM zrs_state WHERE id = 1")
    zrs_row = cur.fetchone()
    zrs_mode = (zrs_row or {}).get("policy_mode") or "NORMAL"
    if zrs_mode in ("CRISIS", "DEPRESSION"):
        delta += 15
        reasons.append(f"ZRS {zrs_mode}")

    riot = get_division_officers(cur, "RIOT CTRL")
    if riot > RIOT_CTRL_STRONG:
        delta -= 10
        reasons.append("RIOT CTRL strong")

    cur.execute(
        """
        SELECT 1 FROM active_effects
        WHERE effect_type = 'martial_law' AND expires_at > NOW() LIMIT 1
        """
    )
    if cur.fetchone():
        delta -= 15
        reasons.append("martial law")

    if approval > 60:
        delta -= 5
        reasons.append("high approval")

    sign = "+" if delta >= 0 else ""
    reason = f"{sign}{delta} ({', '.join(reasons)})" if reasons else f"{sign}{delta}"
    return delta, reason


def apply_stimulus_revolution_bonus(cur):
    """One-time -20 when president issues STIMULUS."""
    update_revolution_meter(cur, -20, "president STIMULUS")


def apply_uprising_corruption(cur, president: dict):
    """ANTI-CORR depleted: corruption_index += 5 per cycle."""
    if not is_uprising_active(cur) or not president:
        return
    cur.execute(
        """
        UPDATE president_state SET corruption_index = LEAST(100, COALESCE(corruption_index, 30) + 5)
        WHERE is_active = true
        """
    )


def apply_uprising_coup_pressure(cur):
    """PRES.GUARD depleted: coup_points += 10 per cycle."""
    if not is_uprising_active(cur):
        return
    cur.execute(
        """
        UPDATE sheriff_state SET coup_points = COALESCE(coup_points, 0) + 10
        WHERE is_active = true
        """
    )


def trigger_full_revolution(cur, president: dict) -> bool:
    """
    revolution_meter >= 100: poor agents rebel vs SWAT + RIOT CTRL.
    Returns True if rebels won (president executed).
    """
    if not president:
        return False

    cur.execute(
        "SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND balance < 50"
    )
    rebel_count = int((cur.fetchone() or {}).get("c") or 0)
    swat = get_division_officers(cur, "SWAT")
    riot = get_division_officers(cur, "RIOT CTRL")
    state_force = (swat + riot) * 10
    pname = president["agent_name"]

    if rebel_count > state_force:
        cur.execute(
            """
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'revolution'
            WHERE id = %s
            """,
            (president["agent_id"],),
        )
        cur.execute(
            "UPDATE president_state SET is_active = false WHERE is_active = true"
        )
        end_uprising(cur, police_won=False)
        update_revolution_meter(cur, -get_revolution_meter(cur), "revolution succeeded")
        log_event(
            cur,
            None,
            "revolution",
            f"BREAKING: REVOLUTION SUCCEEDS! President {pname} removed from power!",
            rebel_count,
            priority="breaking",
        )
        return True

    arrested = min(rebel_count, max(5, rebel_count // 4))
    cur.execute(
        """
        UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'executed'
        WHERE is_alive = true AND balance < 50
        AND id IN (
            SELECT id FROM agents WHERE is_alive = true AND balance < 50
            ORDER BY RANDOM() LIMIT %s
        )
        """,
        (arrested,),
    )
    end_uprising(cur, police_won=True)
    log_event(
        cur,
        None,
        "revolution",
        f"BREAKING: REVOLUTION SUPPRESSED! RIOT CTRL defeats rebels. {arrested} arrested.",
        arrested,
        priority="breaking",
    )
    return False


def process_revolution_cycle(cur, president: dict) -> dict:
    """
    Update meter, start/end uprising, trigger full revolution at 100.
    Returns status dict for logging/API.
    """
    if not president:
        return {"meter": 0, "active": False, "change": ""}

    delta, reason = compute_revolution_delta(cur, president)
    meter = update_revolution_meter(cur, delta, reason)

    if meter > UPRISING_START_THRESHOLD and not is_uprising_active(cur):
        start_uprising(cur)
    elif is_uprising_active(cur) and meter <= UPRISING_END_THRESHOLD:
        riot = get_division_officers(cur, "RIOT CTRL")
        if riot > RIOT_CTRL_STRONG:
            end_uprising(cur, police_won=True)

    rebels_won = False
    if meter >= 100:
        rebels_won = trigger_full_revolution(cur, president)
        meter = get_revolution_meter(cur)

    if is_uprising_active(cur) and meter > UPRISING_START_THRESHOLD:
        apply_uprising_corruption(cur, president)
        apply_uprising_coup_pressure(cur)

    return {
        "meter": meter,
        "active": is_uprising_active(cur),
        "change": reason,
        "rebels_won": rebels_won,
    }


def sync_police_divisions(cur):
    """Split sheriff police_count / police_budget across five divisions (sums match totals)."""
    if is_uprising_active(cur):
        return

    cur.execute(
        "SELECT police_count, police_budget FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    sh = cur.fetchone()
    if not sh:
        cur.execute("UPDATE police_divisions SET officers = 0, budget = 0")
        return

    total_o = max(0, int(sh["police_count"] or 0))
    total_b = max(0.0, float(sh["police_budget"] or 0))
    assigned_o = 0
    assigned_b = 0.0

    for i, (name, o_pct, b_pct, role) in enumerate(POLICE_DIVISION_SPLITS):
        if i < len(POLICE_DIVISION_SPLITS) - 1:
            o = int(total_o * o_pct)
            b = round(total_b * b_pct, 2)
        else:
            o = max(0, total_o - assigned_o)
            b = round(max(0.0, total_b - assigned_b), 2)
        assigned_o += o
        assigned_b += b
        cur.execute(
            """
            INSERT INTO police_divisions (division_name, officers, budget, role)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (division_name) DO UPDATE SET
                officers = EXCLUDED.officers,
                budget = EXCLUDED.budget,
                role = EXCLUDED.role
            """,
            (name, o, b, role),
        )

    cur.execute("SELECT COALESCE(SUM(officers), 0) AS s FROM police_divisions")
    div_sum = int(cur.fetchone()["s"] or 0)
    if div_sum != total_o and total_o > 0:
        cur.execute(
            """
            UPDATE police_divisions SET officers = officers + %s
            WHERE division_name = 'SWAT'
            """,
            (total_o - div_sum,),
        )


def get_division_officers(cur, division_name: str) -> int:
    cur.execute(
        "SELECT officers FROM police_divisions WHERE division_name = %s",
        (division_name,),
    )
    row = cur.fetchone()
    return int(row["officers"] or 0) if row else 0


def insert_active_effect(
    cur,
    effect_type: str,
    hours: float,
    crime_modifier: float = 0.0,
    poverty_modifier: float = 0.0,
    metadata: dict | None = None,
):
    import json

    cur.execute(
        """
        INSERT INTO active_effects (effect_type, expires_at, crime_modifier, poverty_modifier, metadata)
        VALUES (%s, NOW() + (%s * INTERVAL '1 hour'), %s, %s, %s)
        """,
        (
            effect_type,
            float(hours),
            crime_modifier,
            poverty_modifier,
            json.dumps(metadata) if metadata else None,
        ),
    )


def get_active_effects(cur) -> list:
    cur.execute(
        """
        SELECT effect_type, expires_at, crime_modifier, poverty_modifier, metadata
        FROM active_effects
        WHERE expires_at > NOW()
        ORDER BY expires_at ASC
        """
    )
    return [dict(r) for r in cur.fetchall()]


def cleanup_expired_effects(cur):
    cur.execute("DELETE FROM active_effects WHERE expires_at <= NOW()")


def effective_crime_multiplier(cur) -> float:
    """Martial law etc.: negative crime_modifier reduces effective crime (boosts enforcement)."""
    cur.execute(
        """
        SELECT COALESCE(SUM(crime_modifier), 0) AS m
        FROM active_effects WHERE expires_at > NOW()
        """
    )
    mod = float((cur.fetchone() or {}).get("m") or 0)
    return max(0.5, 1.0 + mod)


def record_economy_snapshot(cur, zrs_state: str = "NORMAL"):
    econ = economy_snapshot(cur)
    cur.execute(
        """
        INSERT INTO economy_snapshots (avg_balance, total_zion, poverty_pct, zrs_state)
        VALUES (%s, %s, %s, %s)
        """,
        (
            round(econ["avg_balance"], 2),
            round(econ["total_money"], 2),
            round(econ["poverty_pct"], 2),
            zrs_state,
        ),
    )
    cur.execute(
        """
        DELETE FROM economy_snapshots
        WHERE id NOT IN (
            SELECT id FROM economy_snapshots ORDER BY snapshot_at DESC LIMIT 24
        )
        """
    )


def get_zrs_policy_mode(cur) -> str:
    cur.execute("SELECT policy_mode FROM zrs_state WHERE id = 1")
    row = cur.fetchone()
    return (row or {}).get("policy_mode") or "NORMAL"


def is_martial_law_active(cur) -> bool:
    cur.execute(
        """
        SELECT 1 FROM active_effects
        WHERE effect_type = 'martial_law' AND expires_at > NOW() LIMIT 1
        """
    )
    return cur.fetchone() is not None


def get_daily_food_cost(cur) -> float:
    return float(DAILY_FOOD_COST * 2 if is_martial_law_active(cur) else DAILY_FOOD_COST)


def get_tax_collection_multiplier(cur) -> float:
    if is_uprising_active(cur):
        return 0.0
    return 1.0


def apply_martial_law_divisions(cur):
    """MARTIAL LAW: all officers/budget to SWAT + RIOT CTRL; zero tax/anti-corr divisions."""
    cur.execute(
        "SELECT police_count, police_budget FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    sh = cur.fetchone()
    if not sh:
        return
    total_o = max(0, int(sh["police_count"] or 0))
    total_b = max(0.0, float(sh["police_budget"] or 0))
    swat_o = int(total_o * 0.5)
    riot_o = max(0, total_o - swat_o)
    swat_b = round(total_b * 0.5, 2)
    riot_b = round(max(0.0, total_b - swat_b), 2)
    layout = {
        "SWAT": {"officers": swat_o, "budget": swat_b},
        "RIOT CTRL": {"officers": riot_o, "budget": riot_b},
        "ANTI-TAX": {"officers": 0, "budget": 0},
        "ANTI-CORR": {"officers": 0, "budget": 0},
        "PRES.GUARD": {"officers": 0, "budget": 0},
    }
    _apply_division_counts(cur, layout)


def restore_after_martial_law(cur):
    """When martial law expires, redistribute divisions normally."""
    if is_martial_law_active(cur) or is_uprising_active(cur):
        return
    sync_police_divisions(cur)


def hungry_agent_pct(cur) -> float:
    cur.execute(
        """
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE COALESCE(health, 100) < 50) AS hungry
        FROM agents WHERE is_alive = true
        """
    )
    row = cur.fetchone() or {}
    total = max(int(row.get("total") or 0), 1)
    return float(row.get("hungry") or 0) / total * 100


def set_corporate_crisis(cur, active: bool = True):
    cur.execute(
        """
        UPDATE zrs_state SET corporate_crisis = %s, corporate_crisis_cycle = NOW(), updated_at = NOW()
        WHERE id = 1
        """,
        (active,),
    )


def cap_gang_treasuries(cur):
    """Gang treasury cannot exceed 5% of total alive-agent ZION (1M supply guard)."""
    cur.execute(
        "SELECT COALESCE(SUM(balance), 0) AS t FROM agents WHERE is_alive = true"
    )
    total_zion = float(cur.fetchone()["t"] or 0)
    cap = min(total_zion * 0.05, 50_000.0)
    cap = max(1000.0, cap)
    cur.execute(
        "UPDATE clans SET treasury = LEAST(treasury, %s) WHERE treasury > %s",
        (cap, cap),
    )


def get_zrs_state(cur):
    cur.execute("SELECT * FROM zrs_state WHERE id = 1")
    return cur.fetchone()


def route_tax_revenue(cur, total_tax: float):
    """Legacy wrapper — agent taxes use route_agent_tax_revenue."""
    return route_agent_tax_revenue(cur, total_tax)


def route_agent_tax_revenue(cur, total_tax: float):
    """Agent income tax: 40% senate | 30% state_treasury | 30% ZRS reserve."""
    total_tax = round(float(total_tax), 2)
    if total_tax <= 0:
        return 0.0, 0.0, 0.0
    senate = round(total_tax * 0.40, 2)
    state = round(total_tax * 0.30, 2)
    zrs = round(total_tax - senate - state, 2)
    if senate > 0:
        cur.execute(
            """
            INSERT INTO senate_budget (id, balance, total_received)
            VALUES (1, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                balance = senate_budget.balance + EXCLUDED.balance,
                total_received = senate_budget.total_received + EXCLUDED.total_received,
                updated_at = NOW()
            """,
            (senate, senate),
        )
    if state > 0:
        credit_state_treasury(cur, state, fund="social_fund")
    if zrs > 0:
        zrs_add_reserve(cur, zrs)
    return senate, state, zrs


def route_corp_tax_revenue(cur, total_tax: float):
    """Corporate profit tax: 40% senate | 40% ZRS | 20% president personal_fund."""
    total_tax = round(float(total_tax), 2)
    if total_tax <= 0:
        return 0.0, 0.0, 0.0
    senate = round(total_tax * 0.40, 2)
    zrs = round(total_tax * 0.40, 2)
    president = round(total_tax - senate - zrs, 2)
    if senate > 0:
        cur.execute(
            """
            INSERT INTO senate_budget (id, balance, total_received)
            VALUES (1, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                balance = senate_budget.balance + EXCLUDED.balance,
                total_received = senate_budget.total_received + EXCLUDED.total_received,
                updated_at = NOW()
            """,
            (senate, senate),
        )
    if zrs > 0:
        zrs_add_reserve(cur, zrs)
    if president > 0:
        cur.execute(
            """
            UPDATE president_state SET personal_fund = personal_fund + %s
            WHERE is_active = true
            """,
            (president,),
        )
    return senate, zrs, president


def credit_state_treasury(cur, amount: float, fund: str = "social_fund") -> bool:
    """Credit state_treasury bucket (conservation-safe)."""
    amount = round(float(amount), 2)
    if amount <= 0:
        return False
    col = {"social_fund", "zrs_fund", "police_fund"}.intersection({fund}) or {"social_fund"}
    column = col.pop()
    cur.execute(
        f"""
        INSERT INTO state_treasury (id, {column})
        VALUES (1, %s)
        ON CONFLICT (id) DO UPDATE SET {column} = state_treasury.{column} + EXCLUDED.{column}
        """,
        (amount,),
    )
    return True


def debit_state_treasury(cur, amount: float, fund: str = "social_fund") -> bool:
    """Debit state_treasury bucket if sufficient funds."""
    amount = round(float(amount), 2)
    if amount <= 0:
        return False
    column = fund if fund in ("social_fund", "zrs_fund", "police_fund") else "social_fund"
    cur.execute(f"SELECT COALESCE({column}, 0) AS bal FROM state_treasury WHERE id = 1")
    row = cur.fetchone() or {}
    bal = float(row.get("bal") or 0)
    if bal < amount:
        return False
    cur.execute(
        f"UPDATE state_treasury SET {column} = {column} - %s WHERE id = 1",
        (amount,),
    )
    return True


def transfer_agent_balance(cur, from_id: int, to_id: int, amount: float) -> bool:
    """Debit one agent, credit another — same amount."""
    amount = round(float(amount), 2)
    if amount <= 0 or from_id == to_id:
        return False
    cur.execute(
        """
        UPDATE agents SET balance = balance - %s
        WHERE id = %s AND is_alive = true AND balance >= %s
        """,
        (amount, from_id, amount),
    )
    if cur.rowcount != 1:
        return False
    cur.execute(
        "UPDATE agents SET balance = balance + %s WHERE id = %s AND is_alive = true",
        (amount, to_id),
    )
    if cur.rowcount != 1:
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s AND is_alive = true",
            (amount, from_id),
        )
        return False
    return True


def settle_agent_balance_to_zrs(cur, agent_id: int, amount: float | None = None) -> float:
    """Move agent balance into ZRS reserve (no destruction)."""
    if amount is None:
        cur.execute("SELECT balance FROM agents WHERE id = %s", (agent_id,))
        row = cur.fetchone()
        amount = float((row or {}).get("balance") or 0)
    amount = round(max(0.0, float(amount)), 2)
    if amount <= 0:
        return 0.0
    cur.execute("UPDATE agents SET balance = 0 WHERE id = %s", (agent_id,))
    zrs_add_reserve(cur, amount)
    return amount


def settle_agent_death(cur, agent_id: int) -> float:
    """Death settlement: living parent inherits; otherwise ZRS reserve."""
    cur.execute(
        "SELECT balance, parent_id, clan_id FROM agents WHERE id = %s",
        (agent_id,),
    )
    row = cur.fetchone()
    if not row:
        return 0.0
    old_clan_id = row.get("clan_id")
    amount = round(max(0.0, float(row["balance"] or 0)), 2)
    transferred = 0.0
    if amount > 0:
        cur.execute("UPDATE agents SET balance = 0 WHERE id = %s", (agent_id,))
        heir = row.get("parent_id")
        if heir:
            cur.execute(
                "SELECT id FROM agents WHERE id = %s AND is_alive = true",
                (heir,),
            )
            if cur.fetchone():
                cur.execute(
                    "UPDATE agents SET balance = balance + %s WHERE id = %s",
                    (amount, heir),
                )
                transferred = amount
            else:
                zrs_add_reserve(cur, amount)
                transferred = amount
        else:
            zrs_add_reserve(cur, amount)
            transferred = amount

    cur.execute(
        """
        UPDATE agents SET
            clan_id = NULL,
            clan_name = NULL,
            employer_corp_id = NULL,
            job_role = NULL,
            job_status = 'unemployed'
        WHERE id = %s
        """,
        (agent_id,),
    )
    if old_clan_id:
        cur.execute(
            """
            UPDATE clans c SET members_count = (
                SELECT COUNT(*) FROM agents
                WHERE clan_id = c.id AND is_alive = true
            )
            WHERE c.id = %s
            """,
            (old_clan_id,),
        )

    return transferred


def route_food_spending(cur, total_food: float):
    """Agent food payments → ZRS reserve (conservation)."""
    total_food = round(float(total_food), 2)
    if total_food > 0:
        zrs_add_reserve(cur, total_food)


BIRTH_CHILD_SHARE = 0.20


def fund_birth_from_zrs(cur, child_id: int, birth_cost: float) -> bool:
    """
    ZRS pays birth_cost: child receives 20%, remainder returns to ZRS reserve.
    No parent balance debit.
    """
    birth_cost = round(float(birth_cost), 2)
    if birth_cost <= 0:
        return False
    if not zrs_deduct_reserve(cur, birth_cost):
        return False
    child_share = round(birth_cost * BIRTH_CHILD_SHARE, 2)
    recycle = round(birth_cost - child_share, 2)
    cur.execute(
        "UPDATE agents SET balance = %s WHERE id = %s",
        (child_share, child_id),
    )
    if recycle > 0:
        zrs_add_reserve(cur, recycle)
    return True


def grant_from_zrs_to_agents(
    cur,
    total_amount: float,
    per_agent: float,
    where_sql: str,
    limit: int | None = None,
) -> tuple[int, float]:
    """Deduct total from ZRS, credit each matching agent per_agent. Returns (count, paid)."""
    total_amount = round(float(total_amount), 2)
    per_agent = round(float(per_agent), 2)
    if total_amount <= 0 or per_agent <= 0:
        return 0, 0.0
    if not zrs_deduct_reserve(cur, total_amount):
        return 0, 0.0
    lim = f" LIMIT {int(limit)}" if limit else ""
    cur.execute(
        f"SELECT id FROM agents WHERE {where_sql}{lim}",
    )
    rows = cur.fetchall()
    for row in rows:
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (per_agent, row["id"]),
        )
    paid = round(per_agent * len(rows), 2)
    refund = round(total_amount - paid, 2)
    if refund > 0:
        zrs_add_reserve(cur, refund)
    return len(rows), paid


def debit_personal_fund_pay_agents(
    cur,
    per_agent: float,
    where_sql: str,
) -> tuple[int, float]:
    """Debit president personal_fund for exact payout to matching agents."""
    cur.execute(
        f"SELECT id FROM agents WHERE {where_sql}",
    )
    rows = cur.fetchall()
    n = len(rows)
    total = round(per_agent * n, 2)
    if n == 0 or total <= 0:
        return 0, 0.0
    cur.execute(
        """
        UPDATE president_state
        SET personal_fund = personal_fund - %s
        WHERE is_active = true AND personal_fund >= %s
        """,
        (total, total),
    )
    if cur.rowcount != 1:
        return 0, 0.0
    for row in rows:
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (per_agent, row["id"]),
        )
    return n, total


def zrs_pay_elite_tax_to_reserve(cur) -> float:
    """Collect 3% elite wealth into ZRS (VIP raise_taxes) — returns amount seized."""
    cur.execute(
        """
        SELECT COALESCE(SUM(balance * 0.03), 0) AS s
        FROM agents WHERE is_alive = true AND class = 'elite'
        """
    )
    seized = round(float(cur.fetchone()["s"] or 0), 2)
    if seized <= 0:
        return 0.0
    cur.execute(
        """
        UPDATE agents SET balance = GREATEST(0, balance * 0.97)
        WHERE is_alive = true AND class = 'elite'
        """
    )
    zrs_add_reserve(cur, seized)
    return seized


def zrs_reserve(cur) -> float:
    cur.execute("SELECT COALESCE(reserve, 0) AS r FROM zrs_state WHERE id = 1")
    row = cur.fetchone()
    return float(row["r"] if row else 0)


def zrs_deduct_reserve(cur, amount: float) -> bool:
    """Deduct from ZRS reserve; returns False if below safety floor (50k ZION)."""
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


NATIONALIZE_ZRS_PER_CORP = 1000.0


def nationalize_corporations_from_zrs(
    cur,
    president_agent_id: int,
    president_name: str,
    limit: int = 3,
    source: str = "president",
) -> float:
    """Reactivate bankrupt corps; fund each from ZRS (no mint). Returns total ZRS spent."""
    cur.execute(
        """
        SELECT id, name FROM corporations
        WHERE is_active = false
        ORDER BY id DESC LIMIT %s
        """,
        (limit,),
    )
    corps = cur.fetchall()
    total = 0.0
    for corp in corps:
        if not zrs_deduct_reserve(cur, NATIONALIZE_ZRS_PER_CORP):
            break
        cur.execute(
            """
            UPDATE corporations
            SET is_active = true, treasury = treasury + %s,
                owner = 'state', negative_cycles = 0
            WHERE id = %s
            """,
            (NATIONALIZE_ZRS_PER_CORP, corp["id"]),
        )
        total += NATIONALIZE_ZRS_PER_CORP
        log_event(
            cur,
            president_agent_id,
            source,
            f"Nationalized {corp['name']}: +{NATIONALIZE_ZRS_PER_CORP:.0f} ZION from ZRS ({president_name})",
            NATIONALIZE_ZRS_PER_CORP,
            priority="urgent",
        )
    return total


def transfer_power(
    cur,
    reason: str,
    *,
    new_agent_id: int | None = None,
    new_agent_name: str | None = None,
    new_party: str | None = None,
    phase: str = "interim",
    is_dictator: bool = False,
    dictatorship_mode: bool = False,
    kill_old_agent: bool = False,
    death_cause: str = "coup",
    log_agent_id: int | None = None,
):
    """Deactivate current president; INSERT new leader or run senate.run_election."""
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    old = cur.fetchone()
    old_name = (old or {}).get("agent_name", "Unknown")
    old_aid = (old or {}).get("agent_id")

    if old and kill_old_agent and old_aid:
        settle_agent_death(cur, old_aid)
        cur.execute(
            """
            UPDATE agents
            SET is_alive = false, died_at = NOW(), death_cause = %s
            WHERE id = %s
            """,
            (death_cause, old_aid),
        )

    cur.execute(
        "UPDATE president_state SET is_active = false WHERE is_active = true"
    )

    if new_agent_id and new_agent_name:
        party = new_party or "centrists"
        cur.execute(
            """
            INSERT INTO president_state (
                agent_id, agent_name, party, approval_rating, personal_fund,
                police_fund, is_active, phase, corruption_index, days_in_power,
                hours_in_power, vetoes_used, dictatorship_mode, is_dictator, dissolved_until
            ) VALUES (%s, %s, %s, 50, 500, 0, true, %s, 0, 0, 0, 0, %s, %s, NULL)
            """,
            (
                new_agent_id,
                new_agent_name,
                party,
                phase,
                dictatorship_mode,
                is_dictator,
            ),
        )
    else:
        from senate import run_election

        run_election(cur, "president")

    aid = log_agent_id or new_agent_id or old_aid
    log_event(
        cur,
        aid,
        "election",
        f"BREAKING: {reason} — power transfer from President {old_name}",
        0,
        priority="breaking",
    )


def economy_snapshot(cur):
    cur.execute(
        """
        SELECT COUNT(*) AS total,
               COALESCE(AVG(balance), 0) AS avg_balance,
               COALESCE(SUM(balance), 0) AS total_money,
               COUNT(*) FILTER (WHERE balance < 50) AS poor_count
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

    crime_mult = effective_crime_multiplier(cur)
    effective_poverty = max(0.0, poverty_pct * crime_mult)

    return {
        "total": total,
        "avg_balance": avg_bal,
        "total_money": float(s["total_money"] or 0),
        "poverty_pct": poverty_pct,
        "effective_poverty_pct": effective_poverty,
        "crime_multiplier": crime_mult,
        "corp_treasury_total": corp_t,
        "inflation_index": inflation_index,
    }


def _memory_row_value(row, key: str, index: int):
    if not row:
        return None
    if isinstance(row, dict):
        return row.get(key)
    try:
        return row[index]
    except (IndexError, TypeError):
        return None


def get_latest_ai_decision(cur, faction: str) -> dict:
    """Get the latest AI decision for a faction."""
    try:
        cur.execute(
            """
            SELECT last_5_decisions, strategy_notes, total_cycles
            FROM ai_faction_memory
            WHERE faction = %s
            """,
            (faction,),
        )
        row = cur.fetchone()
        decisions_raw = _memory_row_value(row, "last_5_decisions", 0)
        if not row or not decisions_raw:
            return {}
        if isinstance(decisions_raw, str):
            decisions = json.loads(decisions_raw)
        else:
            decisions = decisions_raw if isinstance(decisions_raw, list) else []
        latest = decisions[-1] if decisions else {}
        if not isinstance(latest, dict):
            return {}
        return {
            "action": latest.get("action", "do_nothing"),
            "amount": latest.get("amount", 0),
            "reasoning": latest.get("reasoning", ""),
            "strategy": _memory_row_value(row, "strategy_notes", 1) or "",
            "cycles": _memory_row_value(row, "total_cycles", 2) or 0,
        }
    except Exception:
        return {}


def ai_approved_action(cur, faction: str, action_type: str) -> bool:
    """Check if AI approved a specific action type this cycle."""
    decision = get_latest_ai_decision(cur, faction)
    return decision.get("action") == action_type


def compute_total_zion(cur) -> dict:
    """Sum all major ZION balances — conservation ledger."""
    cur.execute(
        "SELECT COALESCE(SUM(balance), 0) AS s FROM agents WHERE is_alive = true"
    )
    agents = float((cur.fetchone() or {}).get("s") or 0)
    cur.execute(
        "SELECT COALESCE(SUM(treasury), 0) AS s FROM corporations WHERE is_active = true"
    )
    corps = float((cur.fetchone() or {}).get("s") or 0)
    cur.execute("SELECT COALESCE(SUM(treasury), 0) AS s FROM clans")
    clans = float((cur.fetchone() or {}).get("s") or 0)
    cur.execute(
        "SELECT COALESCE(SUM(virtual_balance), 0) AS s FROM agent_portfolio"
    )
    perps = float((cur.fetchone() or {}).get("s") or 0)
    cur.execute("SELECT COALESCE(reserve, 0) AS r FROM zrs_state WHERE id = 1")
    zrs = float((cur.fetchone() or {}).get("r") or 0)
    cur.execute(
        "SELECT COALESCE(personal_fund, 0) AS p, COALESCE(police_fund, 0) AS pf "
        "FROM president_state WHERE is_active = true LIMIT 1"
    )
    pres = cur.fetchone() or {}
    president_fund = float(pres.get("p") or 0)
    cur.execute(
        "SELECT COALESCE(police_budget, 0) AS b FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    police = float((cur.fetchone() or {}).get("b") or 0)
    cur.execute("SELECT COALESCE(balance, 0) AS b FROM senate_budget WHERE id = 1")
    senate = float((cur.fetchone() or {}).get("b") or 0)
    cur.execute(
        "SELECT COALESCE(zrs_fund, 0) AS z, COALESCE(police_fund, 0) AS p, "
        "COALESCE(social_fund, 0) AS s FROM state_treasury WHERE id = 1"
    )
    st = cur.fetchone() or {}
    state_treasury = float(st.get("z") or 0) + float(st.get("p") or 0) + float(st.get("s") or 0)
    total = round(
        agents + corps + clans + perps + zrs + president_fund + police + senate + state_treasury,
        2,
    )
    return {
        "total": total,
        "agents": agents,
        "corporations": corps,
        "clans": clans,
        "perps": perps,
        "zrs_reserve": zrs,
        "president_fund": president_fund,
        "police_budget": police,
        "senate_budget": senate,
        "state_treasury": state_treasury,
    }


def check_money_conservation(cur, label: str = "", alert_pct: float = 1.0) -> dict:
    """Alert if total ZION moved > alert_pct% since last check (unexpected mint/burn)."""
    ledger = compute_total_zion(cur)
    total = ledger["total"]
    cur.execute(f"SELECT COALESCE(last_total_zion, 0) AS t FROM {CIV_STATE_READ} LIMIT 1")
    prev = float((cur.fetchone() or {}).get("t") or 0)
    delta_pct = 0.0
    if prev > 0:
        delta_pct = abs(total - prev) / prev * 100
    try:
        cur.execute(
            "UPDATE civilization_state SET last_total_zion = %s, updated_at = NOW() WHERE id = 1",
            (total,),
        )
    except LOCK_ERRORS:
        pass
    if prev > 0 and delta_pct > alert_pct:
        breakdown = (
            f"agents={ledger['agents']:,.0f} corps={ledger['corporations']:,.0f} "
            f"clans={ledger['clans']:,.0f} zrs={ledger['zrs_reserve']:,.0f} "
            f"pres={ledger['president_fund']:,.0f} police={ledger['police_budget']:,.0f} "
            f"senate={ledger['senate_budget']:,.0f} state={ledger['state_treasury']:,.0f}"
        )
        print(
            f"ERROR MONEY CONSERVATION [{label}]: drift {delta_pct:.2f}% "
            f"({prev:,.0f} → {total:,.0f}) | {breakdown}",
            flush=True,
        )
        log_event(
            cur,
            None,
            "economy",
            f"MONEY ERROR [{label}]: total ZION drifted {delta_pct:.2f}% "
            f"({prev:,.0f} → {total:,.0f}) — {breakdown}",
            round(total - prev, 2),
            priority="breaking",
        )
    ledger["prev_total"] = prev
    ledger["delta_pct"] = round(delta_pct, 4)
    return ledger


def get_tick_context(cur) -> dict:
    """Deprecated — tick context is in-process only; no DB reads."""
    return {}


def set_tick_context(cur, ctx: dict):
    """Deprecated no-op — avoids civilization_state lock contention."""
    return


def merge_tick_step(cur, step: str, data: dict):
    """Deprecated no-op — use in-memory ctx dict in governance_tick only."""
    return


def bump_governance_tick_id(cur) -> int:
    """Increment tick id; uses NOWAIT to avoid blocking other writers."""
    try:
        cur.execute("SELECT id FROM civilization_state WHERE id = 1 FOR UPDATE NOWAIT")
        cur.execute(
            """
            UPDATE civilization_state
            SET governance_tick_id = COALESCE(governance_tick_id, 0) + 1, updated_at = NOW()
            WHERE id = 1
            RETURNING governance_tick_id
            """
        )
        row = cur.fetchone()
        if row:
            return int((row or {}).get("governance_tick_id") or 1)
    except LOCK_ERRORS:
        pass
    cur.execute(
        f"SELECT COALESCE(governance_tick_id, 0) AS tid FROM {CIV_STATE_READ} LIMIT 1"
    )
    row = cur.fetchone()
    return int((row or {}).get("tid") or 0) + 1


def log_governance_step(cur, tick_id: int, step: str, summary: str, ctx: dict | None = None):
    cur.execute(
        """
        INSERT INTO governance_tick_log (tick_id, step, summary, context)
        VALUES (%s, %s, %s, %s::jsonb)
        """,
        (tick_id, step, summary[:500], json.dumps(ctx or {})),
    )
    log_event(cur, None, "governance", f"[TICK #{tick_id}] {step}: {summary[:200]}", 0, priority="normal")
