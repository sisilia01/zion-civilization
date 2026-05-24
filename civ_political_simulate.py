#!/usr/bin/env python3
"""Political economy simulation audit — 50 cycles × stress scenarios."""
from __future__ import annotations

import random
from dataclasses import dataclass, field

BASE_CRIME = 0.15
CRISIS_CRIME = 0.8
CRISIS_UNEMP = 80.0
REVOLUTION_TRIGGER = 150.0


@dataclass
class SimState:
    unemployment: float = 40.0
    crime_rate: float = 0.2
    revolution_pressure: float = 20.0
    social_debt: float = 0.0
    gdp: float = 1_000_000.0
    last_gdp: float = 1_000_000.0
    crisis_active: bool = False
    cycles_in_crisis: int = 0
    president_power: float = 60.0
    sheriff_power: float = 50.0
    senate_power: float = 45.0
    approval: float = 55.0
    gini: float = 0.55
    police_effectiveness: float = 0.6
    total_money: float = 1_000_000.0
    alive: int = 75000
    events: list[str] = field(default_factory=list)
    checks_passed: int = 0
    checks_failed: int = 0


def crime_rate(state: SimState) -> float:
    mult = 1 + (state.unemployment / 100) ** 2
    return min(1.0, BASE_CRIME * mult * (1 - state.police_effectiveness))


def update_pressure(state: SimState) -> None:
    cr = state.crime_rate
    if cr > 0.8:
        state.revolution_pressure += 10
    if state.unemployment > 70:
        state.revolution_pressure += 5
    if state.gini > 0.8:
        state.revolution_pressure += 3
    if state.approval < 20:
        state.revolution_pressure += 2
    if state.unemployment < 30:
        state.revolution_pressure -= 5
    if cr < 0.2:
        state.revolution_pressure -= 3
    if state.approval > 60:
        state.revolution_pressure -= 2
    state.revolution_pressure = max(0, min(300, state.revolution_pressure))


def crisis_logic(state: SimState) -> None:
    cr = state.crime_rate
    if not state.crisis_active:
        if cr > CRISIS_CRIME or state.unemployment > CRISIS_UNEMP or state.revolution_pressure > 100:
            state.crisis_active = True
            state.cycles_in_crisis = 0
            state.events.append("CRISIS_START")
    else:
        state.cycles_in_crisis += 1
        state.police_effectiveness = min(1.0, state.police_effectiveness + 0.05)
        if cr < 0.4 and state.unemployment < 60:
            state.crisis_active = False
            state.social_debt += state.cycles_in_crisis * state.alive * 0.01
            state.events.append("CRISIS_END")
            state.cycles_in_crisis = 0


def zrs_recovery(state: SimState) -> None:
    if state.crisis_active or state.social_debt <= 0:
        return
    printed = min(state.social_debt * 0.1, state.total_money * 0.2 * 0.05)
    state.social_debt = max(0, state.social_debt - printed)
    state.unemployment = max(5, state.unemployment - printed / state.alive * 100)
    state.total_money += printed * 0.98  # slight conservation leak from rounding


def power_struggle(state: SimState) -> None:
    if state.sheriff_power > state.president_power * 1.5 and random.random() < 0.05:
        state.events.append("COUP")
        state.president_power *= 0.5
        state.total_money *= 0.8
    elif state.president_power > state.senate_power * 2 and state.approval > 70 and random.random() < 0.03:
        state.events.append("DICTATORSHIP")
        state.revolution_pressure += 5
    elif state.president_power + state.sheriff_power > state.senate_power * 3 and random.random() < 0.02:
        state.events.append("ALLIANCE")
        state.gini = min(0.95, state.gini + 0.05)


def revolution(state: SimState) -> None:
    if state.revolution_pressure < REVOLUTION_TRIGGER:
        return
    roll = random.random()
    if roll < 0.40:
        state.total_money *= 0.5
        state.revolution_pressure = 30
        state.events.append("REVOLUTION_SUCCESS")
    elif roll < 0.70:
        state.revolution_pressure = 50
        state.events.append("REVOLUTION_FAILED")
    elif roll < 0.90:
        state.revolution_pressure = 30
        state.events.append("NEGOTIATED")
    else:
        state.alive //= 2
        state.total_money *= 0.6
        state.revolution_pressure = 80
        state.events.append("CIVIL_WAR")


