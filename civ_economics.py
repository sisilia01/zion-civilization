#!/usr/bin/env python3
"""ZION genius economics — tax, Gini, population targets, macro indicators."""
from __future__ import annotations

import random
from typing import Any

TARGET_POPULATION = 75_000
BIRTH_HARD_CAP = 100
CORP_MAX_WORKERS = 50
CORP_MIN_WORKERS = 5
CORP_MIN_TREASURY = 50.0
CORP_MIN_REVENUE = 50.0
CORP_TAX_RATE = 0.15  # 15% of net profit (revenue - salaries)
POLICE_OFFICER_RATIO = 50  # 1 officer per 50 agents (2%)
POLICE_MIN_OFFICERS = 20
OFFICER_SALARY = 15.0

# Progressive income tax brackets (balance-based, USA-style)
AGENT_TAX_BRACKETS: list[tuple[float, float]] = [
    (100.0, 0.05),    # 0-100: 5%
    (500.0, 0.10),    # 100-500: 10%
    (2000.0, 0.20),   # 500-2000: 20%
    (float("inf"), 0.35),  # 2000+: 35%
]

BIRTH_CLASS_DIST: dict[str, float] = {
    "poor": 0.40,
    "working": 0.35,
    "middle": 0.20,
    "rich": 0.04,
    "elite": 0.01,
}

BIRTH_STARTING_BALANCE: dict[str, float] = {
    "poor": 10.0,
    "working": 50.0,
    "middle": 200.0,
    "rich": 1000.0,
    "elite": 5000.0,
}


def normalize_agent_class(cls: str | None) -> str:
    c = (cls or "poor").lower().strip()
    valid = {"elite", "rich", "middle", "working", "poor", "critical"}
    if c in valid:
        return c
    return "poor"


def agent_class_from_balance(balance: float, median_balance: float | None = None) -> str:
    """Six-tier class ladder for genius economics.

    If `median_balance` is provided and positive, thresholds scale with it:
    poor < 0.3x median, working < 2x, middle < 10x, rich < 50x, elite >= 50x.
    """
    b = float(balance or 0)
    if b <= 0:
        return "critical"
    m = float(median_balance or 0)
    if m > 0:
        if b < m * 0.3:
            return "poor"
        if b < m * 2:
            return "working"
        if b < m * 10:
            return "middle"
        if b < m * 50:
            return "rich"
        return "elite"

    # Safe fallback when median is unavailable.
    if b < 20:
        return "poor"
    if b < 100:
        return "working"
    if b < 500:
        return "middle"
    if b < 2000:
        return "rich"
    return "elite"


def get_population_tax_multiplier(pop: int) -> float:
    if pop < 50_000:
        return 0.5
    if pop < 100_000:
        return 1.0
    if pop < 200_000:
        return 1.5
    if pop < 400_000:
        return 2.5
    if pop < 600_000:
        return 4.0
    if pop < 800_000:
        return 6.0
    return 10.0


def population_pressure_label(pop: int) -> str:
    if pop >= 800_000:
        return "famine"
    if pop >= 400_000:
        return "critical"
    if pop >= 200_000:
        return "high"
    return "normal"


def get_population_food_multiplier(pop: int) -> float:
    if pop < 100_000:
        return 1.0
    if pop < 200_000:
        return 1.25
    if pop < 400_000:
        return 1.5
    if pop < 600_000:
        return 2.0
    if pop < 800_000:
        return 3.0
    return 4.0


def progressive_bracket_tax(balance: float) -> float:
    """USA-style marginal brackets on agent balance."""
    b = float(balance or 0)
    if b <= 0:
        return 0.0
    tax = 0.0
    prev = 0.0
    for ceiling, rate in AGENT_TAX_BRACKETS:
        if b <= prev:
            break
        taxable = min(b, ceiling) - prev
        if taxable > 0:
            tax += taxable * rate
        prev = ceiling
        if b <= ceiling:
            break
    return round(tax, 4)


def calculate_agent_tax(
    agent: dict[str, Any],
    population: int = 0,
    zrs_reserve: float = 0,
    zrs_modifier_pct: float = 0.0,
) -> float:
    """Progressive income tax: 5/10/20/35% by balance bracket."""
    balance = float(agent.get("balance") or 0)
    if balance <= 0:
        return 0.0
    base = progressive_bracket_tax(balance)
    modifier = base * max(0.0, zrs_modifier_pct)
    return round(min(base + modifier, balance * 0.35), 4)


