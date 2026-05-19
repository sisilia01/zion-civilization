# ZION Civilization Logic

Complete specification for the autonomous agent civilization simulation. Each subsystem runs as an independent cron worker against `zion_db` (PostgreSQL). Workers read shared state, mutate balances and lifecycles, emit rows to `events`, and drive the news feed.

---

## Game Loop Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZION CIVILIZATION TICK                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Every 30 min                    Every 1 hour                    Every 2 hours
  ─────────────                   ─────────────                   ──────────────
  birth.py                        tax_cron.py                     zrs.py
  events.py                       corporations.py                 (central bank + loans)
  news.py                         clans.py
                                  police.py
                                  president.py (+ orders)
                                  sheriff.py (+ compliance)
                                  neo.py

  Shared database: agents, corporations, clans, zones, president, sheriff, zrs_policy, loans, events, news
  Currency: ZION
```

### Execution Order (recommended within same wall-clock minute)

When multiple crons fire together, run in dependency order:

1. **zrs.py** (if 2h boundary) — sets macro policy, interest rates, QE/QT before taxes and corps borrow
2. **tax_cron.py** — collects revenue into state treasuries
3. **corporations.py** — revenue, payroll, loans, bankruptcy
4. **clans.py** — extortion, expansion, gang wars
5. **police.py** — raids (uses gang/police strength from step 4)
6. **sheriff.py** — executes president orders/decrees; compliance tracking; coup buildup if corrupt
7. **president.py** — reads metrics, issues decrees and direct orders, insubordination/revolution checks
8. **neo.py** — lottery draw
9. **birth.py** (30 min) — population change independent of hourly econ
10. **events.py** (30 min) — raw event log from subsystem deltas
11. **news.py** (30 min) — priority-ranked wire feed (5–10 items) for UI ticker + Eco-Pol tab

### Agent Classes (derived from balance)

| Class  | Balance (ZION) | Role                          |
|--------|----------------|-------------------------------|
| poor   | < 10           | High tax sensitivity, gang recruits |
| middle | 10 – 50        | Workforce, reproduction base    |
| elite  | > 50           | Top taxpayers, lottery winners  |

---

## 1. Taxes (`tax_cron.py`)

**Schedule:** every 1 hour  
**Module:** `tax_cron.py`

### Individual income tax

| Class  | Balance      | Rate |
|--------|--------------|------|
| Elite  | > 50         | 15%  |
| Middle | 10 – 50      | 8%   |
| Poor   | < 10         | 2%   |

```
tax_amount = balance × rate
new_balance = balance - tax_amount
```

### Tax distribution

| Destination        | Share |
|--------------------|-------|
| President fund     | 40%   |
| ZRS treasury       | 30%   |
| Sheriff budget     | 20%   |
| Burn (removed)     | 10%   |

### Insolvency and starvation

```
IF agent cannot pay full tax:
    unpaid → added to agent.debt

IF agent.debt > 5 ZION:
    agent dies (death_cause = 'starvation')
    balance = 0, is_alive = FALSE
```

### Corporate tax

```
FOR each corporation WHERE is_active = TRUE:
    corporate_tax = revenue_this_cycle × 0.10
    corp.treasury -= corporate_tax
    SPLIT corporate_tax same as individual (40/30/20/10)
```

Corporate tax runs in the same hourly pass after corp revenue is finalized (see §4) or uses prior cycle revenue if corps run after tax — **recommended:** corporations.py runs first, then tax_cron reads `last_cycle_revenue`.

### Events

- Log total tax collected and any starvation deaths to `events` (`event_type = 'tax'`).

---

## 2. Birth / Death (`birth.py`)

**Schedule:** every 30 minutes  
**Module:** `birth.py`

### Birth rate

Compute `avg_balance` across all alive agents:

| Condition              | Birth rate (% of alive per cycle) |
|------------------------|-----------------------------------|
| avg_balance > 8        | 2.0%                              |
| avg_balance < 4        | 0.5% (poverty suppresses reproduction) |
| otherwise              | interpolate or default 1.0%       |

```
num_births = floor(alive_count × birth_rate)
```

### New agent creation

- Pick random alive parent (weighted toward middle/elite with balance > 0).
- `child.balance = parent.balance × 0.20` (inherit 20% of parent balance; deduct from parent).
- `child.class` derived from starting balance.
- `child.age_days = 0`, `child.clan_id` optional inherit from parent.
- Generate unique name (see existing `birth.py` name pools).

### Death causes

| Cause            | Trigger                                      | `death_cause` value   |
|------------------|----------------------------------------------|------------------------|
| Starvation       | balance = 0 OR debt starvation (tax_cron)    | `starvation`           |
| Old age          | age_days > 90                                | `old_age`              |
| Gang war         | killed in clan/corp attack                   | `gang_war`             |
| Execution        | police/sheriff execution                     | `executed`             |
| Disease          | random 0.1% per cycle per alive agent        | `disease`              |

### Disease spread

```
FOR each agent marked sick (disease flag or recent disease death in clan):
    FOR each alive agent IN same clan_id:
        IF random() < 0.30:
            mark infected → next cycle 0.1% death check applies
