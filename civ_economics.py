#!/usr/bin/env python3
"""ZION genius economics — tax, Gini, population targets, macro indicators."""
from __future__ import annotations

import random
from typing import Any

TARGET_POPULATION = 75_000
BIRTH_HARD_CAP = 100
CORP_MAX_WORKERS = 50
CORP_MIN_WORKERS = 5
CORP_MIN_TREASURY = 500.0
CORP_MIN_REVENUE = 100.0
CORP_TAX_RATE = 0.10
POLICE_OFFICER_RATIO = 50  # 1 officer per 50 agents (2%)
POLICE_MIN_OFFICERS = 20
OFFICER_SALARY = 8.0

BASE_TAX_RATES: dict[str, float] = {
    "elite": 0.15,
    "rich": 0.12,
    "middle": 0.08,
    "working": 0.05,
    "poor": 0.02,
    "critical": 0.0,
}

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
    if c in BASE_TAX_RATES:
        return c
    if c == "critical":
        return "critical"
    return "poor"


def agent_class_from_balance(balance: float) -> str:
    """Six-tier class ladder for genius economics."""
    b = float(balance or 0)
    if b >= 5000:
        return "elite"
    if b >= 1000:
        return "rich"
    if b >= 100:
        return "middle"
    if b >= 10:
        return "working"
    if b < 1:
        return "critical"
    return "poor"


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
    b = float(balance or 0)
    if b > 10_000:
        return (b - 10_000) * 0.05 + (5_000 * 0.03) + (4_000 * 0.02)
    if b > 5_000:
        return (b - 5_000) * 0.03 + (4_000 * 0.02)
    if b > 1_000:
        return (b - 1_000) * 0.02
    return 0.0


def calculate_agent_tax(
    agent: dict[str, Any],
    population: int,
    zrs_reserve: float,
    zrs_modifier_pct: float = 0.0,
) -> float:
    """Genius progressive tax — capped at 50% of balance per cycle."""
    balance = float(agent.get("balance") or 0)
    if balance <= 0:
        return 0.0
    cls = normalize_agent_class(agent.get("class") or agent_class_from_balance(balance))
    base_rate = BASE_TAX_RATES.get(cls, 0.02) + zrs_modifier_pct
    bracket = progressive_bracket_tax(balance)
    pop_mod = get_population_tax_multiplier(population)
    emergency = balance * 0.01 if zrs_reserve < 10_000 else 0.0
    raw = (balance * max(0.0, base_rate) + bracket) * pop_mod + emergency
    cap = balance * 0.5
    return round(min(max(0.0, raw), cap), 4)


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


def corp_max_workers(treasury: float) -> int:
    """Scale hiring with treasury; 3 months salary buffer implied."""
    if treasury < 1000:
        return 0
    cap = min(int(treasury // 100), CORP_MAX_WORKERS)
    return max(0, cap)


def target_police_officers(alive: int) -> int:
    return max(POLICE_MIN_OFFICERS, alive // POLICE_OFFICER_RATIO)


def target_senate_seats(alive: int) -> int:
    return max(9, min(100, alive // 500))


def target_corporation_count(alive: int) -> int:
    return max(10, min(500, alive // 375))


def fetch_economic_indicators(cur) -> dict[str, Any]:
    """Macro snapshot for API / ZRS policy."""
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    alive = int(cur.fetchone()["c"] or 0)
    cur.execute(
        """
        SELECT balance FROM agents WHERE is_alive = true ORDER BY balance
        """
    )
    balances = [float(r["balance"] or 0) for r in cur.fetchall()]
    gini = calculate_gini(balances)
    cur.execute("SELECT COALESCE(SUM(balance), 0) AS s FROM agents WHERE is_alive = true")
    agent_wealth = float(cur.fetchone()["s"] or 0)
    cur.execute("SELECT COALESCE(SUM(treasury), 0) AS s FROM corporations WHERE is_active = true")
    corp_wealth = float(cur.fetchone()["s"] or 0)
    cur.execute("SELECT COALESCE(reserve, 0) AS r FROM zrs_state WHERE id = 1")
    zrs_reserve = float((cur.fetchone() or {}).get("r") or 0)
    total_economy = agent_wealth + corp_wealth + zrs_reserve
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND COALESCE(job_status, 'unemployed') = 'unemployed'
        """
    )
    unemployed = int(cur.fetchone()["c"] or 0)
    unemployment_rate = round(unemployed / max(alive, 1) * 100, 2)
    cur.execute(
        """
        SELECT avg_balance, inflation_index FROM economy_snapshots
        ORDER BY created_at DESC LIMIT 2
        """
    )
    snaps = cur.fetchall()
    inflation_rate = 0.0
    if len(snaps) >= 2:
        prev = float(snaps[1].get("avg_balance") or 1)
        curr = float(snaps[0].get("avg_balance") or prev)
        inflation_rate = round((curr - prev) / max(prev, 0.01) * 100, 2)
    elif snaps:
        inflation_rate = round(float(snaps[0].get("inflation_index") or 0), 2)
    return {
        "alive": alive,
        "gini_coefficient": gini,
        "unemployment_rate": unemployment_rate,
        "inflation_rate": inflation_rate,
        "total_economy": round(total_economy, 2),
        "zrs_reserve": round(zrs_reserve, 2),
        "target_population": TARGET_POPULATION,
        "population_pressure": population_pressure_label(alive),
        "tax_multiplier": get_population_tax_multiplier(alive),
        "target_police": target_police_officers(alive),
        "target_corps": target_corporation_count(alive),
    }
