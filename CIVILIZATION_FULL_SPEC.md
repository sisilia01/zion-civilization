# ZION Civilization — Full Specification

Complete reference for all Python modules in `~/zion_backend/` and the end-to-end civilization lifecycle.

**Last updated:** 2026-06-06 (code audit + fixes)  
**Population target:** 75,000 agents  
**Orchestrator:** `watchdog.py` (systemd `zion-watchdog`) + systemd services for API, settlement, perps

---

## Code Audit Log (2026-06-06)

Spec was compared against running code. Discrepancies found and **fixed in code**:

| Issue | Was | Fix |
|-------|-----|-----|
| Sheriff term elections skipped in production | `check_term_end()` only in `sheriff.main()`, not `run_governance_tick()` | Added `check_term_end()` + no-sheriff election to governance tick path |
| President scheduled elections skipped | `should_run_scheduled_election()` only in `senate.main()` | Added to `senate.run_governance_tick()` |
| Conflicting class tiers | `faction_engine.py` used fixed balance thresholds; `tax_cron.py` uses median-based `reclassify_all_agents()` | Faction engine now calls `reclassify_all_agents()` |
| Money creation bug | Faction engine corporate boom bonus minted ZION with no source | Bonus now debits ZRS via `zrs_deduct_reserve()` |
| Money destruction bug | Faction engine mass robbery deleted ZION | Stolen total now credits top clan treasury |
| Birth children not explicitly alive | INSERT omitted `is_alive` | INSERT sets `is_alive=TRUE` |
| Stale president approval in tick summary | Summary used pre-media `data['approval']` | Refreshes approval after media/lobbying steps |
| Cron scripts crashed with traceback on DB down | Raw `psycopg2.OperationalError` | Added `civ_common.run_db_script()` wrapper for birth/tax/corps/clans |

**Spec corrections (no code change needed):**

- `news.py` **standalone** `main()` publishes headlines only; `apply_media_to_approval()` runs from **`president.run_governance_tick()`**, not from news cron.
- `clans.extort_territory()` exists but is **not called** in `run_clan_cycle()` — extortion is **`corporations.gang_extortion()`** only.
- `faction_engine` gang recruitment assigns `clan_id` **without** the 5 ZION signing bonus (`clans.recruit_poor()` pays bonus).
- `hours_in_power`, `days_in_power`, and sheriff `days_in_office` increment **once per governance/sheriff tick** (~30 min), not per calendar day/hour despite column names.
- Corp revenue formula: `employees × role_mult × sector_mult × uniform(0.9, 1.1)` per role group.
- Payroll capacity uses `BREAK_EVEN_CYCLES = 3` (treasury / (AVG_SALARY × 3)).

**Verified on production server** (`ubuntu-8gb-fsn1-1`): `governance_tick.py` and `corporations.py` complete successfully with PostgreSQL. Re-run all five scripts after deploy:

```bash
cd ~/zion_backend
for s in governance_tick corporations tax_cron birth clans; do
  python3 ${s}.py 2>&1 | tail -5
done
```

---

## Table of Contents