```

### Events

- Birth boom / death wave counts fed to `events.py` templates.

---

## 3. ZRS Central Bank (`zrs.py`)

**Schedule:** every 2 hours  
**Module:** `zrs.py` (monetary policy; legacy alias `frs.py` in repo)

### Monitored indicators

| Metric               | Source                                      |
|----------------------|---------------------------------------------|
| `avg_balance`        | `AVG(balance)` alive agents                 |
| `poverty_pct`        | % agents with class `poor` or balance < 10  |
| `corp_treasury_total`| `SUM(treasury)` active corporations         |
| `inflation_index`    | derived: money supply growth vs prior cycle |

Persist snapshot to `zrs_policy` each run.

### Policy states

| State           | Conditions                                              | Actions |
|-----------------|---------------------------------------------------------|---------|
| **BOOM**        | avg_balance > 15 AND poverty_pct < 30%                  | Global tax modifier **+2%**; raise loan interest +1–2% |
| **NORMAL**      | avg_balance 8–15 AND poverty_pct 30–50%                 | No action |
| **RECESSION**   | avg_balance 5–8 AND poverty_pct 50–65%                    | Tax modifier **−2%**; inject **2 ZION** to each poor agent |
| **CRISIS**      | avg_balance < 5 AND poverty_pct > 65%                   | QE: print **3 ZION** per alive agent; bailout each corp **500 ZION** |
| **DEPRESSION**  | 2 consecutive CRISIS cycles                            | MEGA QE: print **10 ZION** per agent; loan interest **0%**; trigger mass hiring flag for corps |
| **HYPERINFLATION** | inflation_index exceeds threshold (too much printing) | Tax **+20%** emergency; **freeze** all corp loans |

### State machine notes

```
consecutive_crisis_count:
    IF state == CRISIS: count += 1
    ELSE: count = 0

IF consecutive_crisis_count >= 2:
    state = DEPRESSION (overrides CRISIS actions with MEGA QE)
```

### Logging

All ZRS actions → `events` with `event_type = 'zrs'`:

- `"ZRS ALERT: Economy in {state}. {action_taken}. Amount: {amount} ZION"`

Tax modifiers stack with base rates in §1 (apply as `effective_rate = base_rate + zrs_modifier`).

---

## 4. Corporations (`corporations.py`)

**Schedule:** every 1 hour  
**Module:** `corporations.py`

### Corp schema

| Field      | Description                          |
|------------|--------------------------------------|
| treasury   | liquid ZION                          |
| employees  | count of employed agents             |
| revenue    | last cycle revenue                   |
| debt       | outstanding ZRS loans                |
| sector     | determines `sector_multiplier`       |

### Sector multipliers (example)

| Sector     | Multiplier |
|------------|------------|
| tech       | 1.5        |
| finance    | 1.3        |
| industry   | 1.0        |
| agriculture| 0.8        |

### Per-cycle economics

```
revenue = employees × sector_multiplier × uniform(0.8, 1.2)
expenses = (employees × 3) + loan_interest
loan_interest = debt × (zrs_interest_rate / 100)

treasury += revenue - expenses
```

Payroll: deduct `employees × 3` from treasury, credit each employee balance (even split or per-agent employment table).

### ZRS loans

```
max_loan = 5000 ZION
IF corp requests loan AND total_debt + amount <= max_loan AND loans_not_frozen:
    corp.debt += amount
    corp.treasury += amount
    zrs_treasury -= amount (or mint if QE active)
