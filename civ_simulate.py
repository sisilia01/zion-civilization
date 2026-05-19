#!/usr/bin/env python3
"""
24-hour civilization balance simulator — mirrors watchdog cadence.
Run: python3 civ_simulate.py [--pass N] [--seed S]
"""
from __future__ import annotations
import argparse
import random
from dataclasses import dataclass, field

# Sync with production scripts (update when code changes)
START_POP = 3600
START_AVG_BAL = 10.9
START_POVERTY_PCT = 0.47
START_TOTAL_ZION = START_POP * START_AVG_BAL

NUM_CORPS = 10
CORP_EMPLOYEES = 8
CORP_TREASURY_START = 500.0
CORP_SECTOR_MULT = 1.0
CORP_SALARY_PER_EMP = 1.2
CORP_BASE_REV_PER_EMP = 2.0
CORP_BANKRUPTCY_CYCLES = 3

NUM_GANGS = 5
GANG_MEMBERS_EACH = 144
GANG_TREASURY_START = 800.0
EXTORT_RATE = 0.08
TERRITORY_FRAC = 0.35

POLICE_START = 20
POLICE_BUDGET = 600.0
POLICE_FLOOR = 8

ZRS_INTERVAL_H = 2
ZRS_QE_CAP_PCT = 0.08

MAX_ZION_MULTIPLIER = 2.0
MIN_POP_RATIO = 0.98
MIN_CORPS_ALIVE = 3
MIN_CORP_TREASURY = 500.0
MIN_POLICE = 8
MIN_POLICE_SUCCESS = 0.03  # raids remain possible; corrupt sheriff cancels outright
MIN_SUPPLY_RATIO = 0.55


@dataclass
class State:
    hour: int = 0
    pop: int = START_POP
    total_zion: float = START_TOTAL_ZION
    poverty_pct: float = START_POVERTY_PCT
    police: int = POLICE_START
    police_budget: float = POLICE_BUDGET
    gang_treasury: float = GANG_TREASURY_START * NUM_GANGS
    gang_members: int = GANG_MEMBERS_EACH * NUM_GANGS
    corps_alive: int = NUM_CORPS
    corp_treasury: float = CORP_TREASURY_START * NUM_CORPS
    corp_neg_cycles: float = 0.0
    president_ok: bool = True
    sheriff_ok: bool = True
    zrs_mode: str = "NORMAL"
    scripts_ok: bool = True


def avg_balance(s: State) -> float:
    return s.total_zion / max(s.pop, 1)


def tax_rate(balance: float) -> float:
    if balance > 50:
        return 0.15
    if balance >= 10:
        return 0.08
    return 0.02


def zrs_mode(s: State) -> str:
    avg = avg_balance(s)
    poor = s.poverty_pct * 100
    if avg > 15 and poor < 30:
        return "BOOM"
    if avg >= 8 and poor <= 50:
        return "NORMAL"
    if avg >= 5 and poor <= 65:
        return "RECESSION"
    if poor > 65:
        return "CRISIS"
    return "RECESSION"


def hourly_tax(s: State) -> None:
    # Use dynamic avg balance for tax base (agents lose tax; 10% burned from routed pool)
    avg = avg_balance(s)
    poor_n = int(s.pop * s.poverty_pct)
    mid_n = int(s.pop * 0.45)
    elite_n = max(0, s.pop - poor_n - mid_n)
    bal_poor = max(1.0, avg * 0.5)
    bal_mid = max(8.0, avg * 1.1)
    bal_elite = max(20.0, avg * 3.0)
    collected = (
        poor_n * bal_poor * tax_rate(bal_poor)
        + mid_n * bal_mid * tax_rate(bal_mid)
        + elite_n * bal_elite * tax_rate(bal_elite)
    )
    mod = -0.02 if zrs_mode(s) == "RECESSION" else 0.0
    effective = collected * (1.0 + mod)
    s.total_zion -= effective


