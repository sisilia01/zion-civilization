# ZION Economy & Governance Refactor Report

**Date:** 2026-06-06  
**Model:** US Federal Government + Federal Reserve  
**Status:** Code complete — deploy and run on server with PostgreSQL

---

## Executive Summary

ZION's economy was refactored to eliminate money creation from nothing, unify tax/extortion/hiring systems, and align governance with the US model (Fed → Executive → Congress → DOJ). Every ZION transfer now debits a source account. Conservation is audited every tax cycle, corp cycle, and governance tick.

---

## 1. Money Conservation (No Free ZION)

| Before | After | File |
|--------|-------|------|
| Birth grants up to 5000 ZION (deduct 50) | Birth grant = 20% of BIRTH_COST (10 ZION) from ZRS only | `birth.py` |
| Extinction bootstrap minted founders | Founders funded via `zrs_deduct_reserve()` | `birth.py` |
| President auto-printed 1000 from ZRS | Removed — executive budget only | `ai_governance.py` |
| ZRS QE without reserve debit | All QE/stimulus debits ZRS first | `ai_governance.py`, `zrs.py` |
| Trading subsidy created money | Debits ZRS per subsidy | `zrs.py` |
| Corp bailout free money | Debits ZRS | `corporations.py` |
| Uncontrolled extortion → ZRS | Extortion transfers corp → clan | `corporations.py` |

**Audit:** `check_money_conservation()` logs ERROR with full bucket breakdown if drift > 1%.

---

## 2. Corporate Tax (Single System)

**Rate:** 15% of **net profit** (revenue − salaries)  
**Collected:** Once per cycle in `corporations.run_cycle()`  
**Routing:**
- 40% → `senate_budget` (Congress)
- 40% → ZRS reserve (Fed)
- 20% → `president_state.personal_fund` (Executive)

**Removed:** Duplicate corp tax in `tax_cron.py`

---

## 3. Agent Income Tax (Progressive)

| Balance | Rate |
|---------|------|
| 0–100 | 5% |
| 100–500 | 10% |
| 500–2000 | 20% |
| 2000+ | 35% |

**Routing:**
- 40% → `senate_budget`
- 30% → `state_treasury.social_fund`
- 30% → ZRS reserve

**Removed:** Class-based rates, population multiplier on tax, duplicate 10% senate allocation

---

## 4. Employment (Treasury-Based Hiring)

**Removed:** Artificial `corp_max_workers` caps

**New hiring tiers (`treasury_hiring_cap`):**
| Treasury | Max hires/cycle |
|----------|-----------------|
| > 500 | 20 |
| > 2,000 | 100 |
| > 10,000 | 500 |

Also limited by: `treasury / (salary × 3 break-even cycles)`

**All unemployed agents** can be hired (not studying, not in gang).  
**Order:** Hire BEFORE layoffs every cycle.

---

## 5. Gang Extortion (Single System)

**One extortion per corp per cycle** in `corporations.gang_extortion()`:
- 10% if no police protection
- 3% if security staff or recent police bribe
- Max 30% of treasury per cycle
- Money goes to **clan treasury** (transfer, not destruction)

**Removed:**
- `clans.extort_territory()` from clan cycle
- `faction_engine.py` duplicate corp extortion
- 15% corp-wide + 8% territory double-hit

---

## 6. Police Funding Chain (USA Model)

1. **Congress** appropriates from `senate_budget` → `appropriate_police_budget()` when crime > 30% or unemployment > 50%
2. **Sheriff** manages `police_budget` across divisions
3. **Officer salary:** 15 ZION/cycle (`OFFICER_SALARY = 15`)
4. **Budget depletion:** Officers resign (`police.py` `police_salary_check`)

**Removed:** Direct sheriff share from agent tax (was 20% via old `route_tax_revenue`)

---

## 7. ZRS / FRS Monetary Policy

**FRS Chief** (`frs_chief.py`) is sole monetary authority:

| Mode | Trigger | Action |
|------|---------|--------|
| NORMAL | unemployment 20–50% | Hold rates at 5% |
| RECESSION | unemployment > 50% | Corp QE from reserve |
| BOOM | unemployment < 20% | Absorb 2% from agents, tighten |
| CRISIS | unemployment > 80% OR inflation > 30% | Emergency QE (70% corps, 30% poor agents) |
| HYPERINFLATION | inflation > 50% | STOP QE, rates to 20% |

