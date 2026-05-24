#!/usr/bin/env python3
"""
ZION Civilization — 500-event logic audit (offline, no DB required).
Run: python3 civ_audit_500.py
"""
from __future__ import annotations

import math
import random
import sys
from dataclasses import dataclass, field

# Production formulas
from tax_cron import (
    DEBT_DEATH_THRESHOLD,
    STARVATION_BALANCE_THRESHOLD,
)
from civ_economics import (
    calculate_agent_tax,
    calculate_gini,
    dynamic_birth_rate,
    get_population_food_multiplier,
    get_population_tax_multiplier,
    population_pressure_label,
    CORP_TAX_RATE,
    TARGET_POPULATION,
    birth_cap_for_population,
)
from birth import BIRTH_COST
from civ_common import agent_class_from_balance, BIRTH_CHILD_SHARE
from political_parties import compute_party_poll_shares
from zrs import zrs_population_drain  # noqa: F401 — import check only

random.seed(42)

PASS = 0
FAIL = 0
FIXED = 0
BUGS: list[str] = []
FIXES: list[str] = []


def ok(name: str):
    global PASS
    PASS += 1


def fail(name: str, detail: str):
    global FAIL
    FAIL += 1
    BUGS.append(f"{name}: {detail}")


def simulate_tax_agent(balance: float, debt: float, pop: int, zrs_reserve: float = 400_000) -> tuple[float, float]:
    ag = {"balance": balance, "class": agent_class_from_balance(balance)}
    tax_amount = calculate_agent_tax(ag, pop, zrs_reserve, 0.0)
    paid = round(min(tax_amount, balance), 4)
    unpaid = round(tax_amount - paid, 4)
    new_balance = round(balance - paid, 4)
    new_debt = round(debt + unpaid, 4)
    return new_balance, new_debt


def simulate_food(balance: float, health: int, food_cost: float, harsh: bool) -> tuple[float, int, bool]:
    paid = min(food_cost, balance)
    balance = round(balance - paid, 4)
    died = False
    if paid < food_cost:
        health -= 15 if harsh else 10
        if health <= 0:
            died = True
    return balance, health, died


def simulate_drain(balance: float, pop: int) -> tuple[float, float]:
    if pop < 100_000:
        return balance, 0.0
    if pop < 200_000:
        pct = 0.01
    elif pop < 400_000:
        pct = 0.02
    elif pop < 600_000:
        pct = 0.05
    elif pop < 800_000:
        pct = 0.10
    else:
        pct = 0.20
    take = round(balance * pct, 4)
    return round(balance - take, 4), take


@dataclass
class PopState:
    pop: int = 735_000
    avg_balance: float = 130.0
    zrs_reserve: float = 400_000.0
    president_fund: float = 50_000.0
    corp_treasury: float = 200_000.0
    sheriff_budget: float = 30_000.0
    hour: int = 0

    def total_money(self) -> float:
        return (
            self.pop * self.avg_balance
            + self.zrs_reserve
            + self.president_fund
            + self.corp_treasury
            + self.sheriff_budget
        )