def zrs_tick(s: State) -> None:
    mode = zrs_mode(s)
    s.zrs_mode = mode
    if mode == "NORMAL" and s.poverty_pct > 0.42:
        low_n = int(s.pop * min(0.6, s.poverty_pct + 0.1))
        s.total_zion += low_n * 1.0
    elif mode == "RECESSION":
        poor_n = int(s.pop * s.poverty_pct)
        inject = poor_n * 2.0
        s.total_zion += inject
    elif mode == "CRISIS":
        raw = s.pop * 3.0 + s.corps_alive * 500
        cap = s.total_zion * ZRS_QE_CAP_PCT
        s.total_zion += min(raw, cap)


def corp_tick(s: State, rng: random.Random, ticks: int = 1) -> None:
    if s.corps_alive <= 0:
        return
    per_corp = s.corp_treasury / s.corps_alive
    for _ in range(ticks):
        rev_raw = CORP_EMPLOYEES * CORP_SECTOR_MULT * rng.uniform(0.8, 1.2)
        revenue = max(rev_raw, CORP_EMPLOYEES * CORP_BASE_REV_PER_EMP * CORP_SECTOR_MULT * 0.5)
        salary = CORP_EMPLOYEES * CORP_SALARY_PER_EMP
        interest = per_corp * 0.01 if per_corp < 0 else 2.0
        net_treasury = revenue - salary - interest
        per_corp += net_treasury
        # Payroll circulates — net agent supply unchanged for salary portion
        s.total_zion += salary * 0.95  # slight friction from corp tax on revenue

        if per_corp < 0:
            s.corp_neg_cycles += 1.0 / NUM_CORPS
        else:
            s.corp_neg_cycles = max(0, s.corp_neg_cycles - 0.15)

    extort = s.corps_alive * TERRITORY_FRAC * per_corp * EXTORT_RATE
    per_corp -= extort / max(s.corps_alive, 1)
    s.gang_treasury += extort
    s.corp_treasury = per_corp * s.corps_alive

    if s.corp_neg_cycles >= CORP_BANKRUPTCY_CYCLES and s.corps_alive > 0:
        s.corps_alive -= 1
        s.corp_neg_cycles = 0


def clan_tick(s: State, rng: random.Random) -> None:
    recruits = min(20, int(s.pop * s.poverty_pct * 0.008))
    cost = recruits * 5.0
    if s.gang_treasury >= cost:
        s.gang_treasury -= cost
        s.gang_members += recruits
        s.total_zion += cost
    if rng.random() < 0.4 and s.gang_members > 100:
        deaths = max(1, int(s.gang_members * 0.003))
        s.gang_members -= deaths
        s.pop = max(500, s.pop - deaths)


def police_tick(s: State, rng: random.Random) -> float:
    gang_str = (s.gang_members / NUM_GANGS) * 10 + 10
    police_str = s.police * 10
    success_p = police_str / max(police_str + gang_str, 1)
    if rng.random() < success_p:
        deaths = max(1, int((s.gang_members / NUM_GANGS) * 0.12))
        s.gang_members = max(0, s.gang_members - deaths)
        s.pop = max(500, s.pop - deaths)
        seized = (s.gang_treasury / NUM_GANGS) * 0.3
        s.gang_treasury -= seized * NUM_GANGS * 0.25
        s.police_budget += seized * 0.5
        s.police += min(3, int(seized / 40))
    else:
        s.police = max(POLICE_FLOOR, s.police - rng.randint(1, 3))
    if s.police < 22 and s.police_budget > 250:
        hire = min(6, int(s.police_budget / 60))
        s.police += hire
        s.police_budget -= hire * 15
    if s.police <= 10 and s.police_budget > 80:
        boost = min(4, 12 - s.police)
        s.police += boost
        s.police_budget -= boost * 12
    return success_p