```

### Bankruptcy

```
IF treasury < 0:
  negative_cycles += 1
ELSE:
  negative_cycles = 0

IF negative_cycles >= 3:
    corp.is_active = FALSE
    fire all employees (employment = NULL, balance unchanged)
  event: "{corp_name} BANKRUPT! {employees} workers unemployed"
    president may NATIONALIZE (see §7)
```

### Gang extortion (interaction with §5)

When clan controls `corp_id`:

```
extort_amount = corp.treasury × uniform(0.10, 0.30)
IF corp refuses or treasury insufficient:
    gang launches ATTACK CORP
```

### President nationalization

On bankrupt corp, president decree `NATIONALIZE_CORP`:

```
corp.is_active = TRUE
corp.treasury = state_injection (e.g. 1000 ZION from president fund)
corp.owner = 'state'
```

---

## 5. Gangs / Clans (`clans.py`)

**Schedule:** every 1 hour  
**Module:** `clans.py`

### Clan schema

| Field      | Description                    |
|------------|--------------------------------|
| members    | agent IDs in clan              |
| treasury   | pooled ZION                    |
| territory  | list of `corp_id` controlled   |

### Extortion

```
FOR each corp_id IN clan.territory:
    payout = corp.treasury × 0.15
    corp.treasury -= payout
    clan.treasury += payout
```

### Expansion

```
IF clan.treasury > 1000 AND random() < expansion_chance:
    target = random uncontrolled corp
    ATTACK CORP(clan, target)
```

### Attack corp resolution

```
gang_strength = member_count × avg_member_balance_factor
security_strength = corp.employees × 2 + random(0, 50)

IF gang_strength > security_strength:
    corp pays tribute (10–30% treasury)
    add corp_id to clan.territory
    possible agent deaths (gang_war)
ELSE:
    gang retreats; optional member casualties
```

### Police war (interaction with §6)

```
IF police_count > gang_strength:
    police attacks gang hideout (see police.py)
    casualties both sides
    IF gang loses:
        clear territory list (or lose subset)
        clan.treasury confiscated partially
```

### Recruitment

```
FOR each poor agent (balance < 3) without clan:
    IF clan recruiting AND clan.treasury >= 5:
        agent.balance += 5  (signing bonus)
        clan.treasury -= 5
        agent.clan_id = clan.id
```

### Gang death

```
IF alive member_count == 0:
    dissolve clan (is_active = FALSE)
    release territory
```

---

## 6. Police (`police.py`)

**Schedule:** every 1 hour  
**Module:** `police.py`

### Strength

```
police_strength = police_count × 10
gang_strength = sum(clan member combat values)  # coordinated with clans.py
```

### Each cycle

1. Select **weakest** gang hideout (lowest `gang_strength` or treasury).
2. Compute:

```
success_rate = police_strength / (police_strength + gang_strength)
```

3. Roll `random() < success_rate`:

| Outcome   | Effect |
|-----------|--------|
| **Success** | Kill 10–20% of gang members; recover 20–40% of clan treasury as stolen ZION; morale + |
| **Failure** | Lose 5–10 officers (`police_count` -= loss); morale − |

### Sheriff alignment

| Sheriff type | Behavior |
|--------------|----------|
| **Honest**   | Always executes police attacks |
| **Corrupt**  | 40% chance **tip-off** → gang escapes (no casualties, gang treasury safe) |

Tip-off logged as covert event; president `INVESTIGATE_SHERIFF` can surface pattern.

---

## 7. President (`president.py`)

**Schedule:** every 1 hour  
**Module:** `president.py`

### Reads each cycle

- Economy metrics (avg balance, poverty, unemployment)
- Crime index (gang territory %, recent deaths)
- Corp health (bankruptcies, total corp treasury)
- Approval rating
- State fund balance

### Decrees

| Decree               | Effect |
|----------------------|--------|
| `FUND_POLICE`        | Transfer **500 ZION** from president fund → sheriff budget |
| `MARTIAL_LAW`        | 24h: police attack rate ×2; approval **−20** |
| `TAX_RELIEF`         | 48h: poor tax rate **0%**; approval **+15** |
| `INVESTIGATE_SHERIFF`| If sheriff corrupt → investigation; if proven → fire + election |
| `NATIONALIZE_CORP`   | Take over bankrupt corporation (see §4) |
| `EMERGENCY_STIMULUS` | **5 ZION** to every poor agent; cost from president fund |

Decrees written to `president_decrees` (pending). Sheriff executes or ignores (§8).

### Approval model

```
approval_delta = 0