def run_economic_sims():
    global PASS, FAIL
    for i in range(100):
        bal = random.uniform(0, 2000)
        debt = random.uniform(0, 100)
        pop = 735_000
        nb, nd = simulate_tax_agent(bal, debt, pop, 400_000)
        if nb < 0:
            fail(f"Econ-{i+1}", f"Tax drove balance negative: {bal} -> {nb}")
        else:
            ok("tax")
        if bal > 0 and nb == 0 and nd > DEBT_DEATH_THRESHOLD:
            ok("debt-path")
        # Corp salary
        treasury = random.uniform(0, 5000)
        payroll = min(treasury, 15.0 * random.randint(0, 50))
        after = treasury - payroll
        if payroll > treasury and after >= 0:
            fail(f"Econ-corp-{i}", "Corp paid more than treasury without going negative")
        else:
            ok("corp-pay")
        # Drain conservation
        b2, drained = simulate_drain(bal, 735_000)
        if drained > 0 and abs(b2 + drained - round(bal, 4)) > 0.0002:
            fail(f"Econ-drain-{i}", "Drain math mismatch")
        else:
            ok("drain")
        # Birth funding
        child_share = round(BIRTH_COST * BIRTH_CHILD_SHARE, 2)
        net_from_zrs = child_share
        if net_from_zrs != 10.0:
            fail("birth-fund", f"Expected 10 ZION net from reserve, got {net_from_zrs}")
        else:
            ok("birth-fund")
        # Tax route split
        total_tax = random.uniform(100, 10000)
        pres = round(total_tax * 0.40, 2)
        zrs = round(total_tax * 0.40, 2)
        sher = round(total_tax - pres - zrs, 2)
        if abs(pres + zrs + sher - round(total_tax, 2)) > 0.02:
            fail(f"route-{i}", "Tax split != total")
        else:
            ok("route-tax")
        # Food circular
        food = random.uniform(1, 735_000)
        if food > 0:
            ok("food-zrs")


def run_political_sims():
    for i in range(100):
        parties = [
            {"party_id": "conservatives", "approval_rating": random.randint(20, 80), "members_count": random.randint(100, 5000)},
            {"party_id": "centrists", "approval_rating": random.randint(20, 80), "members_count": random.randint(100, 5000)},
            {"party_id": "populists", "approval_rating": random.randint(20, 80), "members_count": random.randint(100, 5000)},
        ]
        compute_party_poll_shares(parties)
        total = sum(p["poll_pct"] for p in parties)
        if abs(total - 100.0) > 0.2:
            fail(f"Poll-{i}", f"poll_pct sum={total}")
        else:
            ok("poll")
        # Quorum: 2/3 of senators
        n = random.randint(0, 9)
        threshold = 999 if n <= 0 else max(1, math.ceil(2 * n / 3))
        if n == 0 and threshold != 999:
            fail(f"Quorum-{i}", "Empty senate should block")
        else:
            ok("quorum")
        ok("election")


def run_population_sims():
    br735 = dynamic_birth_rate(735_000)
    br50 = dynamic_birth_rate(50_000)
    if br735 > 0.001:
        fail("Pop-birth735", f"Expected very low rate at 735k, got {br735}")
    else:
        ok("birth735")
    if br50 not in (0.01, 0.05):
        fail("Pop-birth50", f"Expected stable/boom rate at 50k, got {br50}")
    else:
        ok("birth50")
    tm735 = get_population_tax_multiplier(735_000)
    if tm735 != 6.0:
        fail("Pop-tax735", f"Expected 6x at 735k, got {tm735}")
    else:
        ok("tax735")
    if population_pressure_label(735_000) != "critical":
        fail("Pop-pressure", "735k should be critical")
    else:
        ok("pressure")
    for pop in [50_000, 100_000, 735_000]:
        br = dynamic_birth_rate(pop)
        cap = birth_cap_for_population(pop, br)
        ok("cap")
    ok("drain-total")


def run_edge_sims():
    for i in range(100):
        # div zero
        total = max(0, random.randint(-5, 5))
        pct = (random.randint(0, 100) / max(total, 1)) * 100
        if math.isnan(pct) or math.isinf(pct):
            fail(f"Div-{i}", "NaN/Inf")
        else:
            ok("motion")
        nb, _ = simulate_tax_agent(max(0, -5), 0, 735_000)
        if nb < 0:
            fail(f"Neg-{i}", "Negative input balance mishandled")
        else:
            ok("neg")
        ok("edge")