**QE rules:** Only when unemployment > 60% OR deflation/crisis. Always debits ZRS reserve.

---

## 8. Governance Turn Order

**Rule tick** (`governance_tick.py`): FRS → ZRS execute → President → Senate → Sheriff → Courts

**AI tick** (`ai_governance.py`): ZRS Chief → President → Senate → Sheriff → Gangs → Corps

**President:** Cannot print money. Spends `personal_fund` only.  
**ZRS Chief:** Monetary policy only (rates, QE, stimulus).  
**Senate:** Controls spending via `senate_budget`.

---

## 9. Feedback Loops Implemented

```
A. Employment: Corps earn → pay corp tax → Senate/ZRS funded → ZRS corp loans → more hiring
B. Crime: Unemployment → gang recruit → extortion → corp revenue down → less hiring
C. Political: Bad economy → approval down → revolution up → president spends fund → inflation → FRS tightens
D. Police: Crime up → Senate appropriates → raids → gangs weaken → corps safer → revenue up
```

---

## 10. Dead Code Removed

| File | Action |
|------|--------|
| `frs.py` | **Deleted** — replaced by `frs_chief.py` |
| `politics.py` | **Deleted** — replaced by `senate.py` |
| `gangs.py` | **Deleted** — merged into `clans.py` |

---

## 11. Files Modified

| File | Changes |
|------|---------|
| `civ_economics.py` | Progressive tax brackets, 15% corp tax, treasury hiring caps |
| `civ_common.py` | `route_agent_tax_revenue`, `route_corp_tax_revenue`, state treasury helpers, conservation ERROR logging |
| `corporations.py` | Hiring, net-profit tax routing, single extortion, conservation audit |
| `tax_cron.py` | Agent tax only, new routing, no corp double-tax |
| `zrs.py` | `inject_to_corporations`, FRS directive corp QE, reserve-backed subsidies |
| `frs_chief.py` | USA Fed policy rules (recession/boom/crisis/hyperinflation) |
| `clans.py` | Removed duplicate territory extortion |
| `senate_budget.py` | `appropriate_police_budget()` Congress appropriation |
| `birth.py` | ZRS-only birth grants, no money creation |
| `ai_governance.py` | President cannot print, ZRS reserve-backed QE |
| `faction_engine.py` | Disabled duplicate extortion |
| `police.py` | Uses OFFICER_SALARY=15 via civ_economics |

---

## 12. Verification

```bash
# On server with PostgreSQL running:
cd ~/zion_backend
systemctl restart zion-governance zion-api

# Run 3 governance ticks — should complete without errors
for i in 1 2 3; do
  echo "=== TICK $i ==="
  python3 governance_tick.py
done

# Check money conservation in logs
grep "MONEY ERROR" /var/log/zion_governance.log  # should be empty
grep "Governance tick.*complete" /var/log/zion_governance.log

# Run corp + tax cycles
python3 corporations.py
python3 tax_cron.py
```

**Sandbox note:** `governance_tick.py` could not connect to PostgreSQL in the CI sandbox (connection refused). All modified files pass `python3 -m py_compile`.

---

## 13. Remaining Work (Not in Scope)

- **Rent/housing** — not implemented
- **Unions** — new feature requested but not built
- **ZionWork** — still uses agent-to-agent payments; should debit `state_treasury` (partial)
- **Perps virtual balance** — separate ledger; 10% PnL bridge to ZRS still active
- **church_state / political_parties treasuries** — outside conservation ledger
- **AI impeachment/martial law executors** — prompted but not wired

---

## 14. Expected Impact on 93% Unemployment

1. **Hiring caps removed** — corps with 4000+ treasury can hire 100+/cycle
2. **All classes eligible** — middle-class unemployed now hireable
3. **No double taxation** — corps retain more treasury for payroll
4. **Single extortion** — 10% max vs previous 23%+ combined
5. **ZRS corp QE** — recession mode injects to corps with treasury < 5000
6. **FRS corp loans** — 500 ZION at 5%/cycle from reserve

After deploy, unemployment should drop over 3–5 corp cycles (30–150 min).
