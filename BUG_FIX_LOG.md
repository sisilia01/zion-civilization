# ZION Bug Fix Log

## Iteration 1 — 2026-06-06

### Known bugs fixed (8/8)

| # | Bug | Fix | File(s) |
|---|-----|-----|---------|
| 1 | Dual food drain (tax_cron + market) | Removed all food debits from market; food only in tax_cron | `market.py` |
| 2 | Double power struggles | Removed from `political_economy.run_cycle()`; kept in `senate.run_governance_tick()` | `political_economy.py`, `senate.py` |
| 3 | Dead extortion (`extort_territory`) | Deleted unused function; extortion only via `corporations.gang_extortion()` | `clans.py` |
| 4 | Double senate budget | Removed `run_budget_cycle()` from `senate.main()`; budget hourly in `senate_budget.py` only | `senate.py` |
| 5 | Double lobbying | Removed corporate lobbying block from faction_engine; kept `corporations.run_lobbying_tick()` | `faction_engine.py` |
| 6 | Clan growth without agents | Removed `clan_growth_from_metrics()`; fixed `police_defections_to_clans()` to assign real agents | `clans.py` |
| 7 | Faction engine class conflicts | Removed `reclassify_all_agents()` from faction_engine; class assignment only in tax_cron per-agent loop | `faction_engine.py` |
| 8 | Market double food | Addressed by #1 — market records prices only, no balance debits | `market.py` |

### Additional bugs found & fixed

| Bug | Fix | File(s) |
|-----|-----|---------|
| `disasters.py` gang_war inflated/shrunk `members_count` without touching agents | Kill 25% of clan agents per clan, then sync counts | `disasters.py` |
| `disasters.py` crime_spike multiplied `members_count × 3` | Recruit real poor agents into clans, then sync counts | `disasters.py` |
| `civ_governance.py` dictator gang hire added phantom members | Assign unemployed agents to top 3 clans, sync counts | `civ_governance.py` |
| `vip_reflection.py` AI recruit added +5 to count only | Assign 5 real agents, sync count | `vip_reflection.py` |
| Stale comment "Corp tax 10%" | Updated to 15% | `tax_cron.py` |
| `zrs.py` missing `run_db_script` wrapper | Added for consistent ✅/❌ exit codes | `zrs.py` |

### New tooling

- `verify_civilization.py` — money conservation, negative balances/treasuries, clan/corp count sync, employment sanity
- `run_verification_loop.sh` — runs all 6 cycle scripts + verify (for live server)

### Verification results (this environment)

```
PostgreSQL: NOT RUNNING (localhost:5432 connection refused)
```

Scripts could not complete runtime ✅ checks in sandbox. Syntax compile: **PASS** on all modified files.

### Static code audit (pass 1)

- Food debits: **single path** (`tax_cron.hunger_check`)
- Corp tax 15%: **single path** (`corporations.run_cycle`)
- Agent tax: **single path** (`tax_cron.apply_tax_cycle`)
- Gang extortion 10%: **single path** (`corporations.gang_extortion`, once per corp/cycle)
- Birth grant 10 ZION: `fund_birth_from_zrs(BIRTH_COST=50)` → 20% = 10 ZION from ZRS reserve
- Power struggles: **single path** (`senate.run_governance_tick` + `senate.main`)
- Senate budget: **single path** (`senate_budget.py` hourly cron)
- Lobbying: **single path** (`corporations.run_lobbying_tick` via president tick)
- Class assignment: **single path** (`tax_cron` per-agent `agent_class_from_balance`)

**Bugs found in static pass 1:** 0 (after fixes above)

---

## Iteration 2 — pending live DB

Run on server with PostgreSQL:

```bash
cd ~/zion_backend && bash run_verification_loop.sh
```

Requires 3 consecutive passes with zero issues from `verify_civilization.py`.

---

## Iteration 3 — pending live DB

(Same as iteration 2 — awaiting server execution)
