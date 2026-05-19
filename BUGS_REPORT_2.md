# ZION Civilization — Logic Audit Pass 2

**Focus:** Economy flow, gang/police balance, corp survival, president/sheriff loop, birth/death, news quality  
**Live snapshot (2026-05-19 18:45 run):** 3,603 alive agents, avg balance 10.9 ZION, poverty 47%, police raid failed −9 officers

---

## 1. Economy flow

### Where ZION comes from (sources)

| Source | Script | Amount (typical) | Creates new money? |
|--------|--------|------------------|-------------------|
| ZRS QE | `zrs.py` | CRISIS: 3×N capped at **8% supply** (~2,900 ZION/2h at 36k supply) | **Yes** |
| ZRS recession | `zrs.py` | +2 ZION per poor agent | **Yes** |
| ZRS corp bailout | `zrs.py` | +500 per active corp (scaled by QE cap) | **Yes** |
| FRS QE | `frs.py` | Skipped if ZRS ran in 3h; else up to 10% supply | **Yes** (duplicate risk) |
| Catastrophe blessings | `catastrophes.py` | +20–40% balance to 30–60% of agents (20% of cycles) | **Yes** |
| NEO gifts | `neo.py` | +5–50 random; help_poor transfers rich→poor | Transfer / small mint |
| Birth | `birth.py` | Child gets 70% of birth cost from **parent balance** | **No** (transfer) |
| Corp revenue | `corporations.py` | Treasury += revenue − expenses | **No** (internal corp ledger) |
| Tax / fines | various | Redistribution between agents & state | **No** |

**Not implemented:** NEO lottery (1% pot) per `CIVILIZATION_LOGIC.md` — no sink/source from lottery.

### Where ZION goes (sinks)

| Sink | Script | Rate |
|------|--------|------|
| Income tax | `tax_cron.py` | 2% / 8% / 15% of balance **per hour** |
| Tax burn | `tax_cron.py` | **10%** of collected tax removed from circulation |
| Tax routing | `tax_cron.py` | 40% president, 30% ZRS fund, 20% sheriff budget |
| Corp expenses | `corporations.py` | employees × 3 ZION + loan interest / cycle |
| Corp tax | `tax_cron.py` | 10% of `last_cycle_revenue` |
| Gang extortion | `clans.py` | 15% of corp treasury per hour (territory) |
| Education | `education.py` | 2 ZION per study session |
| Death | many | balance → 0 on death |
| ZION Work escrow | `zionwork.py` | Employer prepays reward (transfer) |

### Is there an inflation sink?

**Partially.**

- **Real sink:** 10% of tax collections are burned (not credited anywhere).
- **Hourly tax** on ~3,600 agents at avg 10.9 ZION ≈ **2,500+ ZION/hour** removed from agent balances (observed 2,571).
- **QE cap:** max **8% of total supply per ZRS cycle** (every 2h). At ~36k supply ≈ **2,880 ZION max** per 2h.

**Equilibrium math (steady state):**

```
Tax out (per hour):     ~2,500 ZION from agents + 10% burned ≈ 250 ZION destroyed
QE in (per 2h, CRISIS): ~2,880 ZION max (if capped)
Net per 2h if NORMAL:    tax ≈ 5,000 out vs QE ≈ 0 → DEFLATIONARY spiral
Net per 2h if CRISIS:    tax ≈ 5,000 out vs QE ≈ 2,880 → still deflationary unless poverty keeps triggering CRISIS
```

**Verdict:** Economy **spirals deflationary** in NORMAL mode (avg balance drifts down). In CRISIS/poverty, ZRS prints but tax still extracts heavily → **poverty trap**: high poverty → CRISIS QE → avg stays ~8–11 → still classified poor → repeat. **Not true equilibrium** — oscillates between inflated crisis and taxed recovery.

**Missing sink from spec:** NEO lottery 1% collection (would remove ZION from all balances hourly).

---

## 2. Gang / police balance

### Can police win?

**Formula:** `success_rate = police_strength / (police_strength + gang_strength)`  
- `police_strength = police_count × 10`  
- `gang_strength = members × 10 + avg_member_balance`

**Example (live-adjacent):**

