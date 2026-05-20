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
OFFICER_SALARY_PER_CYCLE = 5
CRISIS_ZRS_MODES = frozenset({"RECESSION", "CRISIS", "DEPRESSION"})


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
        ],
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


def get_civilization_state(cur) -> dict:
    cur.execute("SELECT * FROM civilization_state WHERE id = 1")
    row = cur.fetchone()
    return dict(row) if row else {}


def get_revolution_meter(cur) -> int:
    cur.execute(
        "SELECT COALESCE(revolution_meter, 0) AS m FROM civilization_state WHERE id = 1"
    )
    row = cur.fetchone()
    return int(float((row or {}).get("m") or 0))


def is_uprising_active(cur) -> bool:
    cur.execute(
        "SELECT COALESCE(uprising_active, false) AS a FROM civilization_state WHERE id = 1"
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
        "SELECT division_officers_baseline FROM civilization_state WHERE id = 1"
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