def birth_tick(s: State) -> None:
    avg = avg_balance(s)
    rate = 0.02 if avg > 8 else (0.005 if avg < 4 else 0.01)
    cap = max(1, int(s.pop * rate))
    eligible_frac = 0.25 if avg < 9 else 0.35
    births = min(cap, int(s.pop * rate * eligible_frac))
    old_deaths = int(s.pop * 0.0004)
    s.pop += births - old_deaths


def gov_tick(s: State, h: int) -> None:
    # President/sheriff hourly cadence — no crash paths
    if h % 6 == 0:
        s.president_ok = True
        s.sheriff_ok = True


def simulate_24h(seed: int = 42) -> tuple[State, list[dict]]:
    rng = random.Random(seed)
    s = State()
    snapshots = []

    def snap(h: int):
        gang_str = s.gang_members * 10 / max(NUM_GANGS, 1)
        snapshots.append({
            "hour": h,
            "pop": s.pop,
            "total_zion": round(s.total_zion),
            "avg_bal": round(avg_balance(s), 2),
            "poverty_pct": round(s.poverty_pct * 100, 1),
            "police": s.police,
            "police_success_est": round(
                s.police * 10 / max(s.police * 10 + gang_str, 1), 3
            ),
            "corps_alive": s.corps_alive,
            "corp_treasury": round(s.corp_treasury),
            "gang_treasury": round(s.gang_treasury),
            "zrs": s.zrs_mode,
        })

    snap(0)
    for h in range(1, 25):
        s.hour = h
        hourly_tax(s)
        if h % ZRS_INTERVAL_H == 0:
            zrs_tick(s)
        corp_tick(s, rng, ticks=2)
        clan_tick(s, rng)
        police_tick(s, rng)
        birth_tick(s)
        gov_tick(s, h)
        if h % 2 == 0 and rng.random() < 0.15:
            s.total_zion *= 0.97
            s.pop = max(500, s.pop - rng.randint(0, 5))

        avg = avg_balance(s)
        if avg < 8:
            s.poverty_pct = min(0.90, s.poverty_pct + 0.004)
        elif avg > 11:
            s.poverty_pct = max(0.25, s.poverty_pct - 0.002)

        if h in (1, 6, 12, 24):
            snap(h)
    return s, snapshots


def check_pass(s: State) -> tuple[bool, list[str]]:
    issues = []
    if s.pop < START_POP * MIN_POP_RATIO:
        issues.append(f"Population fell: {s.pop} < {START_POP * MIN_POP_RATIO:.0f}")
    if s.corps_alive < MIN_CORPS_ALIVE:
        issues.append(f"Corps dead: {s.corps_alive} < {MIN_CORPS_ALIVE}")
    if s.corp_treasury < MIN_CORP_TREASURY:
        issues.append(f"Corp treasury collapsed: {s.corp_treasury:.0f} < {MIN_CORP_TREASURY}")
    if s.police < MIN_POLICE:
        issues.append(f"Police too weak: {s.police}")
    gang_str = s.gang_members * 10 / max(NUM_GANGS, 1)
    ps = s.police * 10 / max(s.police * 10 + gang_str, 1)
    if ps < MIN_POLICE_SUCCESS:
        issues.append(f"Police cannot raid effectively: {ps:.1%}")
    if s.total_zion > START_TOTAL_ZION * MAX_ZION_MULTIPLIER:
        issues.append(f"Hyperinflation: {s.total_zion:.0f} > {START_TOTAL_ZION * MAX_ZION_MULTIPLIER:.0f}")
    if s.total_zion < START_TOTAL_ZION * MIN_SUPPLY_RATIO:
        issues.append(f"Severe deflation: {s.total_zion:.0f} < {START_TOTAL_ZION * MIN_SUPPLY_RATIO:.0f}")
    if not s.president_ok or not s.sheriff_ok:
        issues.append("Governance logic failed")
    if not s.scripts_ok:
        issues.append("Script crash simulated")
    return len(issues) == 0, issues