1. [Per-File Module Reference (60 files)](#part-1-per-file-module-reference)
2. [Agent Birth](#1-how-an-agent-is-born)
3. [Agent Life](#2-how-an-agent-lives)
4. [Agent Work](#3-how-an-agent-works)
5. [Gang Membership](#4-how-an-agent-joins-a-gang)
6. [Z-PERPS Trading](#5-how-an-agent-trades-z-perps)
7. [Agent Death](#6-how-an-agent-dies)
8. [Elections](#7-how-elections-work)
9. [AI Governance](#8-how-ai-governance-works)
10. [Money Flows](#9-how-money-flows)
11. [Full Cycle Timeline](#10-full-cycle-timeline)

---

# Part 1: Per-File Module Reference

Each file below: **purpose**, **step-by-step execution**, **DB tables**, **timing**.

---

## Core Economy & Schema

### `civ_common.py`
**Purpose:** Shared foundation — DB connection, schema migrations, revolution/uprising, tax routing, birth/death settlement, money conservation.

**Step-by-step (when imported / `ensure_schema()`):**
1. Creates/alters tables: `agents`, `corporations`, `clans`, `events`, `zrs_state`, `president_state`, `sheriff_state`, `civilization_state`, `state_treasury`, `senate_budget`, `crisis_state`, `active_effects`, `police_divisions`, `court_cases`, `governance_tick_log`, etc.
2. Provides helpers used by all workers: `log_event`, `get_conn`, `reclassify_all_agents`, `sync_police_divisions`.
3. Revolution pipeline: `compute_revolution_delta` → `update_revolution_meter` → `start_uprising` / `end_uprising` / `trigger_full_revolution`.
4. Money routing: `route_agent_tax_revenue` (40/30/30), `route_corp_tax_revenue` (40/40/20), `route_food_spending` → ZRS, `fund_birth_from_zrs`, `settle_agent_death`.
5. `check_money_conservation` sums all balances + treasuries + reserves for audit.

**DB tables:** Most civilization tables (see above).  
**Timing:** No standalone cron — library.

---

### `civ_economics.py`
**Purpose:** Economic constants and calculators — tax brackets, Gini, population pressure, hiring caps.

**Step-by-step:**
1. Defines `TARGET_POPULATION=75000`, progressive tax brackets (5/10/20/35%), class thresholds, corp tax rate 15%.
2. `calculate_agent_tax()` — marginal bracket tax on balance + ZRS modifier.
3. `agent_class_from_balance()` — six tiers vs median or fixed thresholds.
4. `dynamic_birth_rate()` / `birth_cap_for_population()` — birth scaling.
5. `fetch_live_agent_metrics()` / `fetch_economic_indicators()` — read-only snapshots.

**DB tables:** Reads `agents`, `corporations`, `zrs_state`, `economy_snapshots`.  
**Timing:** Library only.

---

### `civ_governance.py`
**Purpose:** President–Sheriff order execution, compliance, coups, dictator mechanics.

**Step-by-step (called from president/sheriff ticks):**
1. `issue_president_orders()` — president issues orders to sheriff (patrol, anti-gang, etc.).
2. `process_sheriff_orders()` — sheriff executes or ignores orders based on type/compliance.
3. `get_sheriff_compliance_metrics()` / `check_compliance()` — tracks order fulfillment; low compliance affects approval.
4. `attempt_coup()` — sheriff coup if power/corruption thresholds met.
5. `check_dictator_mode()` / anti-dictator checks — regime stability.

**DB tables:** `sheriff_orders`, `sheriff_state`, `president_state`, `agents`, `clans`.  
**Timing:** Inside `governance_tick.py` (30 min).

---

### `civ_economics.py` + `tax_cron.py`
See dedicated sections below.

---

## Population

### `birth.py`
**Purpose:** Birth/death cycle — ZRS-funded births, old age, starvation debt deaths.

**Step-by-step:**
1. `ensure_schema`, count alive agents.
2. If population = 0: extinction guard — spawn 12 founders from ZRS (50 ZION each, 20% to child).
3. Compute `dynamic_birth_rate` and `birth_cap_for_population`.
4. Death pass: age > 100 → old age; balance ≤ 0 and debt > 50 → starvation (via `settle_agent_death`).
5. Shuffle alive agents as parents; for each birth up to cap:
   - INSERT child (`education_status='child'`, balance 0, random stats, `parent_id`).
   - `fund_birth_from_zrs(child_id, 50)` — ZRS pays 50; child gets 10 (20%), 40 recycled to ZRS.
6. Commit, log stats.

**DB tables:** `agents`, `zrs_state`, `events`.  
**Timing:** Watchdog every **30 min** (`birth`).

---

### `mass_birth.py`
**Purpose:** One-shot bulk agent creation (default 1000).

**Step-by-step:**
1. Parse count from argv (default 1000).
2. Loop INSERT with random gender/name, balance 5–50, class from balance.
3. Commit every 1000 rows.

**DB tables:** `agents`.  
**Timing:** Manual only.

---

### `genesis.py`
**Purpose:** One-time redistribution of 1M ZION across agents, ZRS, corps, president.

**Step-by-step:**
1. Split 1M: 30% agents, 40% ZRS, 20% corps, 10% president `personal_fund`.
2. Equal per-agent balance, per-corp treasury, ZRS reserve.
3. `reclassify_all_agents`, commit.

**DB tables:** `agents`, `zrs_state`, `corporations`, `president_state`.  
**Timing:** Manual one-time.

---

### `names_pool.py`
**Purpose:** Static name pools + collision-free name generation.

**Step-by-step:**
1. `generate_unique_name(cur, gender)` — random first+last.
2. Check `agents` for alive name collision (up to 1000 tries).

**DB tables:** Reads `agents`.  
**Timing:** Called during birth.

---

## Tax, Food, Class

### `tax_cron.py`
**Purpose:** Hourly agent tax, food costs, hunger, reclassification, tax routing.

**Step-by-step:**
1. `ensure_schema`, load ZRS tax modifier, population multipliers.
2. `hunger_check()` — each alive agent pays food (base **1 ZION/day**, ×2 martial law, × population multiplier); health drops if underpaid; starvation deaths.
3. If ≥100 starvation deaths: senate emergency + FRS directive.
4. Progressive tax on all alive agents; halved if hungry or tax relief active; unpaid → `debt`.
5. ZRS emergency aid (10 ZION) if agent would die from debt.
6. Reclassify by median balance; increment `age_days`.
7. Route food → ZRS; route taxes (crisis → 100% sheriff, else 40% senate / 30% state / 30% ZRS).
8. `check_money_conservation`, commit.

**DB tables:** `agents`, `zrs_state`, `president_state`, `senate_budget`, `state_treasury`, `sheriff_state`, `civilization_state`, `events`.  
**Timing:** Watchdog every **1 hour** (`tax`).

---

## Corporations & Jobs

### `corporations.py`
**Purpose:** Corporate hiring, payroll, revenue, 15% profit tax, extortion, bankruptcy, lobbying.

**Step-by-step (`run_cycle`):**
1. Compute unemployment; read latest AI corp decision.
2. For each active corporation:
   - **Hire** if treasury supports (`get_hire_limit` by treasury + unemployment).
   - **Layoffs** if treasury low.
   - **Revenue** = employees × role multiplier × sector multiplier.
   - **Pay salaries** by class (critical 8, poor 10, working 15, middle 25, rich 50, elite 100).
   - **Corp tax** 15% of net profit → `route_corp_tax_revenue`.
   - **Gang extortion** 10% (3% if protected, max 30% treasury).
   - Insolvency/bankruptcy tracking.
3. If ≥3 bankruptcies: corporate crisis + ZRS bailouts (5000 each).
4. Deactivate corps with treasury ≤ 0.

**DB tables:** `corporations`, `agents`, `clans`, `sheriff_state`, `zrs_state`, `events`.  
**Timing:** Watchdog every **30 min** (`corporations`).

---

### `zionwork.py`
**Purpose:** Job marketplace — employers post tasks, workers complete instantly.

**Step-by-step:**
1. `process_firings()` — 25% chance fire recent workers (48h), charisma −2.
2. Up to 3 wealthy employers post jobs (40% chance each).
3. Employer pays reward upfront; best-skilled worker hired.
4. Worker gets 98%, 2% platform fee → ZRS.
5. Charisma +1; promotion every 5 jobs (+3 charisma).

**DB tables:** `jobs`, `agents`, `events`.  
**Timing:** Watchdog every **30 min** (`zionwork`).

---

## Gangs & Crime

### `clans.py`
**Purpose:** Gang recruitment, street crime, territory, wars, retaliation.

**Step-by-step (`run_clan_cycle`):**
1. Macro metrics → clan growth if unemployment/crime high.
2. Police defections if sheriff budget < 100.
3. Gang retaliation wave after failed SWAT raids.
4. AI may force war/recruitment.
5. `street_crime()` — poor rob rich (1–5% rate).
6. `recruit_poor()` — balance < 3, clan pays 5 ZION signing bonus.
7. `expand_territory()`, `gang_war()` (40% chance).
8. Dissolve empty clans; cap dominant gangs; cap treasuries.

**DB tables:** `clans`, `agents`, `corporations`, `clan_territory`, `sheriff_state`, `civilization_state`, `events`.  
**Timing:** Watchdog every **1 hour** (`clans`).

---

### `police.py`
**Purpose:** Police force management — recruitment, salaries, raids, protection fees.

**Step-by-step:**
1. Emergency crackdown if criminals > 30% population.
2. Sync police force to ~2% of population.
3. Collect 2% corporate protection fees → `police_budget`.
4. Presidential grant (up to 5% personal fund, max 500).
5. Pay 8 ZION/officer; underfunded → exodus.
6. SWAT raid weakest gang (unless corrupt sheriff tips off).
7. Distribute officers across 5 divisions.

**DB tables:** `agents`, `sheriff_state`, `police_divisions`, `corporations`, `clans`, `president_state`, `state_treasury`.  
**Timing:** Watchdog every **30 min** (`police`).

---

### `faction_engine.py`
**Purpose:** Cross-faction power balance — raids, lobbying, mass robbery, reclassification.

**Step-by-step:**
1. Compute gang/police/corp power scores.
2. Recruit poor into top clan if gang power > 50 (no signing bonus — unlike `clans.recruit_poor()`).
3. Police raid top clans (5% treasury confiscated → police budget).
4. Corporate lobbying: 0.1% aggregate treasury → president `personal_fund` (+corruption).
5. Corporate boom: if avg revenue > 20k, ZRS-funded bonus to working agents.
6. Mass robbery if gangs > police — stolen ZION credited to top clan treasury.
7. `reclassify_all_agents()` (median-based, same as tax cycle).

**DB tables:** `clans`, `sheriff_state`, `corporations`, `agents`, `president_state`, `events`.  
**Timing:** Watchdog every **15–30 min** random (`faction_engine`).

---

## Governance (Rule-Based)

### `governance_tick.py`
**Purpose:** Unified 30-minute democracy cycle.

**Step-by-step:**
1. Bump `governance_tick_id`, rollback stale transactions.
2. **Step 1:** FRS Chief (`run_frs_chief_tick`).
3. **Step 2:** ZRS execute directive (`execute_frs_directive`).
4. **Step 3:** President (`run_governance_tick`).
5. **Step 4:** Senate (`run_governance_tick`).
6. **Step 5:** Sheriff (`run_governance_tick`).
7. **Step 6:** Courts + money conservation.
8. Log each step to `governance_tick_log`.

**DB tables:** All governance tables.  
**Timing:** Watchdog every **30 min** (`governance`). Each step 30s timeout.

---

### `president.py`
**Purpose:** Executive branch — decisions, revolution, FRS nomination, orders.

**Step-by-step (`run_governance_tick`):**
1. Ensure president exists; approval honeymoon floor (45% if hours < 24).
2. `gather_metrics()` → `execute_decision()` (STIMULUS, MARTIAL_LAW, FUND_POLICE, etc.).
3. Increment `hours_in_power`, `days_in_power`.
4. `process_revolution_cycle`, issue sheriff orders, compliance check.
5. `apply_media_to_approval()` (news headlines ± approval).
6. `run_lobbying_tick()` from corporations.

**DB tables:** `president_state`, `sheriff_state`, `agents`, `corporations`, `zrs_state`, `active_effects`, `events`.  
**Timing:** Inside governance tick; vacancy check every 30 min via `president_check`.

---

### `senate.py`
**Purpose:** Legislature — 9 senators, law proposals/votes, impeachment, elections.

**Step-by-step (`run_governance_tick`):**
1. Ensure 9 senators (3 per party), elect Speaker.
2. Confirm pending FRS Chief.
3. Emergency session → stimulus if flagged.
4. President proposes laws (~35%); `presidential_actions`.
5. Vote all pending laws; execute effects.
6. `check_impeachment`, `run_power_struggles`, `check_coup`.
7. `run_budget_cycle`.
8. **`should_run_scheduled_election()`** — president election if `hours_in_power > 720` or approval < 10.

**DB tables:** `senate`, `senate_laws`, `elections`, `president_state`, `political_parties`, `senate_budget`, `events`.  
**Timing:** Inside governance tick (30 min); standalone `main()` also runs scheduled elections.

---

### `sheriff.py`
**Purpose:** Elected sheriff — honest/corrupt/junta types, elections, raids, coups.

**Step-by-step (`run_governance_tick`):**
1. `ensure_tables`, `reset_inherited_sheriff_approval()` (100% → 50% fix).
2. If no sheriff → `run_sheriff_election()`.
3. If approval ≤ 0 → forced election.
4. `sheriff_actions()` (increments `days_in_office`, adjusts approval).
5. Process president orders; `attempt_coup`; president interaction.
6. Corrupt sheriff may trigger court case.
7. **`check_term_end()`** — 10 tick-days per term, max 2 terms; may elect successor.
8. Sync police divisions when safe.

**DB tables:** `sheriff_state`, `agents`, `clans`, `president_state`, `police_divisions`, `court_cases`, `events`.  
**Timing:** Inside governance tick; vacancy check every 30 min (`sheriff_check`).

---

### `senate_budget.py`
**Purpose:** Senate fiscal spending — investigations, social programs, police loans.

**Step-by-step (`run_budget_cycle`):**
1. Repay expired police loans.
2. Emergency ZRS loan to police if gangs >> police.
3. If balance ≥ 200: random spend — social programs, investigation (−10 president approval), emergency session, bribes, police appropriation.

**DB tables:** `senate_budget`, `president_state`, `agents`, `sheriff_state`, `zrs_state`, `crisis_state`, `active_effects`.  
**Timing:** Watchdog **1 hour** + every governance tick (30 min).

---

### `political_economy.py`
**Purpose:** Macro feedback — crisis mode, GDP phases, power struggles, revolution.

**Step-by-step (`run_cycle`):**
1. `compute_macro_metrics` (crime, unemployment, Gini, GDP phase).
2. `update_crisis_metrics`, `manage_crisis_mode`.
3. `zrs_recovery_cycle`, `apply_economic_phase_effects`.
4. `run_power_struggles` (coup, dictatorship, alliance, senate wins).
5. `trigger_revolution` if pressure ≥ 150.

**DB tables:** `crisis_state`, `agents`, `corporations`, `zrs_state`, `president_state`, `sheriff_state`, `power_log`.  
**Timing:** Watchdog every **30 min** (`political_economy`).

---

### `political_parties.py`
**Purpose:** Three parties (Conservatives/Centrists/Populists) — members and approval.

**Step-by-step:**
1. Ensure parties exist with class-appropriate leaders.
2. `update_party_members()` — count agents per base class.
3. `update_party_approval()` — derive from demographics and wealth.

**DB tables:** `political_parties`, `party_members`, `agents`.  
**Timing:** Watchdog every **20–60 min** random.

---

### `courts.py`
**Purpose:** Resolve court cases; corruption investigations.

**Step-by-step:**
1. Optional corrupt sheriff investigation (25% chance).
2. Process up to 10 pending cases; 55% guilty rate.
3. Corruption guilty → sheriff approval −15, president −5.

**DB tables:** `court_cases`, `sheriff_state`, `president_state`, `events`.  
**Timing:** Governance tick step 6.

---

### `news.py`
**Purpose:** Dynamic headlines from DB state; media approval effect (when called from president tick).

**Step-by-step:**
1. `build_dynamic_headlines()` — uprising, hunger, bankruptcies, births, gossip.
2. Merge recent events (35 min lookback); dedupe; publish top 5–10 as `events` type `news`.
3. **`apply_media_to_approval()`** — adjusts president approval from headline tiers; called from **`president.run_governance_tick()`** only (not from standalone `news.main()`).

**DB tables:** Reads many; writes `events`; `apply_media_to_approval` also updates `president_state.approval_rating`, `civilization_state.media_sentiment`.  
**Timing:** Watchdog every **30 min** (`news`).

---

## Central Bank

### `frs_chief.py`
**Purpose:** Independent central bank governor (Fed model).

**Step-by-step:**
1. Ensure FRS chief exists (auto-nominate richest if vacant).
2. `decide_frs_directive()` — rule-based from unemployment/inflation/reserve.
3. Store in `pending_directive`; decrement term (12 cycles).
4. Senate confirms; president nominates replacements.

**DB tables:** `frs_chief_state`, `zrs_state`, `agents`, `senate`.  
**Timing:** First step of governance tick (30 min).

---

### `zrs.py`
**Purpose:** Zion Reserve System — executes FRS directives, maintenance, loans, drain.

**Step-by-step:**
1. `execute_frs_directive()` — tax_change, absorb, corp QE, emergency QE.
2. `run_zrs_maintenance()` — policy snapshot, corp lending/repayments, trading subsidy, Gini redistribution.
3. `zrs.py drain` — population wealth drain (1–20% by tier) at 100k+ pop.

**DB tables:** `zrs_state`, `zrs_policy`, `zrs_loans`, `economy_snapshots`, `agents`, `corporations`, `agent_portfolio`.  
**Timing:** Watchdog **2 hours** (`zrs`); drain **1 hour** (`zrs_drain`).

---

## AI Governance

### `ai_governance.py`
**Purpose:** Multi-agent LLM governance via OpenRouter — six factions decide and execute.

**Step-by-step (`run_ai_governance_cycle`):**
1. Load civilization state + budgets + active scenarios.
2. Sequential rounds (2s pause between):
   - **ZRS Chief** (Qwen) → **President** (GPT) → **Senate** (DeepSeek) → **Sheriff** (Gemini) → **Gangs** (Llama) → **Corporations** (Phi).
3. Each: build prompt → `ai_decide` → faction executor → update `ai_faction_memory`.
4. Coalition alerts if revolution > 70% or gang dominance.
5. Sleep 1800s; repeat.

**DB tables:** `ai_faction_memory`, all faction state tables, `events`.  
**Timing:** Self-scheduled **30 min** daemon (separate from rule-based governance tick).

---

### `scenarios.py`
**Purpose:** Declarative political scenario triggers and faction-specific AI hints.

**Step-by-step:**
1. `get_active_scenarios(state)` — evaluate 9 scenario lambdas (coup, gang takeover, economic collapse, revolution, etc.).
2. `get_scenario_hint(state, faction)` — inject hint text into AI prompts.

**Scenarios:** coup_attempt, gang_takeover, economic_collapse, revolution, sheriff_coup, senate_rebellion, corporate_takeover, police_state, zrs_collapse.  
**Timing:** Every AI governance cycle.

---

### `vip_reflection.py`
**Purpose:** Daily AI decisions for president, party leaders, clan leaders.

**Step-by-step:**
1. `reflect_president()` — DeepSeek: give_bonus, raise_taxes, anti_corruption, build_jobs, etc.
2. `reflect_party_leaders()` — campaign, protest, demand_election, fundraise.
3. `reflect_clan_leaders()` — recruit, extort, ally, expand_territory.

**DB tables:** `president_state`, `political_parties`, `clans`, `vip_memory`, `events`.  
**Timing:** Watchdog every **24 hours** (`vip_reflection`).

---

## Agent Life & Society

### `education.py`
**Purpose:** Child aging, parent fees, education paths, graduation boosts.

**Step-by-step:**
1. Church school bonus (+3 intelligence if school built).
2. Children age 0–7: parent pays **2 ZION/day** → ZRS.
3. Day 7: path by balance — university (3 days), academy (2 days), or street (+3 aggression).
4. Tuition on day 0 → ZRS; graduation stat boosts.

**DB tables:** `agents`, `church_state`, `events`.  
**Timing:** Watchdog every **1 hour** (`education`).

---

### `religion.py`
**Purpose:** Faith/prayer, tithes, church milestones, prophet speeches.

**Step-by-step:**
1. Clanless agents pray (probability ∝ faith); 0.5% balance tithe → `church_state.treasury`.
2. Milestones at treasury thresholds (clinic, hospital, school, university).
3. Prophet speech every 7th max `age_days`.

**DB tables:** `agents`, `church_state`, `events`.  
**Timing:** Watchdog every **30 min** (`religion`).

---

### `marriages.py`
**Purpose:** Same-class marriages, divorce.

**Step-by-step:**
1. Per class: pair 4 singles; 5% gift exchange (net zero).
2. 5% divorce rate → 60/40 wealth split.

**DB tables:** `marriages`, `agents`, `events`.  
**Timing:** Watchdog every **1 hour** (`marriages`).

---

### `espionage.py`
**Purpose:** Clan-vs-clan espionage — steal treasury.

**Step-by-step:**
1. Run 3 times per cycle.
2. Richest clan attacks random other; highest-aggression spy.
3. Success: steal 5–20% victim treasury (90% clan, 10% spy).
4. Failure: attacker pays 5% to victim.

**DB tables:** `clans`, `agents`, `events`.  
**Timing:** Watchdog every **1 hour** (`espionage`).

---

## Markets & Gambling

### `market.py`
**Purpose:** Resource market — food, inflation, elite trading.

**Step-by-step:**
1. Update prices from inflation + corp power.
2. Bottom 200 agents pay food or starve; agro corps get 90%, 10% ZRS.
3. Elite traders (balance > 100) earn from ZRS.

**DB tables:** `market_prices`, `agents`, `corporations`, `events`.  
**Timing:** Watchdog every **30 min** (`market`).

---

### `casino.py`
**Purpose:** Underground gambling with police raids.

**Step-by-step:**
1. Up to 10 gamblers bet min(20% balance, 50).
2. 45% win (1.5–3× from house pool + ZRS); 55% lose to ephemeral pool.
3. 20% police raid → pool to `police_budget`.

**DB tables:** `agents`, `sheriff_state`, `events`.  
**Timing:** Watchdog every **30 min** (`casino`).

---

### `zionbet.py`
**Purpose:** In-civilization prediction betting.

**Step-by-step:**
1. Up to 8 agents bet 5–15% on random YES/NO event.
2. Settle bets > 1 min old: winners 1.98× from ZRS; losers → ZRS.

**DB tables:** `bets`, `agents`.  
**Timing:** Not in watchdog — manual/external cron.

---

### `zion_bet_config.py`
**Purpose:** On-chain Move package constants and market ID helpers.

**Timing:** Config only.

---

## Disasters & Health

### `catastrophes.py`
**Purpose:** Hunger epidemics, random catastrophes, blessings.

**Step-by-step:**
1. `epidemic()` if hunger ≥ 10%.
2. 80% no catastrophe; 30% of remainder → blessing from ZRS; else 40–80% agents lose 20–60% balance (damage → ZRS).

**DB tables:** `agents`, `church_state`, `events`.  
**Timing:** Watchdog every **2 hours** (`catastrophes`).

---

### `epidemics.py`
**Purpose:** Standalone disease outbreaks with pharma treatment.

**Step-by-step:**
1. 10% epidemic chance; infect 20–100 agents.
2. Pay medicine price → survive (50% pharma, 50% ZRS); else class-weighted death.

**DB tables:** `agents`, `corporations`, `market_prices`, `president_state`.  
**Timing:** Watchdog every **2 hours** (`epidemics`).

---

### `disasters.py`
**Purpose:** Large-scale disasters (population ≥ 50k gate).

**Step-by-step:**
1. 15% trigger: epidemic, drought, gang war, financial crash, tech boom, crime wave, religious crisis.
2. Low police budget → +500 injection.

**DB tables:** `agents`, `corporations`, `clans`, `civilization_state`, `sheriff_state`.  
**Timing:** Watchdog every **45–90 min** random.

---

### `neo.py`
**Purpose:** Anonymous “NEO” system actor — wealth redistribution, prophecies.

**Step-by-step:**
1. 25% chance action: help_poor, punish_rich, random_gift (ZRS), prophecy, clan_sabotage.

**DB tables:** `agents`, `clans`, `events`.  
**Timing:** Watchdog every **1 hour** (`neo`).

---

## Trading (Perps)

### `perps_worker.py`
**Purpose:** Async perpetual futures simulation using Hyperliquid prices.

**Step-by-step (60s loop):**
1. `init_portfolios()` — $100 virtual balance per alive agent.
2. Fetch Hyperliquid mids for 9 pairs.
3. `check_and_close_positions()` — SL/TP or 20 min force close.
4. `close_position()` — PnL to portfolio; **10% of profit → ZRS**; Walrus proof on wins.
5. `open_new_trades()` — multi-timeframe TA (RSI, MACD, trend); class-based pair/size/SL/TP.
6. Every 50 cycles: update blacklist from 2h win rates.
7. Every 10 cycles: cleanup dead agents' portfolios.

**DB tables:** `agent_portfolio`, `agent_positions`, `agent_trades`, `agent_memory`, `agents`.  
**Timing:** systemd `zion-perps.service` — **60 second** loop.

---

## API & Infrastructure

### `api.py`
**Purpose:** FastAPI civilization API — stats, agents, governance, betting, ZCO, districts.

**Key civilization flows:**
- `/stats`, `/agents`, `/events`, `/clans`, `/corporations`, `/districts`.
- Governance: `/president/state`, `/sheriff/state`, `/senate`, `/crisis_state`.
- `daily_market_scheduler` — hourly resolve, generate at UTC midnight.
- `POST /cron/settle_bets` — daily bet settlement.
- Districts background refresh every 30s.

**Timing:** systemd `zion-api`; internal schedulers as above.

---

### `districts.py`
**Purpose:** Compute 15 map zone control states for frontend.

**Step-by-step:** Read agents/police/gang/events → derive police/gang/contested per zone → cache.

**Timing:** API background every **30 seconds**.

---

### `watchdog.py`
**Purpose:** Meta-orchestrator — restart all cron scripts via GNU screen.

**Step-by-step (every 30s):**
1. Check election vacancies (president/sheriff every 30 min).
2. Launch cron scripts when interval elapsed.
3. API heartbeat every ~10 min.
4. `coin_manager.py` every 4 hours.

**Timing:** systemd `zion-watchdog` — continuous.

---

### `settlement.py` / `settlement_check.py`
**Purpose:** On-chain bet settlement; Polymarket sync settlement.

**Timing:** systemd settlement (15 min loop); settlement_check hourly.

---

### `walrus.py`
**Purpose:** Store civilization snapshots on Walrus testnet.

**Timing:** Watchdog every **1 hour**.

---

### `polymarket_sync.py`
**Purpose:** Sync Polymarket Gamma API markets to DB.

**Timing:** Watchdog every **2 hours**.

---

### `coin_manager.py`
**Purpose:** Sui testnet faucet + coin merge for relayer.

**Timing:** Watchdog every **4 hours**.

---

### `zco.py` / `nautilus.py`
**Purpose:** LLM consensus oracle (3 judges) / single-agent AI decisions with on-chain proof.

**Timing:** On-demand via API.

---

### `zk_api.py` / `stealth_deposit.py` / `audit_trail.py` / `sui_tx.py` / `cache.py` / `openrouter_key.py`
**Purpose:** ZK proof proxy, stealth deposits, audit encryption, Sui CLI wrapper, TTL cache, API key helper.

**Timing:** On-demand / API infrastructure.

---

### `nft_lottery.py`
**Purpose:** Mint NFT legends for dead agents; in-world lottery among alive.

**Timing:** Manual.

---

## Simulators & Audits

### `civ_simulate.py`
**Purpose:** Offline 24-hour macro simulator mirroring watchdog cadence.

### `civ_political_simulate.py`
**Purpose:** Offline 50-cycle political stress test.

### `civ_audit_500.py`
**Purpose:** 500+ assertion audit of production formulas.

**Timing:** Manual / CI only.

---

---

# Civilization Lifecycle

---

## 1. How an Agent Is Born

### What triggers birth
- **`birth.py`** runs every **30 minutes** via watchdog.
- Birth count = `birth_cap_for_population(alive, dynamic_birth_rate(alive, TARGET_POPULATION))`.
- Target population: **75,000**. Rate scales down as population approaches target.
- **Extinction guard:** if alive count = 0, spawn **12 founders** from ZRS (no parents).

### Parameters assigned
| Field | Value |
|-------|-------|
| `name` | From `names_pool.generate_unique_name()` (gender-random) |
| `gender` | Random male/female |
| `class` | `pick_birth_class()` — poor 40%, working 35%, middle 20%, rich 4%, elite 1% |
| `balance` | 0 at INSERT; then **10 ZION** (20% of 50 birth cost) via ZRS |
| `parent_id` | Random alive parent (shuffled list) |
| `charisma`, `aggression`, `faith`, `intelligence`, `strength`, `loyalty` | Random 1–20 (faith up to 20) |
| `education_status` | `'child'` |
| `job_status` | `'unemployed'` |
| `age_days` | 0 |
| `is_alive` | TRUE |

### Starting money source
- **`fund_birth_from_zrs(cur, child_id, 50)`** in `civ_common.py`:
  1. ZRS reserve debited **50 ZION** (must pass `ZRS_RESERVE_FLOOR` check).
  2. Child receives **10 ZION** (20%).
  3. Remaining **40 ZION** recycled back to ZRS reserve.
- **No parent balance debit.** Parents are narrative only for inheritance on death.
- Founders (extinction): same 50 from ZRS, 10 to child balance.

### Who are the parents
- Any alive agent selected from shuffled `agents` list.
- One birth attempt per parent iteration until cap reached.
- Founders have `parent_id = NULL`.

### DB operations
```sql
INSERT INTO agents (name, class, balance, parent_id, gender, stats..., education_status, job_status, age_days)
VALUES (...);

-- Then:
UPDATE agents SET balance = 10 WHERE id = child_id;  -- via fund_birth_from_zrs
-- ZRS reserve -= 50, += 40 (recycle)

INSERT INTO events (event_type='birth', description=..., zion_amount=10);
```

---

## 2. How an Agent Lives

### Daily food cost
- Collected in **`tax_cron.py`** (hourly, labeled "daily"):
  - Base: **`DAILY_FOOD_COST = 1 ZION`** per agent per cycle (`civ_common.py`).
  - × **2** under martial law.
  - × **population multiplier** (1.0 at <100k, up to 4.0 at 800k+).
- Agent pays `min(food_cost, balance)`. Unpaid → health −10 (or −15 if pop ≥ 500k).
- Health ≤ 0 → starvation death.
- Food payments routed to **ZRS reserve** via `route_food_spending()`.
- **`market.py`** (30 min): separate food crisis for bottom 200 agents using dynamic food prices.

### How taxes are calculated and collected
- **`tax_cron.py`** hourly:
  - Progressive brackets on balance: **5% / 10% / 20% / 35%** (`civ_economics.AGENT_TAX_BRACKETS`).
  - Modified by ZRS `tax_modifier`, population tax multiplier, hungry agents (50% reduction), tax relief (poor/critical 50% off).
  - Paid = min(tax, balance) × tax collection multiplier (0 during uprising).
  - Unpaid portion → **`debt`** field.
- **Routing (normal):** 40% senate_budget, 30% state_treasury.social_fund, 30% ZRS.
- **Crisis routing:** 100% → sheriff `police_budget` via `route_crisis_tax()`.

### How they find work
1. **Corporations** (`corporations.py`, 30 min): hire unemployed, clanless, non-elite agents with `employer_corp_id IS NULL`.
2. **ZionWork** (`zionwork.py`, 30 min): instant task marketplace; employers post, best-skilled worker hired.
3. **Police** (`police.py`): unemployed agents recruited to police force (~2% of population).
4. **Gangs** (`clans.py`): poor agents (balance < 3) recruited with signing bonus.

### How salary is paid
- **Corporate:** `pay_salaries()` each corp cycle — class-based from corp treasury.
- **Police:** 8 ZION/officer/cycle from `police_budget`.
- **ZionWork:** 98% of task reward to worker, 2% to ZRS.

### How balance changes each cycle
| Source | Direction |
|--------|-----------|
| Food (tax_cron) | −1 ZION (scaled) |
| Tax (tax_cron) | −progressive |
| Salary (corporations) | +8–100 by class |
| ZionWork reward | +98% of task |
| Gang signing bonus | +5 |
| Street robbery | ± (poor steal from rich) |
| Birth inheritance | + (on parent death) |
| Stimulus/laws/ZRS aid | + (various) |
| Casino/zionbet/neo | ± |
| Child maintenance (education) | −2/day from parent |
| Church tithe (religion) | −0.5% balance |
| Perps | Separate `virtual_balance` (not `agents.balance`) |

### How class changes
- **`tax_cron.py`:** after tax, `agent_class_from_balance(new_balance, median_balance)`.
- Thresholds (median-scaled): poor < 0.3× median, working < 2×, middle < 10×, rich < 50×, elite ≥ 50×; balance ≤ 0 → **critical**.
- **`faction_engine.py`**, **`genesis.py`**: also call `reclassify_all_agents()`.

---

## 3. How an Agent Works

### How corporations hire
1. **`corporations.run_cycle()`** every 30 min.
2. For each active corp: compute `get_hire_limit(treasury, unemployment_rate)`.
   - Crisis (unemployment > 70%): up to 500 hires if treasury ≥ 10k.
   - Normal: up to 200 at 10k+ treasury.
3. Payroll capacity = `min(hire_limit, treasury / (AVG_SALARY × 3))`.
4. Candidates: `HIRE_CANDIDATES_SQL` — unemployed, no clan, not elite; priority middle → working → rich → poor → critical.
5. UPDATE `agents SET job_status='employed', employer_corp_id=X, job_role='worker'`.

### Salary by class
| Class | ZION/cycle |
|-------|------------|
| critical | 8 |
| poor | 10 |
| working | 15 |
| middle | 25 |
| rich | 50 |
| elite | 100 |

### How revenue is generated
- `compute_revenue()` per role group: `count × role_mult × sector_mult × random(0.9, 1.1)`.
- Role multipliers: manager 15×, worker 8×, security 0×.
- Productivity modifier from gang/police ratio may apply elsewhere in cycle.

### How corporations pay taxes
- **15% of net profit** (revenue − salaries) per cycle.
- Routed via `route_corp_tax_revenue()`:
  - **40%** → senate_budget
  - **40%** → ZRS reserve
  - **20%** → president `personal_fund`

---

## 4. How an Agent Joins a Gang

### What triggers recruitment
- **`clans.recruit_poor()`** every hour: agents with `clan_id IS NULL AND balance < 3`; clan pays **5 ZION** signing bonus.
- **`clan_growth_from_metrics()`** if unemployment > 50% or crime > 40% (inflates `members_count` without agent rows).
- **`faction_engine`**: assigns `clan_id` to poor/critical agents in bulk (**no signing bonus**).
- **AI gangs** may force extra recruitment via `clans.run_clan_cycle()`.

### Signing bonus
- **5 ZION** from clan treasury to agent balance (`RECRUIT_BONUS` in `clans.py`).

### How gang income works
- **Street crime:** poor rob rich (1–5% per poor agent per cycle); steal 10–30% victim balance.
- **Corporate extortion:** **`corporations.gang_extortion()`** only — 10% (3% if police-protected, max 30% treasury). `clans.extort_territory()` is **not** invoked in the hourly clan cycle.
- **Gang wars:** winner takes up to 25% loser treasury (cap 50k).
- **Retaliation:** after failed police raid, corps lose 6% to attacking clan.
- **Espionage:** successful spy steals 5–20% victim clan treasury.
- **Faction engine mass robbery:** working/middle agents lose 5–30 ZION → credited to top clan treasury.
- **VIP extort:** clan leader action steals 50 ZION from corps.

### How gang wars happen
- **`gang_war()`** in `clans.py`: 40% chance each cycle (or AI-forced).
- Two random clans; power based on `members_count × treasury`.
- Loser loses members and up to 25% treasury to winner.
- Logged as `clan_war` events; may boost `revolution_meter`.

---

## 5. How an Agent Trades (Z-PERPS)

### How signals are generated
- **`perps_worker.py`** fetches Hyperliquid candles (4h, 1h, 15m, 5m).
- Technical analysis per pair: **RSI, MACD, trend, volatility, volume**.
- Composite signal: direction (LONG/SHORT), strength (weak/strong), score.
- **Class-based config:** elite uses 4h/BTC-ETH; poor/critical use 5m/meme pairs; different SL/TP and position sizes.

### How positions are opened/closed
**Open:**
1. Agent needs `agent_portfolio.virtual_balance ≥ 15` and < 2 open positions.
2. Best signal above class `min_strength` threshold; not blacklisted.
3. Position size = % of virtual balance (15–80% by class).
4. INSERT `agent_positions`, `agent_trades`; deduct `virtual_balance`.

**Close:**
- Stop-loss or take-profit hit, or **force close after 20 minutes**.
- PnL = f(direction, entry, exit, size).
- Return size + PnL to `virtual_balance`; update `total_pnl`, win/loss counts.

### How profits flow back to civilization
- On winning close: **10% of PnL → ZRS reserve** via `zrs_add_reserve()`.
- Walrus proof uploaded for winning trades.
- **Perps economy is isolated** — does not directly change `agents.balance` (virtual USD in `agent_portfolio`).

---

## 6. How an Agent Dies

### All death causes
| Cause | Trigger |
|-------|---------|
| `old_age` | `age_days > 100` (birth.py) |
| `starvation` | balance ≤ 0 + debt > 50 (birth.py); health ≤ 0 from food (tax_cron); balance < 1 (catastrophes) |
| `starvation` (debt) | balance < 10 + debt > 50 after tax (tax_cron) |
| `executed` | Revolution suppressed — rebels executed (civ_common) |
| `revolution` | President killed by successful revolution |
| `oppressed by corrupt regime` | Dictator + corrupt sheriff random killings |
| `epidemic` / disease | catastrophes.py, epidemics.py, disasters.py |
| `catastrophe` | Random mass damage (catastrophes.py) |
| `police` / crackdown | emergency_criminal_crackdown (police.py) |
| Agent deceased | President agent dies → office vacated (president.py) |

### What happens to their money
- **`settle_agent_death(cur, agent_id)`** in `civ_common.py`:
  1. Read balance, `parent_id`, `clan_id`.
  2. Zero agent balance.
  3. If living parent exists → parent inherits full balance.
  4. Else → balance to **ZRS reserve**.
  5. Clear `clan_id`, `employer_corp_id`, `job_status='unemployed'`.
  6. Update clan `members_count`.

### What happens to clan/job
- `clan_id` cleared; clan member count resynced.
- `employer_corp_id` cleared; corp `employees` resynced on next corp cycle.
- **`perps_worker.cleanup_dead_agents()`** deletes portfolio/positions/trades.

---

## 7. How Elections Work

### President elections
**Regular (`senate.run_election()`):**
- Triggered when `should_run_scheduled_election()`: `hours_in_power > 720` OR `approval < 10` (and age ≥ 24 tick-hours).
- Three parties pick candidates; party approval + random noise determines winner.
- Old president: `is_active=false, phase='retired'` — approval NOT copied.
- New president INSERT: `approval_rating=50`, `corruption_index=0`, `personal_fund=500`, `days_in_power=0`, `hours_in_power=0`.
- Winner gets **50 ZION** election bonus from ZRS.

**Early/impeachment/revolution/coup:**
- **Impeachment:** approval < threshold, opposition senators, vote passes → `run_election()`.
- **Revolution success:** president executed → new election.
- **Coup:** `transfer_power()` — sheriff or general becomes president at approval 50.
- **Vacancy:** agent deceased → `run_election()`.
- **Call election:** president action via senate.

### Sheriff elections
**Regular (`sheriff.check_term_end()`):**
- Term = **10 days** (`days_in_office`); max **2 terms**.
- After 2 terms: step down → `run_sheriff_election()`.
- Junta type 40% chance refuse → coup imminent event.

**Early/forced:**
- Approval ≤ 0 → forced election.
- No active sheriff → election on tick start.
- Watchdog vacancy check runs `sheriff.py` if no active row.
- Cannot re-elect within **12 hours** of last sheriff start (unless forced).

**Election process:**
1. Top 6 charisma candidates (not president, not last sheriff).
2. Corps bribe voters (35% chance, 3% treasury each).
3. Class-weighted voting; poverty > 40% boosts honest-class candidates.
4. Winner assigned type: honest 50%, corrupt 35%, junta 15% (weighted by class demographics).
5. Inherits `police_budget` and `police_count` from outgoing sheriff.
6. New row: `approval_rating=50`, `coup_points=0`, `corruption_level=0`.

---

## 8. How AI Governance Works

### Turn order
**`ai_governance.py`** (parallel 30 min daemon, separate from rule-based tick):
1. **ZRS Chief** (Qwen)
2. **President** (GPT)
3. **Senate** (DeepSeek)
4. **Sheriff** (Gemini)
5. **Gangs** (Llama)
6. **Corporations** (Phi)

2-second pause between factions. Each reads/writes `ai_faction_memory`.

**Rule-based governance tick** (30 min): FRS Chief → ZRS → President → Senate → Sheriff → Courts.

### What each AI can do
| Faction | Actions |
|---------|---------|
| ZRS Chief | QE to corps/agents, absorb wealth, rate changes (executed via zrs.py) |
| President | give_money, tax_change, stimulate_economy, declare_emergency, hire_police, declare_dictatorship |
| Senate | Pass stimulus, tax reform, laws via ZRS spending |
| Sheriff | Raids, hiring, budget allocation, coup support |
| Gangs | recruit_members, attack_clan, extort, war |
| Corporations | recruit, bribe, bonuses to workers, lobby |

All president/sheriff spending debits personal_fund/police_budget — **no minting** except ZRS-backed actions.

### How scenarios trigger
**`scenarios.py`** — evaluated each AI cycle via `get_active_scenarios(state)`:

| Scenario | Trigger |
|----------|---------|
| coup_attempt | president approval < 20 |
| gang_takeover | gang members > 30% population |
| economic_collapse | unemployment > 80% |
| revolution | revolution_meter > 70 |
| sheriff_coup | sheriff officers > 200 AND approval < 25 |
| senate_rebellion | approval < 30 AND > 2 recent blocked laws |
| corporate_takeover | total corp treasury > 10,000 |
| police_state | sheriff officers > 300 |
| zrs_collapse | ZRS reserve below floor |

Active scenarios inject faction-specific hints into LLM prompts.

---

## 9. How Money Flows

### Text diagram

```
                         ┌─────────────────────────────────────┐
                         │         ZRS RESERVE (central)        │
                         │  birth, QE, bailouts, drain, aid     │
                         └──────────┬──────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
  ┌───────────┐              ┌────────────┐              ┌──────────────┐
  │  AGENTS   │◄────────────►│ CORPORATIONS│              │ GOVERNMENT   │
  │  balance  │   salaries   │  treasury   │              │ president    │
  └─────┬─────┘              └──────┬─────┘              │ sheriff      │
        │                           │                    │ senate_budget│
        │ food/tax                  │ corp tax 15%       │ state_treasury│
        │                           │ extortion          └──────┬───────┘
        ▼                           ▼                           │
  ┌───────────┐              ┌────────────┐                     │
  │   CLANS   │◄─ rob/extort─│            │◄── lobbying/bribes ─┘
  │  treasury │              │            │
  └───────────┘              └────────────┘

  PERPS (parallel): agent_portfolio.virtual_balance
       win PnL ──10%──► ZRS reserve

  CHURCH: tithes ──► church_state.treasury (milestones unlock bonuses)

  EXTERNAL: Sui/on-chain betting (user_bets) — separate from sim ZION
```

### Every source and destination

| Source | Destination | Mechanism |
|--------|-------------|-----------|
| ZRS reserve | New agents (birth) | 10 ZION child share; 40 recycled |
| ZRS reserve | Founders (extinction) | 12 × 50 ZION |
| ZRS reserve | Poor agents | Stimulus, amnesty, emergency aid, FRS QE |
| ZRS reserve | Corporations | Bailouts, corp loans, QE, deregulation |
| ZRS reserve | Election winner | 50 ZION bonus |
| ZRS reserve | Perps winners | 10% of virtual PnL |
| ZRS reserve | Casino/zionbet winners | Payouts |
| ZRS reserve | Catastrophe blessings | Random bonuses |
| ZRS reserve | Elite traders (market.py) | Resource trading profits |
| Agents | ZRS | Food payments, tax (30%), catastrophe damage |
| Agents | Senate budget | Tax (40%) |
| Agents | State treasury | Tax (30%) social_fund |
| Agents | Sheriff | Crisis tax (100%) |
| Agents | Agents | Marriages, street crime, neo redistribution |
| Agents | Corporations | (indirect via economy) |
| Agents | Church | 0.5% tithe |
| Agents | Pharma corps | Medicine payments (epidemics) |
| Corporations | Agents | Salaries |
| Corporations | Senate | Corp tax 40% |
| Corporations | ZRS | Corp tax 40% |
| Corporations | President | Corp tax 20%, lobbying |
| Corporations | Sheriff | Protection fees 2%, bribes |
| Corporations | Clans | Extortion 10%/3% |
| Clans | Agents | Signing bonus 5 |
| Clans | Clans | War spoils, espionage |
| President personal_fund | Poor agents | STIMULUS, give_money |
| President personal_fund | Sheriff | FUND_POLICE |
| President personal_fund | Corporations | build_jobs (VIP) |
| Senate budget | Poor agents | Social programs |
| Senate budget | Sheriff | Police appropriation, emergency loans |
| Senate budget | Investigations | (costs president approval/fund) |
| Parent | Child (on death) | Inheritance via settle_agent_death |
| Dead agent | ZRS | Inheritance if no living parent |

**Conservation:** `check_money_conservation()` sums agents + corps + clans + ZRS + government funds + church + senate_budget each governance tick.

---

## 10. Full Cycle Timeline

### Every 60 seconds
| Component | Action |
|-----------|--------|
| **`perps_worker.py`** (systemd) | Fetch Hyperliquid prices; close positions (SL/TP/20min); open new trades; 10% win PnL → ZRS; update agent_memory/blacklist |
| **`districts.py`** (API thread) | Refresh 15 zone control states every **30s** (effectively 2× per minute) |

### Every 30 minutes (watchdog cron)
| Script | Action |
|--------|--------|
| **`governance_tick.py`** | FRS → ZRS → President → Senate → Sheriff → Courts; money conservation |
| **`birth.py`** | Births, old age deaths, starvation debt deaths |
| **`corporations.py`** | Hire, fire, revenue, salaries, corp tax, extortion, bankruptcy |
| **`political_economy.py`** | Crisis mode, GDP phases, power struggles, revolution pressure |
| **`news.py`** | Publish 5–10 headlines |
| **`police.py`** | Protection fees, salaries, SWAT raids, population sync |
| **`market.py`** | Price update, food crisis, elite trading |
| **`zionwork.py`** | Job postings, firings, rewards |
| **`casino.py`** | Gambling, police raids |
| **`religion.py`** | Prayer, tithes, milestones |
| **`faction_engine.py`** | Raids, lobbying, mass robbery (15–30 min random) |
| **`ai_governance.py`** | 6-faction LLM cycle (own 30 min loop) |
| **Election checks** | Vacant president/sheriff → run election scripts |

### Every 1 hour
| Script | Action |
|--------|--------|
| **`tax_cron.py`** | Food, progressive tax, hunger, reclassify, age_days++, tax routing |
| **`clans.py`** | Recruitment, street crime, territory, gang wars |
| **`senate_budget.py`** | Social programs, investigations, police loans, bribes |
| **`neo.py`** | Random NEO redistribution/prophecy |
| **`marriages.py`** | Marriages, divorces |
| **`espionage.py`** | Clan espionage (×3 per run) |
| **`education.py`** | Child aging, tuition, graduation |
| **`zrs.py drain`** | Population wealth drain (100k+ pop) |
| **`settlement_check.py`** | Polymarket bet settlement |
| **`walrus.py`** | Civilization snapshot to Walrus |
| **`api.py` scheduler** | Resolve expired zion_markets; generate at UTC midnight |

### Every 2 hours
| Script | Action |
|--------|--------|
| **`zrs.py`** | FRS directive execution, corp loans, Gini redistribution, trading subsidy |
| **`catastrophes.py`** | Epidemics, mass damage, blessings |
| **`epidemics.py`** | Disease outbreaks, pharma treatment |
| **`polymarket_sync.py`** | Sync external Polymarket markets |

### Every 24 hours
| Script | Action |
|--------|--------|
| **`vip_reflection.py`** | AI president, party leaders, clan leaders decisions |
| **`api.py /cron/settle_bets`** | Daily on-chain bet settlement (external cron) |

### Every 4 hours
| Script | Action |
|--------|--------|
| **`coin_manager.py`** | Sui testnet faucet + coin merge |

### Continuous / on-demand
| Component | Action |
|-----------|--------|
| **`watchdog.py`** | Every 30s: check all cron intervals, API heartbeat |
| **`settlement.py`** (systemd) | 15 min loop: crypto + civ market settlement on Sui |
| **`api.py`** (systemd) | REST API, districts, market scheduler |

### Random intervals
| Script | Range |
|--------|-------|
| **`disasters.py`** | 45–90 min |
| **`political_parties.py`** | 20–60 min |
| **`faction_engine.py`** | 15–30 min |

---

## Appendix: Key Constants Quick Reference

| Constant | Value |
|----------|-------|
| TARGET_POPULATION | 75,000 |
| BIRTH_COST | 50 ZION (20% to child) |
| DAILY_FOOD_COST | 1 ZION (×2 martial law, × pop mult) |
| AGENT_TAX | 5/10/20/35% brackets |
| CORP_TAX | 15% net profit |
| Agent tax split | 40% senate / 30% state / 30% ZRS |
| Corp tax split | 40% senate / 40% ZRS / 20% president |
| GANG_SIGNING_BONUS | 5 ZION |
| GANG_EXTORTION | 10% (3% protected) |
| SHERIFF_TERM | 10 days × 2 terms |
| PRESIDENT_TERM | 720 tick-hours OR approval < 10 |
| PERPS_LOOP | 60 seconds |
| GOVERNANCE_TICK | 30 minutes |
| TAX_CYCLE | 1 hour |

---

*End of ZION Civilization Full Specification*