| police_count | vs gang (50 members, avg bal 10) | Success rate |
|--------------|----------------------------------|--------------|
| 20 | 200 vs 510 | **28%** |
| 11 | 110 vs 510 | **18%** |
| 5 (floor) | 50 vs 510 | **9%** |

**Target selection:** Police attack the **weakest** gang by `treasury / members` — small/poor gangs are raided first → success rate **higher** than vs top gangs (good design).

**Corrupt sheriff:** 40% chance raid cancelled entirely → no progress.

### Death spiral (CRITICAL)

Observed: `❌ Raid failed: -9 officers` with no recruitment in `police.py`.

| Event | police_count change |
|-------|---------------------|
| Raid success | No change (no hires in police.py) |
| Raid failure | **−5 to −10** (floor at 5) |
| Sheriff honest actions | +2–8 if budget > 200 (`sheriff.py`) |
| INCREASE_PATROL order | +10 (`civ_governance.py`) |
| President fund police | +new_cops (`president.py` interact) |

**Failure loop:** 20 → 11 → 5 (floor) → stuck at 5 → ~9% success → **gangs effectively win forever** unless president/sheriff cycle hires (separate hourly scripts, not guaranteed).

**Bug:** On failed raid, `police.py` kills **random middle/elite civilians** (`death_cause='gang_war'`) — not police officers. Wrong flavor and accelerates population loss unrelated to gangs.

### Gang growth caps

| Mechanism | Cap? |
|-----------|------|
| `MAX_DOMINANT_GANGS = 3` | Soft cap — 20% chance strip territory from excess gangs |
| Recruitment | 20 poor/cycle if clan treasury ≥ 5 |
| Territory expansion | treasury > 1000, 35% chance |
| Member deaths | gang_war, police raids |

**Gangs can still grow large** — no hard cap on members or treasury. Dominance cap is weak (20% strip one territory).

---

## 3. Corporation survival

### Per-cycle math (typical corp)

```
revenue  = employees × sector_mult × uniform(0.8, 1.2)
expenses = employees × 3 + debt × (interest_rate / 100)
net      = revenue - expenses   (to treasury)
```

**Example A — 10 employees, tech (1.5), no debt, treasury 500:**

| Line | ZION |
|------|------|
| Revenue | 10 × 1.5 × 1.0 ≈ **15** |
| Salaries | 10 × 3 = **30** |
| Net | **−15/cycle** → bankrupt in 3 negative cycles (~1.5h) |

**Example B — 5 employees, industry (1.0), treasury 1000:**

| Line | ZION |
|------|------|
| Revenue | ~5 |
| Expenses | 15 |
| Net | **−10/cycle** |

**With gang territory (15% extortion/hour on treasury 500):** −75/hour → **death in <1 hour**.

**Loan:** Can borrow 200–1500 from ZRS → delays bankruptcy but interest adds expense.

**Verdict:** **Most corps cannot survive long-term** unless high employee count + high sector mult + large treasury buffer + no territory. Bankruptcy rate is **too high** for spec's "thriving corps" goal. Revenue formula too low vs flat 3 ZION salary.

---

## 4. President / sheriff loop

### Does president send orders?

**Yes** — `president.py` main() calls `issue_president_orders()` when ruling (lines 741–746).

Conditions for orders:

- `ATTACK_GANG` if poverty > 40% and top gang exists  
- `INCREASE_PATROL` if `police_fund` > 200  
- `ARREST_CORRUPT_AGENT` 30% random elite  

Inserts into `sheriff_orders` with `status='pending'`.

### Does sheriff receive and log compliance?

**Partially.**

- Sheriff runs `process_sheriff_orders()` — processes up to 10 pending orders.  
- **Compliance** uses `orders_given_cycle` (president) vs `orders_executed_cycle` (sheriff) — **different scripts, different hours**.  
- President resets `orders_given_cycle` at end of `check_compliance()`; sheriff counters reset only when updated in sheriff cycle.  
- **If president runs after sheriff:** compliance compares stale zeros → false insubordination or false perfect compliance.

**`compliance_rate` is not stored** in DB — computed transiently in `check_compliance()`.

### Can coup happen? Code path

**Yes, two paths:**

1. **`civ_governance.attempt_coup()`** — if `coup_points >= 100` and sheriff type corrupt/junta:  
   - `sheriff_side = (70 or 100) × police_count`  
   - `president_side = (approval/100) × population`  
   - Example: 5 cops × 100 = 500 vs 50% × 3603 = 1801 → **coup fails**