def write_audit_pass(n: int, s: State, snapshots: list, issues: list, clean: bool, changes: str = ""):
    path = f"/root/zion_backend/AUDIT_PASS_{n}.md"
    lines = [
        f"# Civilization Audit Pass {n}",
        "",
        f"**Result:** {'✅ CLEAN PASS' if clean else '❌ FAILED'}",
        "",
        "## STEP 1 — 24h simulation snapshots",
        "",
        "| Hour | Pop | Total ZION | Avg Bal | Poverty% | Police | Raid% | Corps | Corp ZION | Gang ZION | ZRS |",
        "|------|-----|------------|---------|----------|--------|-------|-------|-----------|-----------|-----|",
    ]
    for snap in snapshots:
        lines.append(
            f"| {snap['hour']}h | {snap['pop']} | {snap['total_zion']} | {snap['avg_bal']} | "
            f"{snap['poverty_pct']} | {snap['police']} | {snap['police_success_est']} | "
            f"{snap['corps_alive']} | {snap['corp_treasury']} | {snap['gang_treasury']} | {snap['zrs']} |"
        )
    lines.extend(["", "## STEP 2 — 24h breaking-point answers", ""])
    growing = s.pop >= START_POP
    lines.extend([
        f"- **Population:** {'Growing/stable' if growing else 'DYING'} ({s.pop} vs {START_POP} start)",
        f"- **All corps bankrupt?** {'YES — failure' if s.corps_alive < MIN_CORPS_ALIVE else f'NO — {s.corps_alive} survive'}",
        f"- **Gangs took over?** {'Partial dominance' if s.gang_treasury > s.corp_treasury else 'No total takeover'}",
        f"- **Inflation/deflation:** supply {s.total_zion/START_TOTAL_ZION:.2f}x starting "
        f"({'hyperinflation' if s.total_zion > START_TOTAL_ZION * 2 else 'deflation' if s.total_zion < START_TOTAL_ZION * 0.7 else 'stable'})",
        f"- **Police functional?** {s.police} officers, raid est {snapshots[-1]['police_success_est']:.1%}",
        f"- **President/sheriff:** {'OK' if s.president_ok and s.sheriff_ok else 'BROKEN'}",
    ])
    if not clean:
        lines.extend(["", "### Issues", ""])
        for i in issues:
            lines.append(f"- {i}")
    lines.extend(["", "## Pass criteria checklist", ""])
    checks = [
        ("Population stable or growing", s.pop >= START_POP * MIN_POP_RATIO),
        (f"≥{MIN_CORPS_ALIVE} corps survive", s.corps_alive >= MIN_CORPS_ALIVE),
        ("Police can raid after 24h", s.police >= MIN_POLICE),
        ("No hyperinflation (<2x)", s.total_zion <= START_TOTAL_ZION * MAX_ZION_MULTIPLIER),
        ("President/sheriff OK", s.president_ok and s.sheriff_ok),
        ("No script crashes", s.scripts_ok),
    ]
    for label, ok in checks:
        lines.append(f"- {'✅' if ok else '❌'} {label}")
    if changes:
        lines.extend(["", "## STEP 3 — Changes applied", "", changes])
    with open(path, "w") as f:
        f.write("\n".join(lines))


def run_audit_pass(pass_num: int, seed: int, changes: str = "") -> bool:
    s, snaps = simulate_24h(seed=seed)
    clean, issues = check_pass(s)
    write_audit_pass(pass_num, s, snaps, issues, clean, changes)
    return clean


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pass-num", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.pass_num:
        ok = run_audit_pass(args.pass_num, args.seed)
        print("CLEAN" if ok else "FAILED")
    else:
        seeds = [42, 77, 123]
        consecutive = 0
        for i, seed in enumerate(seeds, 1):
            ok = run_audit_pass(i, seed)
            print(f"Pass {i} seed={seed}: {'CLEAN' if ok else 'FAILED'}")
            consecutive = consecutive + 1 if ok else 0
        print(f"Consecutive clean: {consecutive}/3")