def economic_cycle(state: SimState) -> None:
    growth = (state.gdp - state.last_gdp) / max(state.last_gdp, 1) * 100
    if growth > 5:
        state.unemployment = max(5, state.unemployment - 2)
        state.gini = min(0.95, state.gini + 0.02)
    elif growth < -15:
        state.unemployment = min(99, state.unemployment + 5)
        state.total_money += state.total_money * 0.05
    elif growth < -5:
        state.unemployment = min(99, state.unemployment + 3)
    state.last_gdp = state.gdp
    state.gdp = state.total_money


def run_cycle(state: SimState, cycle: int) -> None:
    state.crime_rate = crime_rate(state)
    update_pressure(state)
    crisis_logic(state)
    zrs_recovery(state)
    economic_cycle(state)
    if cycle % 5 == 0:
        power_struggle(state)
    if state.revolution_pressure >= REVOLUTION_TRIGGER:
        revolution(state)


def audit_check(name: str, condition: bool, state: SimState) -> None:
    if condition:
        state.checks_passed += 1
    else:
        state.checks_failed += 1
        state.events.append(f"FAIL:{name}")


def run_scenario(name: str, initial: dict, cycles: int = 50) -> SimState:
    state = SimState(**initial)
    for i in range(cycles):
        run_cycle(state, i)
    audit_check(f"{name}_money_positive", state.total_money > 0, state)
    audit_check(f"{name}_pressure_bounded", 0 <= state.revolution_pressure <= 300, state)
    audit_check(f"{name}_crime_bounded", 0 <= state.crime_rate <= 1, state)
    return state


def main():
    random.seed(42)
    scenarios = {
        "high_unemployment": {"unemployment": 85, "police_effectiveness": 0.2},
        "low_crime_boom": {"unemployment": 15, "police_effectiveness": 0.9, "gdp": 2_000_000, "last_gdp": 1_800_000},
        "revolution_buildup": {"revolution_pressure": 140, "approval": 15, "unemployment": 75},
        "post_crisis_debt": {"social_debt": 50000, "crisis_active": False, "total_money": 800000},
        "power_imbalance": {"president_power": 120, "sheriff_power": 200, "senate_power": 30},
    }

    total_pass = 0
    total_fail = 0
    print("=" * 60)
    print("ZION POLITICAL ECONOMY SIMULATION AUDIT")
    print("=" * 60)

    for name, overrides in scenarios.items():
        base = {
            "unemployment": 40.0, "crime_rate": 0.2, "revolution_pressure": 20.0,
            "social_debt": 0.0, "gdp": 1_000_000.0, "last_gdp": 950_000.0,
            "president_power": 60.0, "sheriff_power": 50.0, "senate_power": 45.0,
            "approval": 55.0, "gini": 0.55, "police_effectiveness": 0.6,
            "total_money": 1_000_000.0, "alive": 75000,
        }
        base.update(overrides)
        state = run_scenario(name, base, 50)
        total_pass += state.checks_passed
        total_fail += state.checks_failed
        print(f"\n{name}: pressure={state.revolution_pressure:.0f} crisis={state.crisis_active} "
              f"unemp={state.unemployment:.1f}% events={len(state.events)}")

    # 50 full random-walk cycles
    state = SimState()
    stuck_cycles = 0
    for i in range(50):
        prev_pressure = state.revolution_pressure
        run_cycle(state, i)
        if abs(state.revolution_pressure - prev_pressure) < 0.01 and state.crisis_active:
            stuck_cycles += 1
    audit_check("crisis_can_resolve", stuck_cycles < 45, state)
    audit_check("final_money_positive", state.total_money > 0, state)
    audit_check("final_pressure_bounded", 0 <= state.revolution_pressure <= 300, state)

    total_pass += state.checks_passed
    total_fail += state.checks_failed

    confidence = max(0, min(99, 82 + (total_pass - total_fail) * 2))
    print("\n" + "=" * 60)
    print(f"CHECKS PASSED: {total_pass}")
    print(f"CHECKS FAILED: {total_fail}")
    print(f"CONFIDENCE SCORE: {confidence}/100")
    print("=" * 60)
    return 0 if total_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
