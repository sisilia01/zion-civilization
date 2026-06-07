# ZION Civilization Refactor Report — USA Democracy Model

**Date:** 2026-06-05  
**Scope:** Full `~/zion_backend/` governance refactor (7 iterations)

---

## Realism Rating: **6.5 / 10** (was ~3.5)

| Before | After |
|--------|-------|
| 4 governments writing same tables | Single `governance_tick.py` every 30 min |
| Dual gangs (clans + gangs tables) | `clans.py` only |
| ZRS + FRS + AI all set rates | FRS Chief sole monetary authority |
| Revolution meter overwritten by pressure | `civilization_state.revolution_meter` only |
| No courts, press cosmetic | `courts.py`, `news.apply_media_to_approval()` |
| Perps siloed | 10% profits → ZRS reserve |

---

## Iteration 1 — Clean Up Duplicates

| Action | Files |
|--------|-------|
| Merged `gangs.py` logic into `clans.py` | `clans.py`: `clan_growth_from_metrics`, `police_defections_to_clans`, `gang_retaliation_wave`, `run_clan_cycle()` |
| Retired `gangs.py` | Stub → calls `clans.main()` |
| Retired `frs.py` | Stub exit 0 |
| Retired `politics.py` | Stub exit 0 |
| Fixed revolution meter | `political_economy.py`: removed `pressure → meter` overwrite |

---

## Iteration 2 — Unified Governance Tick

**New:** `governance_tick.py` (watchdog every 30 min)

```
1. FRS Chief     → frs_chief.run_frs_chief_tick()
2. ZRS Execute   → zrs.execute_frs_directive()
3. President     → president.run_governance_tick()
4. Senate        → senate.run_governance_tick()
5. Sheriff       → sheriff.run_governance_tick()
6. Courts        → courts.run_courts_tick()
7. Money audit   → civ_common.check_money_conservation()
```

- Tick context stored in `civilization_state.tick_context` (JSONB)
- Step log in `governance_tick_log` + `events` (`event_type=governance`)
- Watchdog: `president`/`senate`/`sheriff` demoted to 2h backup; `governance` is canonical

---

## Iteration 3 — FRS Chief Independence (Fed Model)

**New table:** `frs_chief_state`

| Field | Purpose |
|-------|---------|
| `confirmation_status` | pending → confirmed → vacant |
| `term_cycles_remaining` | 12 cycles, president cannot fire |
| `pending_directive` | JSON monetary order |
| `model` | `microsoft/phi-4-mini-instruct` (cheapest) |

**Flow:**
1. President nominates when vacant (`frs_chief.nominate_frs_chief`)
2. Senate confirms majority next tick (`senate_confirm_frs_chief`)
3. FRS Chief decides directive (rule-based; AI-ready)
4. `zrs.py` **only executes** directive — autonomous `determine_state()` policy disabled

---

## Iteration 4 — Money Conservation

**New:** `civ_common.compute_total_zion(cur)` — sums agents, corps, clans, perps, ZRS, president, sheriff, senate, state_treasury

**New:** `check_money_conservation(cur, label)` — alerts if total shifts >1% unexpectedly

Called from: `governance_tick.py`, `tax_cron.py`

---

## Iteration 5 — Feedback Loops

| Trigger | Response | File |
|---------|----------|------|
| Starvation deaths ≥100/cycle | Senate emergency + FRS QE | `tax_cron.py` |
| SWAT raid fails | `pending_gang_retaliation` → corp extortion | `police.py`, `clans.py` |
| Corrupt sheriff (15% chance/tick) | Court case filed | `sheriff.py`, `courts.py` |
| Perps profit | 10% → ZRS reserve | `perps_worker.py` |
| Corp treasury >1000 | Lobby president (+fund, +approval) | `corporations.run_lobbying_tick()` |
| Press headlines | Approval ± via `media_sentiment` | `news.apply_media_to_approval()` |

---

## Iteration 6 — New Systems

**`courts.py`** — `court_cases` table, pending trials, corruption guilty → sheriff approval -15

**`news.py`** — `apply_media_to_approval()` wired into president governance tick

**`corporations.py`** — `run_lobbying_tick()` wired into president tick

---

## Iteration 7 — Audit Results

`python3 civ_audit_500.py`:
- **PASS:** Money conservation, tax routing, most population sims
- **REMAINING:** 20× `Class-500: rich` failures — pre-existing median-based class ladder edge case at 500 ZION balance (not introduced by this refactor)

**Impossible states mitigated:**
- Dual gang treasuries diverging → single `clans` substrate
- ZRS self-policy fighting AI → FRS Chief only
- Revolution meter tug-of-war → single meter

**Still open (future work):**
- `ai_governance.py` runs parallel 30min cycle (not merged into governance_tick)
- Sheriff module uses legacy global `conn`/`cur` (tick uses separate connection for context)
- `zionwork.py` still prints job rewards without treasury debit
- Perps `virtual_balance` not in strict conservation (tracked separately in ledger)

---

## Files Changed

| File | Change |
|------|--------|
| `governance_tick.py` | **NEW** — unified democracy cycle |
| `frs_chief.py` | **NEW** — Fed governor |
| `courts.py` | **NEW** — judiciary |
| `civ_common.py` | Schema + money ledger + tick context |
| `clans.py` | Merged gangs, retaliation |
| `gangs.py` | Retired stub |
| `frs.py` | Retired stub |
| `politics.py` | Retired stub |
| `zrs.py` | `execute_frs_directive()`, maintenance-only main |
| `president.py` | `run_governance_tick()` |
| `senate.py` | `run_governance_tick()`, `trigger_emergency_session()` |
| `sheriff.py` | `run_governance_tick()` |
| `political_economy.py` | Single revolution meter |
| `police.py` | Raid failure → retaliation flag |
| `tax_cron.py` | Starvation emergency + money check |
| `news.py` | Media → approval |
| `corporations.py` | Lobbying |
| `perps_worker.py` | 10% profit bridge |
| `watchdog.py` | `governance` cron, gangs removed |

---

## Deploy

```bash
systemctl restart zion-governance   # if ai_governance separate
systemctl restart zion-api
# Watchdog picks up governance_tick automatically
tail -f /root/zion_backend/governance.log  # or watchdog.log
```

Test manually:
```bash
cd ~/zion_backend && python3 governance_tick.py
```