IF crime_index high:     approval_delta -= 3
IF poverty_pct high:    approval_delta -= 4
IF unemployment high:   approval_delta -= 3
IF economy strong:       approval_delta += 2
IF gangs suppressed:      approval_delta += 3
IF corps thriving:        approval_delta += 2

approval = clamp(approval + approval_delta, 0, 100)
```

### Thresholds

| Approval | Consequence |
|----------|-------------|
| < 20%    | Trigger **early election** |
| < 10%    | **Revolution** possible — citizens storm palace; president removed |

Revolution event template in §9.

---

## 8. Sheriff (`sheriff.py`)

**Schedule:** every 1 hour  
**Module:** `sheriff.py`

Sheriff types: `honest`, `corrupt`, `junta`

### Decree execution

Poll pending `president_decrees` and process according to type.

#### Honest sheriff

- Executes **all** decrees faithfully
- Attacks gangs every cycle (coordinates with police.py)
- Arrests corrupt agents (balance from bribes, flagged events)
- Approval bonus when crime falls

#### Corrupt sheriff

| Decree / action      | Behavior |
|----------------------|----------|
| `FUND_POLICE`        | **Ignore** — keeps 500 ZION |
| Gang raids           | 40% tip-off (see §6) |
| General              | Takes bribes from gang leaders (+treasury, −investigation risk) |
| `INVESTIGATE_SHERIFF`| Starts **COUP preparation** instead of complying |
| 3 ignored decrees    | **COUP ATTEMPT** → civil war scenario |

#### Junta sheriff

```
IF president.approval < 40%:
    execute decrees (stability)
ELSE:
    attempt power seizure (dictator path, block president actions)
```

### Coup / civil war

```
IF coup_attempt:
    spawn conflict: loyalist police vs junta/corrupt sheriff forces
    agent deaths, approval collapse, news REVOLUTION / CIVIL WAR templates
```

---

## 9. Events / News (`events.py`)

**Schedule:** every 30 minutes  
**Module:** `events.py` (to implement)

Reads **actual** game state deltas since last run. Inserts into `events` table for API/frontend news feed.

### Template catalog

| Situation        | Template |
|------------------|----------|
| Gang war         | `BREAKING: {gang_name} attacked {corp_name}! {deaths} dead, {zion} ZION stolen!` |
| Police victory   | `Sheriff {name} crushes {gang_name} hideout! {arrests} arrested!` |
| Economic (ZRS)   | `ZRS ALERT: Inflation at {pct}%! Emergency rate hike announced` |
| Political        | `President {name} approval crashes to {pct}%! Opposition forming` |
| Birth boom       | `POPULATION SURGE: {count} new citizens born as economy improves` |
| Death wave       | `TRAGEDY: {count} agents died of starvation this week` |
| Corp bankruptcy  | `{corp_name} BANKRUPT! {employees} workers unemployed` |
| Revolution       | `REVOLUTION BEGINS! Citizens storm presidential palace!` |
| NEO lottery      | `NEO LOTTERY: {winner_name} wins {amount} ZION!` |

### Generation rules

- Deduplicate: do not repeat identical headline within 1 hour unless magnitude changed (e.g. approval dropped another 10%).
- Prefer highest-severity event per category per cycle.
- Include `zion_amount`, `agent_id` when relevant for UI deep links.

---

## 10. NEO Lottery (`neo.py`)

**Schedule:** every 1 hour  
**Module:** `neo.py`

### Pot funding

```
pot = 0
FOR each alive agent:
    contribution = agent.balance × 0.01
    agent.balance -= contribution
    pot += contribution
```

### Draw

```
winner = random alive agent weighted by balance (optional: uniform among all)
prize = pot × 0.50
winner.balance += prize
zrs_treasury += pot × 0.50
```

### Class mobility

```
IF winner.balance > 50 after prize:
    winner.class = 'elite'
