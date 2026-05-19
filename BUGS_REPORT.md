# ZION Civilization — Bug Audit Report

**Audit date:** 2026-05-19  
**Scope:** All civilization cron scripts vs `CIVILIZATION_LOGIC.md`

---

## Critical bugs (break the game)

| ID | Script | Issue |
|----|--------|-------|
| C1 | `zrs.py` | **Uncapped QE** prints `3 × alive_agents` (CRISIS) or `10 × alive_agents` (DEPRESSION) with no money-supply cap. Observed ~15,600 ZION/cycle with ~3,500 agents — causes hyperinflation spiral. |
| C2 | `frs.py` + `zrs.py` | **Dual central banks** both run via watchdog (`frs` every 30m, `zrs` every 2h). Both can print money and adjust rates — conflicting policy. |
| C3 | `neo.py` | **`neo_help_poor` multi-deducts** from the same rich agent once per poor recipient (5× drain). Creates/destroys ZION incorrectly. |
| C4 | `corporations.py` | **Payroll pays random agents**, not employees — `ORDER BY RANDOM() LIMIT emp` gives salary to unrelated agents; real workers never paid. |
| C5 | `tax_cron.py` | **`zrs_state.tax_modifier` never applied** — ZRS sets ±2% / +20% but tax rates ignore it. |

---

## Logic errors (game runs but wrong)

| ID | Script | Issue |
|----|--------|-------|
| L1 | `clans.py` + `corporations.py` | **Double extortion** — both take 15% of corp treasury per hour (territory in clans + `extort_corps` in corporations). |
| L2 | `police.py` | **Failed raid kills random middle/elite citizens**, not police officers — `death_cause='gang_war'` on wrong population. |
| L3 | `news.py` | **Feedback loop** — reads all `events` including prior `news` type, re-publishes as new news → event table explosion. |
| L4 | `president.py` | **Duplicate revolution systems** — legacy `check_revolution()` (dictator) AND `civ_governance.update_revolution_meter()` both fire; can double-kill president / print emergency ZION. |
| L5 | `civ_governance.py` | **Compliance rate broken** — `orders_given_cycle` counts issues same cycle sheriff hasn't processed; sheriff processes stale `pending` backlog → rate meaningless. |
| L6 | `civ_governance.py` | **`PROTECT_CORP` order** never sets `corp_name` in payload — always empty string. |
| L7 | `zrs.py` | **`determine_policy` gap** — avg 9.7, poverty 98% can be CRISIS but not RECESSION; poverty-only path skips stimulus tiers in spec. |
| L8 | `corporations.py` | **`revenue` column cumulative** — `revenue = revenue + cycle_revenue` grows unbounded; corporate tax uses inflated `last_cycle_revenue` indirectly via stale reads. |
| L9 | `sheriff.py` | **Junta coup in `sheriff_actions`** AND `civ_governance.attempt_coup` — two coup paths with different rules. |
| L10 | `birth.py` | **No old-age / disease death** from spec — only reproduction; deaths delegated to tax/other scripts. |
| L11 | `president.py` | **`run_election` charisma** — newborns start charisma 10–30 but election still picks by charisma; old presidents excluded correctly. |

---

## Balance issues

| ID | Script | Issue |
|----|--------|-------|
| B1 | `zrs.py` | CRISIS QE ~10k–15k/cycle vs avg balance ~10 — too large. **Fix: cap at 8% money supply.** |
| B2 | `clans.py` | Recruit bonus 5 ZION + territory 15% + gang war loot — gangs grow too fast vs police. |
| B3 | `tax_cron.py` | Corporate tax on cumulative `revenue` column overstates tax when corps had many good cycles. |
| B4 | `catastrophes.py` | Meteor 60% balance damage to 40–80% of agents — can wipe civilization in one tick. |
| B5 | `education.py` | Study cost 2 ZION, +2 charisma — cheap vs election threshold charisma 50+. |

---

## Missing features (in CIVILIZATION_LOGIC.md, not implemented)

| Feature | Spec section | Status |
|---------|--------------|--------|
| NEO Lottery (1% pot, 50% winner) | §10 | `neo.py` is mystery actions, not lottery |
| 10-zone territory map | §14 | Only `clan_territory` per corp |
| Gang alliances / diplomacy wars | §14 | `clan_alliances` table unused |
| Agent microloans from ZRS | §13 | Corps only |
| `events.py` raw log worker | §9 | Only `news.py` |
| ZRS tax modifier → tax_cron | §3 | Not wired |
| President decrees (formal) | §7 | Partial; orders exist |
| Martial law 24h flag | §7 | Not persisted |
| Corp employees linked to agents | §4 | `employees` is integer count only |
| Birth rate tied to avg_balance | §2 | Fixed 30% chance, not 2%/0.5% |

---

## Dead code

| Script | Unused |
|--------|--------|
| `clans.py` | `clan_alliances` table never written |
| `civ_governance.py` | `ORDER_TYPES` list never iterated |
| `politics.py` | Separate `presidents` table — superseded by `president_state` |
| `frs.py` | Entire module redundant if `zrs.py` is canonical |
| `corporations.py` | `controlled_by_clan_id` set but underused |

---

## Circular dependencies

**None hard-blocking.** Recommended order in spec is not enforced by watchdog (all staggered). Risk window:

- `tax_cron` before `corporations` → corp tax uses prior cycle revenue ✓
- `zrs` before `tax` → modifier should apply same hour (currently doesn't)
- `president` issues orders → `sheriff` processes same hour ✓ if sheriff runs after president

Watchdog runs scripts independently when interval elapses — **no global ordering**.

---

## Data consistency

| Issue | Scripts |
|-------|---------|
| Missing commits | All major scripts commit ✓ |
| `frs` + `zrs` both write `zrs_policy` / `frs_actions` | Race on policy history |
| `state_treasury` vs `president_state.personal_fund` | Tax routes to president fund directly, not `state_treasury.president_fund` |
| Stale reads | Corp tax uses `last_cycle_revenue` if corps run after tax in same hour |

---

## Watchdog conflicts (same table, overlapping schedules)

| Table | Writers (interval) |
|-------|-------------------|
| `agents.balance` | tax(1h), zrs(2h), frs(30m), corps(30m), clans(1h), birth(30m), neo(1h), catastrophes(2h), president(1h), education(2h), zionwork(30m) |
| `events` | **ALL scripts** + news(30m) duplicates |
| `corporations.treasury` | corps(30m), clans(1h), tax corp(1h), zrs(2h) |
| `president_state` | president(1h), tax(1h), civ_governance |

**Highest conflict:** `frs` + `zrs` on monetary policy; `clans` + `corporations` on corp treasury.

---

## Fixes applied (Top 5 critical)

1. **C1** — `zrs.py`: QE capped at 8% of total money supply per cycle  
2. **C3** — `neo.py`: Single rich-agent deduction, split among poor  
3. **C5** — `tax_cron.py`: Reads `zrs_state.tax_modifier` and applies to rates  
4. **C4** — `corporations.py`: Removed broken random payroll; salaries stay in expense calc only  
5. **C2** — `frs.py`: Skips QE/QT when `zrs_state` updated within 3 hours  

Additional: **L1** removed duplicate `extort_corps` from corporations; **L3** news excludes `event_type='news'` sources.

---

## Recommended next fixes (not yet done)

- Merge `frs.py` into `zrs.py` or remove `frs` from watchdog  
- Implement NEO lottery per spec  
- Fix police failed-raid casualties  
- Unify revolution into `civ_governance` only  
- Enforce watchdog run order (zrs → tax → corps → clans → police → sheriff → president → news)