def treasury_hiring_cap(treasury: float) -> int:
    """Treasury-based hiring limits — no artificial population caps."""
    t = float(treasury or 0)
    if t > 10_000:
        return 500
    if t > 2_000:
        return 100
    if t > 500:
        return 20
    return 0


def calculate_gini(balances: list[float]) -> float:
    vals = sorted(float(b) for b in balances if b is not None)
    n = len(vals)
    if n == 0:
        return 0.0
    if n == 1:
        return 0.0
    total = sum(vals)
    if total <= 0:
        return 0.0
    cum = 0.0
    for i, x in enumerate(vals, 1):
        cum += i * x
    return round((2 * cum) / (n * total) - (n + 1) / n, 4)


def dynamic_birth_rate(alive: int, target: int = TARGET_POPULATION) -> float:
    """Per-cycle birth rate fraction (before hard cap)."""
    if alive > target * 1.5:
        return 0.0001
    if alive > target:
        return 0.001
    if alive < target * 0.5:
        return 0.05
    return 0.01


def birth_cap_for_population(alive: int, birth_rate: float) -> int:
    births = int(alive * birth_rate)
    return min(births, BIRTH_HARD_CAP)


def pick_birth_class() -> str:
    classes = list(BIRTH_CLASS_DIST.keys())
    weights = list(BIRTH_CLASS_DIST.values())
    return random.choices(classes, weights=weights, k=1)[0]


def corp_max_workers(treasury: float, alive: int = 1000) -> int:
    """Deprecated alias — hiring uses treasury_hiring_cap()."""
    return treasury_hiring_cap(treasury)