```

### News

```
event: "NEO LOTTERY: {winner_name} wins {prize:.2f} ZION! Pot was {pot:.2f} ZION"
```

---

## 11. President → Sheriff Command System

**Schedule:** every 1 hour (president issues; sheriff resolves same or next cycle)  
**Modules:** `president.py` (issuer), `sheriff.py` (executor)

Each president cycle, the president may issue **direct orders** to the sheriff in addition to formal decrees (§7). Orders are stored in `sheriff_orders` with status `pending | executed | failed | faked`.

### Orders

| Order              | Payload / effect |
|--------------------|------------------|
| `ATTACK_GANG`      | `"Attack {gang_name} immediately"` — sheriff must raid target clan within **1 cycle** |
| `INCREASE_PATROL`  | `"Add 10 officers to streets"` — `police_count += 10`; costs **state fund** (e.g. 200 ZION) |
| `ARREST_CORRUPT_AGENT` | `"Arrest agent {name} for corruption"` — target `is_alive = FALSE`, `death_cause = 'executed'` if arrest succeeds |
| `PROTECT_CORP`     | `"Assign 5 officers to guard {corp_name}"` — corp gets security buff for 24h; reduces gang extortion/attack success |

### Sheriff response by type

| Sheriff   | Behavior |
|-----------|----------|
| **HONEST**  | Executes all orders; writes `order_result` report (deaths, ZION recovered, arrests) back to president |
| **CORRUPT** | Delays execution (stays `pending` 1+ cycles), **fakes results** in report, tips off gang/agent targets before raids/arrests |
| **JUNTA**   | Executes selectively — obeys orders that grow police power or weaken president; ignores or sabotages others; builds personal loyalty base |

### Fake result (corrupt)

```
IF corrupt AND random() < 0.60:
    mark order status = 'faked'
    log success report to president (no actual raid/arrest)
    tip_off target (gang escapes or agent flees)
```

### Tracking and insubordination

Per cycle, maintain counters on `president` and `sheriff` rows:

```
orders_given   += count(new orders this president cycle)
orders_executed += count(orders completed with status executed)

compliance_rate = orders_executed / max(orders_given, 1)
```

Rolling window: last **3 president cycles**.

| Condition | Consequence |
|-----------|-------------|
| `compliance_rate < 50%` for 3 consecutive cycles | President issues `INSUBORDINATION` decree → approval hit, public investigation |
| `compliance_rate < 30%` | President **fires sheriff** → emergency sheriff election |
| Corrupt sheriff + `INVESTIGATE_SHERIFF` | Coup preparation (see §12) |

### Schema (suggested)

```sql
sheriff_orders (
  id, president_id, sheriff_id, order_type, payload JSONB,
  status, issued_at, due_by, executed_at, result_text, faked BOOLEAN
)
```

---

## 12. Coup / Revolution System

**Schedule:** evaluated each hour in `president.py`, `sheriff.py`, `clans.py`  
**News:** emitted to `events` / `news.py`

### Coup (sheriff vs president)

**Buildup**

```
IF sheriff IN (corrupt, junta):
    FOR each ignored decree OR faked/failed order:
        coup_points += 10..25

IF coup_points > 100:
    trigger COUP_ATTEMPT
```

**Battle resolution**

```
sheriff_side = sheriff_loyalty × police_count
president_side = (president_approval / 100) × alive_population

IF sheriff_side > president_side:
    COUP SUCCEEDS
ELSE:
    COUP FAILS
```

| Outcome | Effect |
|---------|--------|
| **Coup succeeds** | Sheriff becomes **dictator** (`is_dictator = TRUE`); president agent executed (`death_cause = 'coup'`); martial law auto-enabled |
| **Coup fails** | Sheriff executed; `coup_points = 0`; **emergency sheriff election** |

**News template**

```
COUP ATTEMPT! Sheriff {name} tries to seize power!
```

### Revolution (population vs president)

**Revolution meter** (0–100+, persists on `president` or `civilization_state`):

```
Each cycle IF poverty_pct > 70%:  revolution_meter += 5
Each cycle IF approval < 15%:     revolution_meter += 8
Each cycle IF starvation_deaths_this_week > 10: revolution_meter += 10  # "no food"