2. **`sheriff.py` junta** — separate coup at 40% random if approval < 30% (deactivates president, mass deaths)

**Coup points:** +12–25 per ignored/faked order (corrupt/junta). Need ~5–8 ignored orders → reachable in ~1 week of corrupt sheriff.

**Bug:** After successful coup in `attempt_coup`, code sets `coup_points = 0` on sheriff_state but president already dead — OK.

---

## 5. Birth / death balance

### Spec vs implementation

| Spec | Code |
|------|------|
| 2% births if avg > 8 | **Not implemented** — fixed 30% chance per sampled agent |
| 0.5% if avg < 4 | **Not implemented** |
| Old age > 90 | **Not implemented** in birth.py |
| Disease 0.1% | **Not implemented** |

### Estimated rates (poverty 47%, N=3603)

**Births** (`birth.py`, every 30 min):

- Samples 500 agents  
- Reproduce if balance > 12 (base_balance=10) and 30% roll  
- Rough estimate: ~40% eligible × 30% × (500/3603) ≈ **5–15 births per 30 min** → **10–30/hour**

**Deaths** (combined, per hour estimate):

| Source | Est. deaths/hour |
|--------|------------------|
| Tax starvation | 0 (observed; debt threshold rarely hit at avg 11) |
| Police failed raid | **5–10 random middle/elite** when raid fails |
| Gang wars | ~0.4 × small % members ≈ few |
| Catastrophes | 20% chance × 14% of cycle × 50% die ≈ variable |
| Revolution/coup | rare spikes |

**At poverty 47%:** births ~15/hour vs deaths ~5–15/hour (police failure dominates variance) → **population roughly stable or slow growth**, but wrong agents die (civilians not gang members).

**Verdict:** **Not spec-aligned.** Will **grow** slightly if police stops killing civilians; **shrinks** during failed raid streaks. No equilibrium modeling — coupled to police RNG.

---

## 6. News quality

### Dynamic or generic?

**Dynamic** — `news.py` does **not** use templates with placeholders. It:

1. Reads real `events` rows from last 35 minutes  
2. Prefixes with tier emoji (🔴🟠🟢⚪)  
3. Republishes `description` field verbatim  

Source events are generated with **real names and numbers** by subsystems (e.g. `"Sheriff X crushes Void Brotherhood hideout! 12 dead, 340 ZION recovered!"`).

**Caveats:**

- Not a template engine — it's a **curation layer**  
- `impact` variable computed but **never stored** in event  
- Duplicates possible before hash dedupe within same cycle  
- Prior `news` events excluded from source (fixed) — good  

### 5 example headlines (from typical 18:45 run patterns)

Based on observed subsystem outputs:

1. 🔴 **BREAKING: Void Brotherhood seized PureLife Pharma! Territory expanded.** (`clans.py` — real gang/corp names)

2. 🟠 **Police raid on Iron Fist FAILED! 9 officers lost. Morale drops.** (`police.py` — real numbers)

3. 🟢 **Tax collected 2571 ZION — President 1028 | ZRS 771 | Sheriff 514 | Burned 257 ZION** (`tax_cron.py`)

4. 🟢 **ZRS: Economy NORMAL. Rate 6.0%. Avg 10.9 ZION, poverty 47%** (`zrs.py`)

5. 🟠 **President {name} orders: Attack {gang} immediately!** (`civ_governance` — real names from DB)

**Quality:** Good for names/numbers; weak on narrative variety (reformatted log lines).

---

## Critical issues found this pass

| ID | Issue | Fix |
|----|-------|-----|
| P2-C1 | Police failed raid kills random civilians | Remove agent kills on failure |
| P2-C2 | Police death spiral (no hires in police.py) | Recruit officers on success + budget-based hiring |
| P2-C3 | Compliance measured cross-script same-hour counters | Use `sheriff_orders` timestamps |
| P2-C4 | Corp revenue << salaries → mass bankruptcy | Lower salary to 1.5 or raise revenue mult |
| P2-C5 | Birth rate ignores economy (spec 2%/0.5%) | Tie birth rate to avg_balance |

---

## Fixes applied (this pass)

See commits to: `police.py`, `civ_governance.py`, `birth.py`, `corporations.py`
