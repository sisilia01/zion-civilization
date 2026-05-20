# ZION Civilization — MEGA AUDIT

**Date:** 2026-05-20  
**Scope:** `tax_cron.py`, `zrs.py`, `corporations.py`, `clans.py`, `police.py`, `president.py`, `sheriff.py`, `news.py`, `birth.py`, `education.py`, `religion.py`, `catastrophes.py`, `neo.py`, `zionwork.py`, `walrus.py`, `api.py`, `civ_common.py`, `civ_governance.py`  
**Economy model:** ~1M ZION total supply, ~2393 agents, ZRS NORMAL baseline

---

## PART 1 — LOGIC AUDIT

### 1. Police divisions vs sheriff totals

| Finding | Severity | Status |
|---------|----------|--------|
| UI shows 5 divisions (SWAT, ANTI-TAX, PRES.GUARD, ANTI-CORR, RIOT CTRL) from `police_divisions` table | — | — |
| `/eco-pol` showed only `sheriff_state.police_count` / `police_budget` | Medium | **Fixed** |
| `police_divisions` table was queried by API but **never populated** by workers | **Critical** | **Fixed** |
| Sum of division officers could diverge after raids/recruitment | Medium | **Fixed** — `sync_police_divisions()` runs each sheriff/police/president cycle |

**Fix:** `civ_common.sync_police_divisions()` splits totals 40/15/5/10/30. SWAT officers used for raid strength in `police.py`.

---

### 2. Sheriff Activity Log vs Police Wire

| Finding | Severity | Status |
|---------|----------|--------|
| Both feeds used `event_type = 'police'` via `/api/sheriff/actions` | **Critical** | **Fixed** |
| Sheriff elections, compliance, president orders mixed with raid news | High | **Fixed** |

**Fix:**
- Sheriff log: `event_type = 'sheriff_action'` (+ legacy types in `/sheriff-log`)
- Police wire: `event_type = 'police_action'` (+ legacy `police` in `/police-wire`)
- Frontend: `/api/sheriff-log` and `/api/police-wire`

---

### 3. Corporation data consistency

| Source | Query | Issue |
|--------|-------|-------|
| `/corporations` | `is_active = true` | Correct for main page corps |
| `/eco-pol` (before) | `treasury > 0` | Could count inactive corps |
| `/frs/stats` (before) | `treasury > 0` | Same mismatch |

**Status:** **Fixed** — `/eco-pol` and `/frs/stats` now use `is_active = true`.

---

### 4. President decisions → visible metrics

| Decision | Expected effect | Before | After |
|----------|-----------------|--------|-------|
| MARTIAL_LAW | Crime drops | Only +10 `police_count`, 24h flag unused in metrics | `active_effects` 48h, `crime_modifier=-0.30`, effective poverty ↓ |
| STIMULUS | Poverty drops | Direct balance update only | Balance update + `stimulus` effect banner |
| NATIONALIZE | `owner='state'` | Already in `president.py` | Unchanged |
| INVESTIGATE_SHERIFF | Sheriff log | `president` event type | `sheriff_action` event type |

**Status:** **Fixed** — `active_effects` table + ECO-POL banner.

---

### 5. ZRS actions → economy visibility

| Finding | Status |
|---------|--------|
| INJECT/ABSORB changed balances but UI had no trend | **Fixed** |
| `economy_snapshots` table added; `zrs.py` inserts each cycle | **Fixed** |
| `/eco-pol` returns last 6 snapshots + trend arrows (↑ ↓ →) | **Fixed** |

---

### 6. Gang treasury inflation

| Finding | Severity | Status |
|---------|----------|--------|
| Void Brotherhood ~26.9M ZION vs ~1M supply | **Critical data bug** | **Fixed** |
| Extortion + gang wars compounded without cap | High | **Fixed** |

**Fix:** `cap_gang_treasuries()` — `LEAST(treasury, min(total_zion * 5%, 50_000))` after extortion and each clans cycle.

---

### Cross-module issues (not in Fix list but important)

| Module | Issue | Severity |
|--------|-------|----------|
| `civ_governance.py` | Compliance now uses 24h `sheriff_orders` + 3-day tenure (prior fix) | OK |
| `zrs.py` | DEPRESSION bailout `corp_n * 20000` can drain reserve if many corps | High |
| `zrs.py` | CRISIS inject `100 ZION × all agents` large vs 1M supply | Medium |
| `api.py` `/frs/stats` | Still reads legacy `presidents` / `active_laws` tables | Medium |
| `neo.py` | Hardcoded DB connection; `clan_sabotage` can spike gang treasury (now capped) | Low |
| `catastrophes.py` | % balance damage on 2393 agents can swing ZRS state hourly | Medium |
| `zionwork.py` | Separate `jobs` economy; rewards not tied to corp treasuries | Low |
| `walrus.py` | Network-dependent; failures don't block sim | Low |
| `tax_cron.py` | Food 1 ZION/cycle + tier tax; starvation loop with ZRS floor | Medium |
| `corporations.py` | Gang extortion 15% + clans 8% double-dip on territory corps | Medium |
| `news.py` | Good dynamic headlines; gang war SQL join can duplicate | Low |
| `birth.py` | Unique names OK; population growth tied to avg balance | OK |
| `education.py` / `religion.py` | Costs scaled for 1M supply via `civ_common` | OK |
| `police.py` | Recruitment could inflate `police_count` without division sync | **Fixed** |