IF revolution_meter > 100:
    trigger UPRISING
```

**Uprising battle**

```
rebel_army = count(poor agents with balance < 3) × 2
state_force = police_count × 10

IF rebel_army > state_force:
    REVOLUTION SUCCEEDS
ELSE:
    REVOLUTION FAILS
```

| Outcome | Effect |
|---------|--------|
| **Revolution succeeds** | President executed; `revolution_meter = 0`; **new presidential election**; approval reset |
| **Revolution fails** | `MARTIAL_LAW` 48h; top rebel leaders executed; revolution_meter = 50 |

**News template**

```
REVOLUTION! Citizens storm the palace!
```

### Interaction with §8

- Corrupt sheriff ignored decrees feed **both** `coup_points` and low `compliance_rate`.
- Successful revolution can occur while coup is pending — higher severity event wins news priority (§15).

---

## 13. ZRS Loan System (detailed)

**Schedule:** loan servicing every 1 hour in `corporations.py` / `zrs.py`; applications when corp requests liquidity  
**Module:** `zrs.py` + `corporations.py`

### Corporate loans

| Parameter | Value |
|-----------|-------|
| Min loan  | 100 ZION |
| Max loan  | 5000 ZION |
| Interest rate | Set by ZRS economy state: **1%–15%** (see §3 BOOM/HYPERINFLATION) |
| Repayment | **10% of outstanding principal** per cycle, auto-deducted from corp treasury |

```
payment_due = loan_principal × 0.10
interest_portion = loan_principal × (annual_rate / 100 / cycles_per_year)

IF corp.treasury >= payment_due + interest_portion:
    deduct payment; reduce principal
ELSE:
    missed_payments += 1
    apply interest_penalty: rate += 5% (on outstanding)
```

| Missed payments | Consequence |
|-----------------|-------------|
| 1–2 | Penalty interest +5%; log ZRS warning event |
| 3 | **Loan called** — full remaining balance due immediately |
| Can't pay on call | **BANKRUPTCY** (§4): corp inactive, employees fired |

**DEPRESSION / CRISIS bailout**

```
IF zrs_policy.state IN (DEPRESSION, CRISIS):
    ZRS may forgive up to 50% of corp debt (bailout event)
    OR convert loan to 0% for 10 cycles
```

### Agent microloans

| Parameter | Value |
|-----------|-------|
| Eligibility | `class = poor`, `balance < 5`, no active microloan |
| Max amount | 10 ZION |
| Interest | 5% per cycle on outstanding |
| Purpose | Survival bridge; creates **debt spiral** risk |

```
IF agent requests microloan OR ZRS poverty program active:
    agent.balance += loan_amount
    agent.debt += loan_amount × 1.05

Each cycle:
    repay = min(agent.balance × 0.10, agent.debt)
    agent.balance -= repay
    agent.debt -= repay
```

```
IF agent dies AND agent.debt > 0:
    debt forgiven (removed from books)
    no inheritance of debt
```

### Schema (suggested)

```sql
loans (
  id, borrower_type, borrower_id, principal, rate, missed_payments,
  status, created_at, called_at
)
```

---

## 14. Gang Territory System (detailed)

**Schedule:** every 1 hour in `clans.py`; zone contests weekly  
**Module:** `clans.py`

### Territory map

City divided into **10 zones** (`zones` table):

| Field | Description |
|-------|-------------|
| `zone_id` | 1–10 |
| `controlling_gang_id` | NULL if unclaimed |
| `tax_rate` | Default 5% of income in zone |
| `safety_level` | 0–100; affects disease, random death, recruitment |

### Zone income

```
FOR each agent IN zone (by agent.home_zone or corp location):
    IF zone.controlling_gang_id IS NOT NULL:
        tribute = agent_income_this_cycle × zone.tax_rate  # default 5%
        agent.balance -= tribute
        gang.treasury += tribute
```

### Contested zones

```
IF two gangs claim same zone OR weekly contest scheduled:
    battle_score = gang_A_strength vs gang_B_strength (members × treasury factor)
    winner controls zone; loser loses claim
```

### Police zones

```
IF president OR sheriff assigns police patrol to zone:
    zone.safety_level += 20 (cap 100)
    gang activity in zone: success rates × 0.5  # crime -50%
    extortion/tribute collection blocked