def target_police_officers(alive: int) -> int:
    return max(POLICE_MIN_OFFICERS, alive // POLICE_OFFICER_RATIO)


def target_senate_seats(alive: int) -> int:
    return max(9, min(100, alive // 500))


def target_corporation_count(alive: int) -> int:
    return max(10, min(500, alive // 375))


POVERTY_BALANCE_THRESHOLD = 50


def fetch_live_agent_metrics(cur, conn=None) -> dict[str, Any]:
    """Canonical live dashboard metrics from the agents table."""
    def _rollback():
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass

    defaults = {
        "alive": 0,
        "poverty_pct": 0.0,
        "crime_pct": 0.0,
        "crime_rate": 0.0,
        "unemployment_rate": 0.0,
        "gini_coefficient": 0.0,
        "avg_balance": 0.0,
        "total_zion": 0.0,
        "starving": 0,
        "gang_members": 0,
        "unemployed": 0,
    }
    try:
        cur.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE balance < 10) AS starving,
                COUNT(*) FILTER (WHERE balance < %s) AS poor,
                COUNT(*) FILTER (WHERE clan_id IS NOT NULL) AS gang_members,
                COUNT(*) FILTER (WHERE employer_corp_id IS NULL) AS unemployed,
                COALESCE(AVG(balance), 0) AS avg_balance,
                COALESCE(SUM(balance), 0) AS total_zion
            FROM agents WHERE is_alive = true
            """,
            (POVERTY_BALANCE_THRESHOLD,),
        )
        row = cur.fetchone() or {}
        if not isinstance(row, dict):
            row = {
                "total": row[0],
                "starving": row[1],
                "poor": row[2],
                "gang_members": row[3],
                "unemployed": row[4],
                "avg_balance": row[5],
                "total_zion": row[6],
            }
        total = max(int(row.get("total") or 0), 1)
        poor = int(row.get("poor") or 0)
        gang_members = int(row.get("gang_members") or 0)
        unemployed = int(row.get("unemployed") or 0)
        poverty_pct = round(poor / total * 100, 1)
        crime_pct = round(gang_members / total * 100, 1)
        unemployment_rate = round(unemployed / total * 100, 1)

        gini = 0.0
        cur.execute("SELECT balance FROM agents WHERE is_alive = true ORDER BY balance")
        balances = [
            float(r["balance"] if isinstance(r, dict) else r[0] or 0)
            for r in cur.fetchall()
        ]
        gini = calculate_gini(balances)

        return {
            "alive": total,
            "poverty_pct": poverty_pct,
            "crime_pct": crime_pct,
            "crime_rate": round(crime_pct / 100, 4),
            "unemployment_rate": unemployment_rate,
            "gini_coefficient": gini,
            "avg_balance": round(float(row.get("avg_balance") or 0), 2),
            "total_zion": round(float(row.get("total_zion") or 0), 2),
            "starving": int(row.get("starving") or 0),
            "gang_members": gang_members,
            "unemployed": unemployed,
        }
    except Exception:
        _rollback()
        return defaults


def fetch_economic_indicators(cur, conn=None) -> dict[str, Any]:
    """Macro snapshot for API / ZRS policy. Rolls back on query failure if conn given."""
    def _rollback():
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass

    def _scalar(sql: str, params=None, default=0):
        try:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            if row is None:
                return default
            if isinstance(row, dict):
                return next(iter(row.values()))
            return row[0]
        except Exception:
            _rollback()
            return default

    live = fetch_live_agent_metrics(cur, conn)
    alive = int(live.get("alive") or 0)
    gini = float(live.get("gini_coefficient") or 0)

    agent_wealth = float(live.get("total_zion") or 0)
    corp_wealth = float(
        _scalar(
            "SELECT COALESCE(SUM(treasury), 0) AS s FROM corporations WHERE is_active = true"
        )
    )
    zrs_reserve = float(
        _scalar("SELECT COALESCE(reserve, 0) AS r FROM zrs_state WHERE id = 1")
    )
    total_economy = agent_wealth + corp_wealth + zrs_reserve

    unemployment_rate = float(live.get("unemployment_rate") or 0)

    inflation_rate = 0.0
    try:
        cur.execute(
            """
            SELECT avg_balance FROM economy_snapshots
            ORDER BY snapshot_at DESC NULLS LAST LIMIT 2
            """
        )
        snaps = cur.fetchall()
        if len(snaps) >= 2:
            prev = float(
                (snaps[1]["avg_balance"] if isinstance(snaps[1], dict) else snaps[1][0]) or 1
            )
            curr = float(
                (snaps[0]["avg_balance"] if isinstance(snaps[0], dict) else snaps[0][0]) or prev
            )
            inflation_rate = round((curr - prev) / max(prev, 0.01) * 100, 2)
    except Exception:
        _rollback()
        inflation_rate = 0.0

    revolution_meter = 0.0
    police_budget = 0.0
    police_count = 0
    try:
        revolution_meter = float(
            _scalar(
                "SELECT COALESCE(revolution_meter, 0) AS m FROM civilization_state WHERE id = 1"
            )
        )
    except Exception:
        _rollback()
        revolution_meter = 0.0

    try:
        police_budget = float(
            _scalar(
                "SELECT COALESCE(police_budget, 0) AS b FROM sheriff_state WHERE is_active = true LIMIT 1"
            )
        )
        police_count = int(
            _scalar(
                "SELECT COALESCE(police_count, 0) AS c FROM sheriff_state WHERE is_active = true LIMIT 1"
            )
        )
    except Exception:
        _rollback()
        police_budget = 0.0
        police_count = 0

    return {
        "alive": alive,
        "poverty_pct": float(live.get("poverty_pct") or 0),
        "crime_pct": float(live.get("crime_pct") or 0),
        "crime_rate": float(live.get("crime_rate") or 0),
        "gang_members": int(live.get("gang_members") or 0),
        "unemployed": int(live.get("unemployed") or 0),
        "starving": int(live.get("starving") or 0),
        "avg_balance": float(live.get("avg_balance") or 0),
        "gini_coefficient": gini,
        "unemployment_rate": unemployment_rate,
        "inflation_rate": inflation_rate,
        "total_economy": round(total_economy, 2),
        "zrs_reserve": round(zrs_reserve, 2),
        "revolution_meter": round(revolution_meter, 1),
        "police_budget": round(police_budget, 2),
        "police_officers": police_count,
        "police_count": police_count,
        "target_population": TARGET_POPULATION,
        "population_pressure": population_pressure_label(alive),
        "tax_multiplier": get_population_tax_multiplier(alive),
        "target_police": target_police_officers(alive),
        "target_corps": target_corporation_count(alive),
    }