---

## PART 2 — 24-HOUR SIMULATION TRACE

**Assumptions:** Watchdog runs hourly crons; ~2393 agents; avg ~229 ZION; ZRS NORMAL; sheriff + president active.

| Hour | Workers (typical) | Expected state | Breaking points |
|------|-------------------|----------------|-----------------|
| 0 | genesis already done | Supply ~1M, agents classified | Re-running genesis doubles supply |
| 1 | `tax_cron` | Food -1, tier tax, revenue routed 40/30/20/10 | Mass starvation if ZRS reserve below floor |
| 2 | `zrs` HOLD | Snapshot recorded, arrows flat | — |
| 3 | `corporations` | Payroll, revenue, some bankruptcies | Corp treasury → 0 triggers inactive |
| 4 | `clans` | Extortion, maybe war | **Was:** gang treasury explodes → **Now capped** |
| 5 | `police` | SWAT raid, seize clan funds | Failed raid -officers; sync divisions |
| 6 | `sheriff` | Budget from corps, orders processed | Corrupt sheriff fakes orders |
| 7 | `president` | Decision tree, 1-3 sheriff orders | **Was:** fire sheriff at 0% compliance → **Now gated** |
| 8 | `education` / `religion` | Tuition, church milestones | Poor agents can't pay |
| 9 | `birth` | Births/deaths age 100 | Population drift |
| 10 | `news` | 5-10 headlines | — |
| 11 | `neo` | Random transfers | Rich/poor swing |
| 12 | `catastrophes` | 20% event chance | 30-60% agents hit → CRISIS next ZRS cycle |
| 13-24 | Repeat | ZRS may flip RECESSION/BOOM | DEPRESSION protocol if 2× CRISIS |

**Cascade risk (mitigated):** Gang treasury → police seize → re-extort loop inflated clans; cap breaks loop. President investigate loop on empty orders fixed earlier.

---

## PART 3 — FIXES IMPLEMENTED

### Fix 1 — Police divisions ↔ sheriff_state
- Tables: `police_divisions` in `ensure_schema()`
- `sync_police_divisions()` — 40/15/5/10/30 split
- Called from `sheriff.py`, `police.py`, `president.py`, election
- `/api/police/divisions` unchanged; data now live
- SWAT officer count drives raid power

### Fix 2 — Separate feeds
- `sheriff_action` / `police_action` event types
- `GET /sheriff-log`, `GET /police-wire`
- `page.tsx` uses separate endpoints

### Fix 3 — Gang treasury cap
- `cap_gang_treasuries()` in `clans.py` + `civ_common`

### Fix 4 — Economy trends
- `economy_snapshots` table
- `record_economy_snapshot()` in `zrs.py`
- `/eco-pol` → `economy.trend_arrows`, `economy.snapshots`

### Fix 5 — President effects visible
- `active_effects` table
- MARTIAL_LAW 48h, STIMULUS 24h
- ECO-POL active effect banner
- `effective_crime_multiplier()` affects poverty/crime display

---

## Files changed

| File | Changes |
|------|---------|
| `civ_common.py` | Schema + helpers: divisions, snapshots, effects, gang cap |
| `president.py` | Effects, division sync, sheriff_action investigate |
| `sheriff.py` | `sheriff_action` logs, division sync |
| `police.py` | `police_action` logs, SWAT, martial multiplier, sync |
| `zrs.py` | Economy snapshots |
| `clans.py` | Gang treasury cap |
| `civ_governance.py` | `sheriff_action` compliance logs |
| `api.py` | eco-pol trends/effects, sheriff-log, police-wire, corp query |
| `app/page.tsx` (frontend) | Separate feeds, trends, effect banner |

---

## Recommended follow-ups

1. Align `/frs/stats` president source with `president_state` (not `presidents`).
2. Wire ANTI-TAX / ANTI-CORR / RIOT divisions to `tax_cron`, corruption decay, revolution meter.
3. One-time SQL: `SELECT cap_gang_treasuries` via `python3 -c` or clans run on server.
4. Migrate historical `police` events or accept dual filters in API (done for wire).

---

*End of MEGA AUDIT*