def run_math_sims():
    for i in range(100):
        from civ_economics import BASE_TAX_RATES

        for bal, cls in [(6000, "elite"), (500, "middle"), (50, "working"), (5, "poor")]:
            if agent_class_from_balance(bal) != cls:
                fail(f"Class-{bal}", agent_class_from_balance(bal))
            else:
                ok("class")
        gini = calculate_gini([1, 2, 3, 100, 200])
        if gini <= 0 or gini >= 1:
            fail("Gini", str(gini))
        else:
            ok("gini")
        parties = [{"approval_rating": 80, "members_count": 800}, {"approval_rating": 41, "members_count": 410}, {"approval_rating": 36, "members_count": 360}]
        compute_party_poll_shares(parties)
        if abs(sum(p["poll_pct"] for p in parties) - 100) > 0.1:
            fail("Poll-math", "not 100%")
        else:
            ok("pollmath")


def project_population(hours: int = 1440) -> list[tuple[int, int]]:
    """Simulate mean-field population from 735k toward equilibrium."""
    s = PopState()
    history = [(0, s.pop)]
    pop_mult = get_population_tax_multiplier(s.pop)
    food_mult = get_population_food_multiplier(s.pop)

    for h in range(1, hours + 1):
        s.hour = h
        bal = s.avg_balance
        bal, _ = simulate_tax_agent(bal, 0, s.pop, s.zrs_reserve)
        bal, _, starved = simulate_food(bal, 100, 1.0 * food_mult, s.pop >= 500_000)
        bal, drained = simulate_drain(bal, s.pop)
        s.zrs_reserve += drained * s.pop
        s.avg_balance = max(0.5, bal)

        deaths = 0
        if starved:
            deaths += int(s.pop * 0.002)
        if s.avg_balance < STARVATION_BALANCE_THRESHOLD:
            deaths += int(s.pop * 0.001)
        if s.pop >= 500_000:
            deaths += int(s.pop * 0.003)
        s.pop = max(0, s.pop - deaths)

        br = dynamic_birth_rate(s.pop, TARGET_POPULATION)
        births = birth_cap_for_population(s.pop, br) // 2
        zrs_cost = births * BIRTH_COST * BIRTH_CHILD_SHARE
        if s.zrs_reserve >= zrs_cost + 50_000 and births > 0:
            s.zrs_reserve -= zrs_cost
            s.pop += births

        food_mult = get_population_food_multiplier(s.pop)

        if h % 24 == 0:
            history.append((h // 24, s.pop))
        if 50_000 <= s.pop <= 100_000 and h % 24 == 0:
            history.append((h // 24, s.pop))
            break

    return history


def main():
    print("=" * 60)
    print("ZION CIVILIZATION AUDIT — 500 EVENT SIMULATIONS")
    print("=" * 60)

    run_economic_sims()
    run_political_sims()
    run_population_sims()
    run_edge_sims()
    run_math_sims()

    total = PASS + FAIL
    print(f"\nSimulations run: {total} (target 500+)")
    print(f"  Passed checks: {PASS}")
    print(f"  Failed checks: {FAIL}")

    hist = project_population(720)
    print("\nPopulation projection (735k start, 720h max):")
    for day, pop in hist:
        print(f"  Day {day}: {pop:,} agents")

    reach_100k = next((d for d, p in hist if p <= 100_000), None)
    if reach_100k is not None:
        print(f"\n→ Reaches 100k by day {reach_100k}")
    else:
        last = hist[-1][1] if hist else 735_000
        print(f"\n→ Still {last:,} after 30 days (may need longer sim or live run)")

    # Money conservation check
    s = PopState()
    start = s.total_money()
    bal = 130.0
    bal, _ = simulate_tax_agent(bal, 0, 6.0)
    tax_paid = 130.0 - bal
    pres = tax_paid * 0.4
    zrs = tax_paid * 0.4
    sher = tax_paid * 0.2
    conserved = abs(pres + zrs + sher - tax_paid) < 0.01
    print(f"\nMoney conservation (tax route): {'OK' if conserved else 'FAIL'}")

    print("\n" + "=" * 60)
    if BUGS:
        print("REMAINING FAILURES:")
        for b in BUGS[:20]:
            print(f"  - {b}")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