```

### Martial law zone

```
IF president declares zone martial_law:
    controlling_gang_id = NULL (cleared)
    gang_activity_allowed = FALSE
    police_count effective × 2 in zone
```

### Gang diplomacy

| Action | Effect |
|--------|--------|
| **ALLIANCE** | Two gangs share territory income 50/50; mutual defense in battles |
| **WAR** | Declared war → contested battles each cycle until truce or elimination |
| **Victory** | Winner absorbs loser's territory list + up to 30% of loser's members |
| **Dominance cap** | Max **3 dominant gangs** (by territory count + member count); new gangs blocked from dominance tier until one falls |

### Corp territory overlap

Corp `corp_id` may map to `zone_id`. Gang control of zone still allows corp extortion (§5) unless police/martial law active.

---

## 15. News Wire System (detailed)

**Schedule:** every 30 minutes  
**Module:** `news.py` (distinct from raw `events.py` log)

Generates **5–10 unique** news items per cycle from recent `events`, subsystem deltas, and template engine.

### Priority tiers

| Tier | Color | Examples |
|------|-------|----------|
| **BREAKING** | red | Coups, revolutions, mass deaths, corp bankruptcies |
| **URGENT** | orange | Gang wars, police raids, presidential decrees, insubordination |
| **NORMAL** | green | Economic updates, births, elections, ZRS policy changes |
| **GOSSIP** | grey | Agent achievements, clan rivalries, lottery wins, minor transfers |

### Selection algorithm

```
candidates = fetch events since last news cycle
sort by priority_weight DESC, severity DESC, timestamp DESC
dedupe by headline hash (1h window unless magnitude changed)
emit top 5..10 items
```

### News item schema

Each row in `news_feed`:

| Field | Description |
|-------|-------------|
| `timestamp` | `recorded_at` |
| `category` | `breaking \| urgent \| normal \| gossip` |
| `headline` | Template + interpolated real data |
| `impact` | Human-readable summary of state change (balances, deaths, approval) |
| `related_agent_ids` | JSON array for UI links |
| `related_corp_ids` | JSON array |
| `related_gang_ids` | JSON array |

### Example templates (extended)

| Tier | Template |
|------|----------|
| BREAKING | `COUP ATTEMPT! Sheriff {name} tries to seize power!` |
| BREAKING | `REVOLUTION! Citizens storm the palace!` |
| URGENT | `INSUBORDINATION: President fires Sheriff {name} — compliance {pct}%` |
| URGENT | `Sheriff ordered strike on {gang_name} — {deaths} dead` |
| NORMAL | `ZRS cuts rates to {rate}% amid {state} economy` |
| GOSSIP | `{agent_name} promoted to elite after NEO lottery win` |

### UI placement

- **Scrolling ticker** — bottom of main page; shows highest-priority item, rotates every 8s
- **Eco-Pol tab** — full chronological feed with filters by category
- Clickable links resolve `related_*_ids` to agent/corp/gang detail routes in frontend

### Pipeline

```
subsystem → events table (raw) → news.py (curate + prioritize) → news_feed table → API → UI
```

---

## Cross-System Interaction Matrix

| From → To        | Interaction |
|------------------|-------------|
| ZRS → Tax        | Policy modifier on rates |
| ZRS → Corps      | Interest rate, loan freeze, bailouts |
| Tax → President  | 40% of tax to president fund |
| Tax → Sheriff    | 20% to sheriff budget |
| Tax → Agents     | Debt, starvation deaths |
| Corps → Tax      | 10% corporate tax on revenue |
| Clans → Corps    | Extortion, attacks, territory |
| Police → Clans   | Raids, casualties, territory loss |
| President → Sheriff | Decrees + direct orders (§11) |
| Sheriff → Police | Execute/ignore raids, tip-offs, patrol orders |
| Sheriff → President | Coup points, compliance rate, insubordination (§12) |
| Population → President | Revolution meter, uprising (§12) |
| ZRS → Loans      | Rates, forgiveness, corp/agent credit (§13) |
| Loans → Corps    | Bankruptcy on default (§4, §13) |
| Clans → Zones    | Territory tax, wars, alliances (§14) |
| Police → Zones   | Safety, crime reduction (§14) |
| President → Zones | Martial law zones (§14) |
| Birth → Economy  | avg_balance gates reproduction |
| All → Events     | Raw event log |
| Events → News    | Curated wire feed (§15) |
| NEO → Agents     | Wealth redistribution, elite promotion |

---

## Database Touchpoints (summary)

| Table              | Writers |
|--------------------|---------|
| `agents`           | birth, tax, zrs, corps (payroll), clans, police, neo, president |
| `corporations`     | corporations, clans, president |
| `clans`            | clans, police |
| `president`        | president, tax |
| `sheriff`          | sheriff, president |
| `zrs_policy`       | zrs |
| `events`           | all modules, events.py |
| `news_feed`        | news.py |
| `president_decrees`| president → sheriff |
| `sheriff_orders`   | president → sheriff (§11) |
| `zones`            | clans, police, president |
| `loans`            | zrs, corporations, agents |
| `civilization_state` | coup_points, revolution_meter |

---

## Cron Schedule Summary

| Module           | Interval   | File |
|------------------|------------|------|
| birth.py         | 30 min     | `birth.py` |
| events.py        | 30 min     | `events.py` |
| news.py          | 30 min     | `news.py` |
| tax_cron.py      | 1 hour     | `tax_cron.py` |
| corporations.py  | 1 hour     | `corporations.py` |
| clans.py         | 1 hour     | `clans.py` |
| police.py        | 1 hour     | `police.py` |
| president.py     | 1 hour     | `president.py` |
| sheriff.py       | 1 hour     | `sheriff.py` |
| neo.py           | 1 hour     | `neo.py` |
| zrs.py           | 2 hours    | `zrs.py` / `frs.py` |

Example crontab entries:

```cron
*/30 * * * * cd /root/zion_backend && python3 birth.py >> birth.log 2>&1
*/30 * * * * cd /root/zion_backend && python3 events.py >> events.log 2>&1
*/30 * * * * cd /root/zion_backend && python3 news.py >> news.log 2>&1
0 * * * *    cd /root/zion_backend && python3 tax_cron.py >> tax.log 2>&1
5 * * * *    cd /root/zion_backend && python3 corporations.py >> corporations.log 2>&1
10 * * * *   cd /root/zion_backend && python3 clans.py >> clans.log 2>&1
15 * * * *   cd /root/zion_backend && python3 police.py >> police.log 2>&1
20 * * * *   cd /root/zion_backend && python3 sheriff.py >> sheriff.log 2>&1
25 * * * *   cd /root/zion_backend && python3 president.py >> president.log 2>&1
30 * * * *   cd /root/zion_backend && python3 neo.py >> neo.log 2>&1
0 */2 * * *  cd /root/zion_backend && python3 zrs.py >> zrs.log 2>&1
```

---

## Implementation Status

| System        | File            | Status in repo      |
|---------------|-----------------|---------------------|
| Taxes         | `tax_cron.py`   | Exists (rates differ from spec — align to this doc) |
| Birth/Death   | `birth.py`      | Exists              |
| ZRS           | `frs.py`        | Exists as FRS; rename/alias to `zrs.py` per spec |
| Corporations  | `corporations.py` | Exists            |
| Gangs         | `clans.py`      | Exists              |
| Police        | `police.py`     | Exists              |
| President     | `president.py`  | Exists              |
| Sheriff       | `sheriff.py`    | Exists              |
| Events/News   | `events.py`     | **To implement**    |
| News wire     | `news.py`       | **To implement**    |
| NEO Lottery   | `neo.py`        | Exists (different mechanics — align to lottery spec) |
| President orders | `president.py` / `sheriff.py` | Partial (decrees exist; direct orders + compliance **to implement**) |
| Coup/Revolution | `president.py` / `sheriff.py` | Partial (revolution checks exist; meter + battles **to implement**) |
| ZRS loans     | `frs.py` / `corporations.py` | Partial (corp loans exist; microloans + call/default **to implement**) |
| Gang zones    | `clans.py`      | Partial (corp territory exists; 10-zone map + diplomacy **to implement**) |

This document is the **source of truth** for civilization behavior. Implementation PRs should update workers to match these rules and note divergences here until resolved.
