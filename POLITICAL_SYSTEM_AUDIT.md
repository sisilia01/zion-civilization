# ZION Political System — Mega Audit (Code-as-Truth)

**Дата аудита:** 2026-06-14  
**Источник:** чтение кода в `~/zion_backend` + live DB `localhost/zion_db` (user `zion_user`)  
**Принцип:** описано то, что **реально написано и выполняется**, не «как должно быть по конституции».

---

## 1. ОБЗОР

### 1.1 Схема власти (ASCII)

```
                    ┌─────────────────────────────────────┐
                    │         AGENTS (электорат)          │
                    │  class → party lean, amendment vote │
                    └──────────────┬──────────────────────┘
                                   │ popular vote (class + mood)
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │  PRESIDENT  │         │   SENATE    │         │   SHERIFF   │
    │  executive  │◄─laws───│  9 seats    │         │ law enforce │
    │  party AI   │         │ 4+4+at-large│         │ independent │
    └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
           │ nominates             │ confirms              │ ignores
           │ FRS Chief             │ FRS Chief             │ president
           ▼                       ▼                       │ requests
    ┌─────────────┐         ┌─────────────┐                │
    │  FRS CHIEF  │────────►│     ZRS     │◄── police $ ───┘
    │ monetary    │directive│ central bank│
    │ policy      │         │ executes QE │
    └─────────────┘         └─────────────┘

    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │ AMENDMENTS  │────────►│ ZCO TRIBUNAL│────────►│   ENACT     │
    │ agent vote  │ 3 judges│ unanimous   │         │ Walrus+chain│
    └─────────────┘         └─────────────┘         └──────┬──────┘
                                                           ▼
                                                  constitutional_params
                                                  (tax, term, BI, etc.)
```

### 1.2 Цикл `governance_tick.py`

**Watchdog:** `governance_tick.py` каждые **1800 с (30 мин)** (`watchdog.py` → `CRON_SCRIPTS["governance"]`).

**Дополнительно watchdog:**
- `president_check` / `sheriff_check` — каждые 30 мин, если **нет активной записи** в `president_state` / `sheriff_state`, запускается `president.py` / `sheriff.py` standalone.
- `political_economy.py` — 30 мин (отдельно от governance tick).
- `zrs.py` — 2 ч (standalone maintenance; в governance tick ZRS вызывается как шаг 2).
- `political_parties.py` — **DISABLED** в watchdog (закомментирован).
- `ai_governance.py` — **отдельный daemon** (systemd/screen), цикл `asyncio.sleep(1800)` — пишет AI-решения в БД, не входит в governance_tick.

**Порядок внутри одного governance tick** (`governance_tick.py`):

| # | Шаг | Модуль | Timeout |
|---|-----|--------|---------|
| 0 | `apply_enacted_amendments()` | `amendment_enforcer.py` | — |
| 1 | FRS Chief | `frs_chief.run_frs_chief_tick` | 30s |
| 2 | ZRS execute directive | `zrs.execute_frs_directive` | 30s |
| 3 | President | `president.run_governance_tick` | 30s |
| 4 | Senate | `senate.run_governance_tick` | 30s |
| 5 | Sheriff | `sheriff.run_governance_tick` | 30s |
| 6 | Courts | `courts.run_courts_tick` | 30s |
| 7 | Z-LAB | `zlab.run_governance_tick` | 30s |
| 8 | Money conservation check | `civ_common.check_money_conservation` | — |

Каждый шаг: при ошибке → `rollback`, лог, **продолжение** следующего шага. `ctx: dict` передаётся in-memory между шагами (не в `civilization_state.tick_context`).

**DB locks:** `SET lock_timeout = '100ms'`, `statement_timeout = '30s'`.

---

## 2. ПАРТИИ (Consensus / Reform)

### 2.1 Философия и цвета (код)

| ID | Имя | Emoji | `base_class` | Ideology (код) | `color` в `PARTIES` |
|----|-----|-------|--------------|----------------|---------------------|
| `consensus` | Consensus Party | 🏛️ | `elite` | Order, tradition, low taxes | `gold` |
| `reform` | Reform Party | ⚡ | `reform` | Progress, equality, social programs | `blue` |

**Frontend** (не в audited Python, но в проекте): Consensus `#ef4444`, Reform `#3b82f6` — расходится с `political_parties.py` (`gold`/`blue`).

**Промпты и веса** — `constitutional_duties.py` → `PARTY_POLICY`, `PRESIDENT_ACTION_WEIGHTS`.

### 2.2 Как агент попадает в партию

**В коде backend не найдено** `UPDATE agents SET party = ...` при рождении (`birth.py` party не трогает).

**Фактически в DB (2026-06-14):** ~5457 `consensus` + ~5416 `reform` живых агентов с полем `agents.party` заполненным — источник присвоения **вне текущих Python-модулей** (миграция, enacted amendment, ручной backfill).

**Для выборов/номинаций используется fallback по классу** (`senate.py`):

```python
CLASS_TO_PARTY = {
    "elite": "consensus", "rich": "consensus",
    "middle": "reform", "working": "reform",
    "poor": "reform", "critical": "reform",
}
```

Функция `_agent_party_for_election()`: приоритет `senate.party_id` → `agents.party` → `agent_party_from_class(class)`.

### 2.3 Как партия влияет на решения

| Область | Механизм |
|---------|----------|
| **President tick** | `pick_party_weighted_action()` — веса + кризисные бонусы → `decide_action()` → `execute_decision()` |
| **President AI** | `ai_governance.py` — `get_party_policy_prompt()`, блок unconstitutional, party-tagged events |
| **Senate vote** | `vote_on_law()` — bias + stance + president approval + 20% rogue |
| **Senate propose** | `PARTY_PROPOSED_LAWS` — пул законов по партии |
| **Events** | `tag_party_event()` → `[CONSENSUS]` / `[REFORM]` |

**President weights (базовые):**

| Action key | Consensus | Reform |
|------------|-----------|--------|
| hire_police | 0.35 | 0.03 |
| anti_corruption | 0.25 | 0.02 |
| stimulate_economy | 0.20 | 0.10 |
| tax_change | 0.15 | — |
| give_money | 0.03 | 0.35 |
| propose_amendment | 0.02 | 0.30 |
| fund_research | — | 0.20 |

**Кризисные модификаторы:** Consensus +police/+stimulus при unemployment>50; Reform +give_money/+amendment при unemployment>50 или poverty>30; Consensus `give_money` ×0.25; Reform `hire_police` ×0.25.

**Hard override:** `decide_action()` — если Reform и `poverty_pct > 50` → всегда `GIVE_MONEY_TO_POOR`.

### 2.4 Таблицы БД — партии

**`political_parties`:** `party_id`, `name`, `emoji`, `ideology`, `base_class`, `leader_agent_id`, `leader_name`, `treasury`, `approval_rating`, `members_count`, `wins`, `losses`, `memory` JSONB, timestamps.

**`party_members`:** `agent_id` PK, `party_id`, `role`, `joined_at` — **не обновляется** в текущем `political_parties.py` (только `members_count` из `agents.party`).

**`agents.party`:** VARCHAR(20), schema в `civ_common.ensure_schema`.

**`vip_memory`:** память VIP-ролей (party leaders).

---

## 3. ПРЕЗИДЕНТ

### 3.1 Избрание — полный алгоритм (`senate.run_election`)

**Триггеры выборов:**
1. `ensure_president_exists()` — вакансия (нет active / agent мёртв).
2. `should_run_scheduled_election()` — `hours_in_power > term_limit_hours` OR `approval < 10`.
3. `check_impeachment()` — успешный импичмент → отложенные выборы через `president_election_cycles`.
4. `maybe_run_deferred_president_election()` — счётчик циклов после импичмента.
5. `call_election()` — president approval < 15, 8% chance в `presidential_actions`.
6. Revolution / `transfer_power()` / `political_economy.trigger_revolution`.
7. Watchdog `president_check` при пустом office.

**Кандидаты (обязательно 2 партии):**
- `pick_senate_president_nominee(party_id)` — **сидящий сенатор** партии с **максимальным `senate.approval_rating`**.
- Требование: активный сенатор (`senate.is_active`, agent alive).
- При победе: `vacate_senator_for_presidency()` — DELETE из senate, supplemental election позже.

**Народное голосование** (`compute_president_popular_vote`):

```
mood = uniform(-0.15, +0.15)   # ELECTORATE_MOOD_SWING

Для каждого class с count N:
  lean_c = CLASS_PRESIDENTIAL_LEAN[class][0]   # доля Consensus
  consensus_share = clamp(lean_c + mood, 0, 1)
  consensus_votes += round(N * consensus_share)
  reform_votes += N - consensus_votes
```

| Class | Lean Consensus / Reform |
|-------|----------------------|
| elite, rich | 70% / 30% |
| middle | 50% / 50% |
| working, poor, critical | 30% / 70% |

**Победитель:** `max(votes)` по партии. Dictatorship hack: если `dictatorship_mode` — incumbent party получает ≥10000 голосов, остальные ÷4.

**После победы:**
- INSERT `president_state`: approval=50, personal_fund=500, party=winner_party, phase='ruling', corruption=0, hours=0.
- ZRS bonus `ELECTION_BONUS=50` ZION победителю (если reserve позволяет).
- `political_parties.wins++`, проигравшая партия `losses++`.
- INSERT `elections` с JSON candidates/results.
- `ensure_senate_exists()` — дозаполнение сената.

### 3.2 Срок и переизбрание

- **`hours_in_power`** +1 каждый governance tick (≈30 мин).
- **`days_in_power`** +1 тот же tick (legacy, дублирует).
- **Лимит:** `get_param("term_limit_hours", 720)` из `constitutional_params` → по умолчанию **720 часов** (~15 дней при 30-мин тиках = 1440 тиков? **Нет:** +1 hour per tick → 720 ticks × 30min = **360 hours real** если 1 tick = 1 hour in-game).

  **Важно:** `hours_in_power` инкрементируется **1 за tick**, не за реальный час. При 30-мин watchdog срок **720 governance ticks ≈ 15 суток реального времени**.

- **Переизбрание:** нет отдельного «re-elect same person» — новые выборы = новый `run_election`, старый president `is_active=false, phase='retired'`.
- **Approval floor:** первые 24 `hours_in_power` — approval не ниже 45, иначе не ниже 10.

### 3.3 Действия президента (что МОЖЕТ)

Выбор: `decide_action()` → `execute_decision()`.

| Action | Условия / эффект | Party skew |
|--------|------------------|------------|
| `ANTI_CORRUPTION_DRIVE` | approval +15; corrupt sheriff → honest | обе |
| `STIMULUS` | Consensus: corp injection до 200 ZION; Reform: 50 ZION poor OR give_money | разная реализация |
| `GIVE_MONEY_TO_POOR` | Reform: direct aid; Consensus: **перенаправляется в STIMULUS** | Reform only реально |
| `NATIONALIZE_CORPS` | до 3 bankrupt corps из ZRS | обе |
| `INVESTIGATE_SHERIFF` | лог compliance (не приказ) | обе |
| `TAX_CHANGE` | Consensus: `top_tax_rate -0.02`; Reform: `+0.02` via `adjust_param_cur` | party |
| `PROPOSE_AMENDMENT` | Consensus: deregulation; Reform: redistribution → `amendments.propose_amendment` | party |
| `FUND_RESEARCH` | до 150 ZION из personal_fund | обе |
| `POPULISM` | approval +25, tax_relief 48h | обе |
| `TAX_RELIEF` | poor/critical tax narrative 24h | обе |
| `FUND_POLICE` | `1000 + police_funding_bonus` → `sheriff_state.police_budget` | Consensus bias |
| `NO_FUNDS` | fallback | — |

**AI influence:** `get_latest_ai_decision(cur, "president")` — если action ≠ do_nothing, вес ×2.5 в `pick_party_weighted_action`.

**Каждый tick также:**
- `issue_president_orders()` — non-binding requests в `sheriff_orders`.
- `check_compliance()` — только лог (не увольнение шерифа).
- `process_revolution_cycle()`.
- `nominate_frs_chief()` если FRS vacant.
- Lobbying (`corporations.run_lobbying_tick`), media approval.

**Corruption:** `update_corruption()` — corrupt sheriff +5, honest -3, populism +3, random bribe 20% +3, anti-corruption -10.

### 3.4 Что НЕ может (заблокировано)

| Попытка | Блок |
|---------|------|
| `MARTIAL_LAW` | `execute_decision` → `blocked`, event logged |
| Dictatorship / dissolve senate | `dissolve_senate()`, `declare_dictatorship()` → `return None` |
| Coup | `attempt_coup`, `check_coup` → disabled |
| Binding orders to Sheriff | `process_sheriff_orders` → all `ignored_constitutional` |
| AI: dictator/martial/coup/... | `FORBIDDEN_ACTIONS` → `do_nothing` |
| AI president → sheriff command | `president_attempts_sheriff_command()` → blocked event |

### 3.5 Конституционные обязанности (`constitutional_duties.py`)

Инжектируются в AI prompts через `get_duty_reminder()`.

**President triggers:**

| Duty | Trigger | Tools |
|------|---------|-------|
| Address poverty | poverty_pct > 10% | tax_change, give_money |
| Fight unemployment | unemployment > 50% | stimulate, fund_research, propose_amendment |
| Root corruption | corruption_index > 50 | anti_corruption_drive |
| Fund police payroll | budget < officers × OFFICER_SALARY | hire_police, give_money |

### 3.6 Consensus vs Reform — конкретные отличия в коде

- **STIMULUS:** Consensus → corporations; Reform → agents balance < 500 (или < 10 fallback).
- **GIVE_MONEY:** Consensus никогда не выполняет напрямую.
- **TAX_CHANGE:** cut vs hike `top_tax_rate`.
- **PROPOSE_AMENDMENT:** deregulation vs wealth tax / basic income titles.
- **Treasury empty:** Consensus → FUND_POLICE; Reform → PROPOSE_AMENDMENT.
- **Poverty > 50%:** Reform hard-forces GIVE_MONEY_TO_POOR в `decide_action`.

### 3.7 Импичмент (`check_impeachment`)

**Условие старта:** `get_impeachment_revolution_level(cur) > 250` (`IMPEACH_REVOLUTION_MIN`).

**Накопление голосов за tick:**
- Каждый сенатор **не из партии президента** → +1 vote.
- Сенатор **из партии президента** → 20% chance +1.

Голоса накапливаются в `president_state.impeachment_votes`.

**Порог:** `impeachment_votes > n × 0.66` где n = living senators (`IMPEACH_SENATE_RATIO`).

**При успехе:**
- president `phase='impeached'`, personal_fund=0.
- `civilization_state.last_impeached_agent_id`, `president_election_cycles=3`.
- Выборы через 3 governance ticks (`maybe_run_deferred_president_election`).

### 3.8 Таблицы БД — президент

**`president_state`** (ключевые поля): `agent_id`, `agent_name`, `party`, `approval_rating`, `personal_fund`, `police_fund`, `hours_in_power`, `days_in_power`, `corruption_index`, `impeachment_votes`, `vetoes_used`, `dictatorship_mode`, `is_dictator`, `election_delayed`, `martial_law_until`, `tax_relief_until`, `phase`, `is_active`, `started_at`, `revolution_meter`, `orders_given_cycle`.

**`elections`:** history JSON.

**`sheriff_orders`:** president requests (non-binding).

**Live DB:** President **Elsa Vlasov** (reform), approval 82%, hours_in_power 0.

---

## 4. СЕНАТ

### 4.1 Состав

```
TOTAL_SENATORS = 4 (consensus) + 4 (reform) + 1 (at_large) = 9
SENATORS_PER_PARTY = 4
SENATE_AT_LARGE_SEATS = 1
```

**`prune_senate_to_nine()`:** держит top-4 approval per party + 1 at_large (highest approval among at_large rows); лишних DELETE.

**Роли:** `senator`, `speaker` (highest approval non-at-large), `at_large`.

**Live DB (2026-06-14):** 6 consensus + 4 reform (включая Blake Popescu at_large) — **превышение consensus quota** до следующего prune.

### 4.2 Избрание сенаторов (`ensure_senate_exists`)

**Не президентом** — `elect_senator_by_popular_vote()`:

1. Кандидаты: top 8 charisma из class pool партии (`elite/rich` vs `working/middle/poor/critical`).
2. Score: `charisma×0.4 + class_weight×500×party_bonus + random(-50,50)`.
3. `party_bonus`: 1.25 если `agent_party_from_class == party_id`, иначе 0.85.
4. Победитель = max score.
5. Fallback: `pick_senator_candidate()` — top charisma/balance из class pool.

**At-large (9-й):** лучший score среди победителей popular vote обеих партий, `role='at_large'`.

**Diversity guard:** если партия 0 сенаторов — принудительное избрание.

**Approval при посадке:** `min(90, 40 + charisma/2)`.

### 4.3 Голосование за законы (`vote_on_law`)

```
prob_yes = 0.5 + PARTY_LAW_VOTE_BIAS[party][law_type_key]

if PARTY_LAW_STANCE[party][law_type] is True:  prob_yes = max(prob_yes, 0.80)
if PARTY_LAW_STANCE[party][law_type] is False: prob_yes = min(prob_yes, 0.20)

if president.approval > 70: prob_yes += 0.10
if president.approval < 30: prob_yes -= 0.10

prob_yes = clamp(prob_yes, 0.05, 0.95)
yes = random() < prob_yes
if random() < ROGUE_VOTE_CHANCE (0.20): yes = NOT yes
```

**Party biases (примеры):**

| Law | Consensus | Reform |
|-----|-----------|--------|
| WEALTH_TAX | -0.4 | +0.4 |
| TAX_REDUCTION | +0.4 | -0.4 |
| HIRE_POLICE | +0.3 | -0.2 |
| BASIC_INCOME | -0.4 | +0.4 |
| CORPORATE_DEREGULATION | +0.3 | -0.3 |

**Pass rule** (`senate_vote`):
- Обычные законы: `votes_for > votes_against` (простое большинство).
- Supermajority types: `votes_for >= pass_threshold()` для NATIONALIZATION etc.
- `pass_threshold`: 51% / 60% / 75% по типу закона.

**MARTIAL_LAW, DISSOLVE** — в `execute_law_effect` → `return False` (unconstitutional).

### 4.4 Какие законы предлагают

**President** (`choose_law_for_president`): weighted random, party-dependent weights; `MARTIAL_LAW` weight=0; `ELECTION_DELAY` weight high при low approval но **не в LAW_TYPES** → не может быть выбран.

**Senator** (`PARTY_PROPOSED_LAWS`):
- Consensus: `TAX_REDUCTION`, `HIRE_POLICE`, `CORPORATE_DEREGULATION`
- Reform: `WEALTH_TAX`, `BASIC_INCOME`, `EDUCATION_FUND`

**Частота в tick:** president 35% если <1 pending; senator 30% если <2 pending senator bills.

### 4.5 Полномочия

| Полномочие | Реализация |
|-----------|------------|
| Импичмент президента | `check_impeachment()` |
| Recall шерифа | `check_sheriff_recall()` — revolution>250, 75% random yes per senator, majority needed |
| Подтверждение FRS | `senate_confirm_frs_chief()` — fake 55% или auto if <3 senators |
| Veto | `veto_senate_law()` — max 1 veto, только senator-proposed pending |
| Блокировка законов | vote against |
| Emergency stimulus | `trigger_emergency_session` → propose STIMULUS |

**`presidential_actions`:** dictator/dissolve/call_election/veto — большинство тел отключены (return None), но `call_election` и `veto` **живы**.

### 4.6 Таблицы БД

**`senate`:** `agent_id`, `agent_name`, `party_id`, `role`, `votes_cast`, `approval_rating`, `is_active`, `term_start`.

**`senate_laws`:** `title`, `description`, `proposed_by`, `law_type`, `status`, `votes_for/against`, `effect_data` JSONB.

**`senate_budget`:** фискальные расходы (отдельный `senate_budget.py`, 1h).

---

## 5. ШЕРИФ

### 5.1 Избрание (`sheriff.run_sheriff_election`)

**Независимо от президента.** Триггеры: нет sheriff, term end, approval≤0, Senate recall, watchdog vacancy, forced.

**Кандидаты** (`pick_sheriff_party_nominee`):
- Eligible: `has_senate_experience` OR `has_police_experience` OR `job_role='police'` OR active senator.
- Исключены: president, active sheriff, `last_sheriff_agent_id`.
- Top 50 by approval; первая строка где `_agent_party_for_election == party_id`.
- Approval: senate approval OR `40 + charisma/2 + police+8 + senate+5`.

**Народное голосование** (`compute_sheriff_popular_vote`):

| Class | Lean Consensus (law & order) |
|-------|------------------------------|
| elite, rich | 60/40 |
| middle | 50/50 |
| working, poor, critical | 40/60 |

```
mood = uniform(-0.15, +0.15)
consensus_share = clamp(lean_c + mood, 0, 1)
```

**Sheriff type** после победы: `random.choices(["honest","corrupt","enforcement"], weights=[0.5,0.35,0.15])` с модификаторами poor_pct/rich_pct.

**Срок:** `SHERIFF_TERM_HOURS = 720` от `sheriff_state.started_at`; `check_term_end()` → election.

**Anti-spam:** не выбирать если active sheriff age < 12h (unless forced).

### 5.2 Квалификация

- `agents.has_police_experience` — set в `mark_agent_police_experience()` при назначении в `police_divisions` / `police.py` recruit.
- `agents.has_senate_experience` — set в `_seat_senator`, `mark_agent_senate_experience`.
- Active senator counts via EXISTS even if flags false.

### 5.3 Что может / не может

**Может (`sheriff_actions`):**
- Collect corp protection fees (2% treasury).
- **honest:** fines criminals, hire police, raids via AI.
- **corrupt:** clan bribes, shake-down poor.
- **enforcement:** mass hire, clan asset forfeiture.
- AI actions: `raid_gang`, `hire_police`.
- File corruption court case (15% if corrupt).

**Не может / заблокировано:**
- `attempt_coup()` → False always.
- Obey president orders → `process_sheriff_orders` marks ALL pending as `ignored_constitutional`.
- President cannot fire sheriff (`check_compliance` — log only).

**Dictator interaction** (`check_interaction_with_president`): если `is_dictator` — honest sheriff может снизить approval и при <25 **снять президента** (legacy path, dictator promotion disabled elsewhere).

### 5.4 Независимость от президента

`civ_governance.py` Article XVII:
- `issue_president_orders()` — INSERT `sheriff_orders` с `binding: false`.
- `process_sheriff_orders()` — **все** pending → `ignored_constitutional`, executed=0.
- `_execute_order()` существует но **не вызывается** из process path.

`ai_governance.py`:
- `president_attempts_sheriff_command()` — block.
- `sheriff_told_to_obey_president()` — block sheriff AI obeying.

### 5.5 Отзыв (`check_sheriff_recall`)

1. `get_impeachment_revolution_level(cur) > 250`
2. Каждый сенатор: 75% random vote for recall.
3. Порог: `majority = n//2 + 1`
4. `deactivate_sheriff()` → `ctx["sheriff_recall"]=True` → sheriff tick runs election.

### 5.6 Полиция

- **`police_divisions`** + **`police_assignments`** — `sync_police_divisions(cur)` из sheriff tick.
- **Бюджет:** `sheriff_state.police_budget`; warning if < 100 ZION.
- **Найм:** в `sheriff_actions` по типу; AI hire; Senate HIRE_POLICE law (+5 officers, 500 ZRS).
- President FUND_POLICE → +budget (не officers напрямую).

### 5.7 Таблицы БД

**`sheriff_state`:** `agent_id`, `agent_name`, `sheriff_type`, `approval_rating`, `police_budget`, `police_count`, `coup_points`, `corruption_level`, `term_number`, `days_in_office`, `started_at`, `is_active`, `orders_executed_cycle`, `orders_ignored_cycle`.

**Live DB:** Sheriff **Ebele Dixon**, type **enforcement**, approval 23%.

---

## 6. ЗРС / FRS CHIEF

### 6.1 Назначение FRS Chief

1. **President nominates** (`nominate_frs_chief`): если vacant и не pending — richest agent elite/rich/middle → `frs_chief_state.confirmation_status='pending'`.
2. **Senate confirms** (`senate_confirm_frs_chief`) в senate tick:
   - Если <3 senators → auto-confirm.
   - Иначе симулированное голосование `votes_for = max(1, int(n*0.55))` без реального per-senator vote.
   - `term_cycles_remaining = FRS_TERM_CYCLES (12)`.

**Порядок в одном tick:** FRS step 1 **не видит** nomination этого же tick (president step 3). Номинация president → подтверждение senate **в том же tick** после president. Directive пишется FRS step **до** nomination — использует предыдущего chief или inactive.

### 6.2 Срок и независимость

- `decrement_frs_term()` каждый FRS tick: `term_cycles_remaining--`, при 0 → `is_active=false`, `confirmation_status='vacant'`.
- 12 cycles × 30 min = **~6 часов реального времени** на срок (если 1 cycle = 1 governance tick).

**Monetary policy** (`_rule_based_directive`) — **независимо** от president:

| Condition | action | policy_mode |
|-----------|--------|-------------|
| inflation > 50% | tax_change amount=20 | HYPERINFLATION |
| unemployment>80 OR inflation>30 | stimulate_economy QE 10% reserve | RECESSION |
| unemployment>50 | stimulate_economy QE 5% reserve | RECESSION |
| unemployment<20 | absorb_money 2% | BOOM |
| senate emergency | stimulate_economy 3% reserve | RECESSION |
| else | tax_change amount=5 | NORMAL |

### 6.3 ZRS execution (`execute_frs_directive`)

| action | Effect |
|--------|--------|
| tax_change | `zrs_state.interest_rate = amount` (0-25%), `policy_mode` |
| absorb_money | absorb from agents (boom) |
| stimulate_economy | inject to corporations treasury < 5000 |
| declare_emergency | **blocked** — logged only |

**ZRS standalone** (`zrs.py` 2h): corp loans, bailouts, `determine_state()` economy phases, drain.

**Interest by ZRS state:** BOOM 10%, NORMAL 5%, RECESSION 3%, CRISIS/DEPRESSION/HYPER 0%.

### 6.4 Отзыв FRS

**Нет explicit recall** в коде. Vacancy только по окончанию `term_cycles_remaining` или неподтверждённая nomination.

### 6.5 Таблицы БД

**`frs_chief_state`:** `agent_id`, `chief_name`, `nominated_by`, `confirmation_status`, `term_cycles_remaining`, `pending_directive`, `last_directive`, `is_active`, timestamps.

**`zrs_state`:** `reserve`, `interest_rate`, `policy_mode`, `loans_frozen`, `corporate_crisis`, etc.

**`zrs_policy`**, **`zrs_loans`**, **`economy_snapshots`**.

**Live DB:** FRS Chief **Parker Tamura**, confirmed, **4 cycles** left.

---

## 7. КОНСТИТУЦИЯ И ПОПРАВКИ

### 7.1 Голосование агентов (`amendments.py`)

**Предложение:** `propose_amendment(title, desc, change_type)` — duplicate title blocked.

**Голосование:** `run_vote(amendment_id, change_type)`:
- Все живые agents (или sample_limit).
- `agent_decides()` — score из ambition, loyalty, class, ideology (seed=agent_id×7919), fear, change_type.
- Пороги: score>45 → for; <15 → against; иначе abstain 35% или for/against.

**Кворум:** нет явного — голосуют все alive.

**Прохождение:** `votes_for / total > 50%` (abstain в знаменателе).

**Merkle root** над leaves `amendment_id:agent_id:vote`.

### 7.2 ZCO Tribunal (`zco_tribunal.py`)

**3 судьи** (разные модели):
- deepseek-chat-v3-0324
- gemini-2.5-flash
- llama-3.3-70b-instruct

Каждый возвращает JSON `{verdict: approve|reject, reason}`.

**Unanimous approve** required для enact.

Запись в `tribunal_records` (amendment_id, verdicts JSONB, unanimous bool).

### 7.3 Enact (`enact_amendment.py`)

Требования:
1. `votes_for > votes_against`
2. Последний `tribunal_records.unanimous = true`

Процесс:
1. Читает prev constitution version из `constitution_versions`.
2. Пишет `CONSTITUTION_ZION_v{major.minor}.md` с appended amendment block.
3. SHA-256, Walrus `store_amendment_record`.
4. Sui on-chain `record_amendment` (subprocess).
5. INSERT `constitution_versions`, UPDATE amendments `status='enacted'`.
6. `apply_enacted_amendments()`.
7. Propagate text to `agent_memory.civ_knowledge` all alive agents.

### 7.4 `constitutional_params` → геймплей

**Defaults** (`amendment_enforcer.py`):

| param | default |
|-------|---------|
| top_tax_rate | 0.35 |
| min_tax_rate | 0.05 |
| term_limit_hours | 720 |
| basic_income | 0 |
| wealth_tax_rate | 0 |
| police_funding_bonus | 0 |
| corporate_tax_rate | 0.10 |
| constitution_version | 1.0 |

**CHANGE_TYPE_MAP** применяет deltas при enact.

**Кто читает `get_param()`:**

| Module | Params |
|--------|--------|
| `senate.should_run_scheduled_election` | term_limit_hours |
| `president.FUND_POLICE` | police_funding_bonus |
| `tax_cron.py` | top/min/corp/wealth tax rates |
| `survival.py` | basic_income |

**President tax_change** использует `adjust_param_cur` напрямую (±0.02), не только amendments.

### 7.5 Enacted поправки (live DB)

| ID | Title | change_type | votes FOR/AGAINST |
|----|-------|-------------|-------------------|
| 16 | Amendment I — Progressive Wealth Tax | tax_increase | 12615 / 831 |
| 35 | Constitution v3.0 — The Permanence Constitution | constitutional_reform | 14228 / 325 |
| 55 | Party Registration Act | constitutional_reform | 8802 / 1202 |
| 56 | Senate Election Act | constitutional_reform | 8802 / 1202 |
| 57 | ZRS Independence Act | constitutional_reform | 8802 / 1202 |

**Текущие params (после enforcer):**

| param | value | source amendment |
|-------|-------|------------------|
| top_tax_rate | 0.45 | #16 |
| min_tax_rate | 0.07 | #16 |
| wealth_tax_rate | 0.04 | #16 |
| constitution_version | 7.0 | #56 |
| term_limit_hours | 720 | default |
| basic_income | 0 | default |

**Constitution versions in DB:** 1.0, 1.1, 1.2, 1.3, 3.0 (lineage table).

**Amendments pipeline status:** 5 enacted, 1 rejected, **50 voting** (open).

---

## 8. ВЗАИМОЗАВИСИМОСТИ (матрица)

| От → К | President | Senate | Sheriff | FRS Chief | ZRS | Agents |
|--------|-----------|--------|---------|-----------|-----|--------|
| **President** | — | proposes laws; cannot dissolve | non-binding requests only | nominates | personal_fund spend; FUND_POLICE → budget | stimulus, tax relief |
| **Senate** | impeach; confirm laws; deferred election | self-fill 9 seats | recall (crisis+vote) | confirms FRS | laws spend ZRS reserve | popular vote seat laws |
| **Sheriff** | cannot remove (except dictator legacy path) | ignored orders | independent election | no direct | bribes→reserve; budget | arrests, fines |
| **FRS Chief** | no control | emergency QE trigger | no control | president+senate appoint | sets directive | indirect via corps QE |
| **ZRS** | no appointment | no appointment | receives budget transfers | executes FRS only | self maintenance | loans, drain, taxes |
| **Agents** | popular vote president/sheriff | amendment votes | — | — | — | class→party lean |

**Кто кого снимает:**

| Target | Mechanism |
|--------|-----------|
| President | Impeachment (revolution>250 + senate votes); approval<10 scheduled election; revolution; honest sheriff+dictator legacy; rebellion |
| Sheriff | approval≤0; term 720h; Senate recall (revolution>250); NOT president |
| FRS Chief | term_cycles=0 only |
| Senator | death; prune; president winner vacates seat |

---

## 9. ВЫЯВЛЕННЫЕ ПРОБЛЕМЫ / НЕСТЫКОВКИ

1. **`agents.party` заполнен в DB, но нет runtime-кода присвоения** при birth — только class-based fallback в выборах.

2. **President Elsa Vlasov одновременно в `senate` и `president_state`** — нарушение логики `vacate_senator_for_presidency` (возможно ручной INSERT или старый путь `transfer_power`).

3. **6 consensus senators вместо 4** — prune не сработал или снова переполнение до tick.

4. **`hours_in_power` +1 per 30-min tick** при `term_limit_hours=720` → ~15 дней реального времени, не 720 wall-clock hours.

5. **FRS confirm** — фиктивное 55% без `vote_on_law`; при ≥3 senators не настоящий roll-call.

6. **FRS directive** в step 1 использует chief **до** president nomination в том же tick — один tick lag.

7. **`political_parties.py` disabled** в watchdog — `approval_rating` партий и `members_count` не обновляются автоматически.

8. **`ELECTION_DELAY`** в weights president law choice, но **не в `LAW_TYPES`** — мёртвый вес.

9. **`presidential_actions` dictator branches** вызывают disabled functions — мёртвый код, но `call_election`/`veto` живы.

10. **`check_interaction_with_president` dictator removal** — путь снятия президента шерифом при `is_dictator`, но `is_dictator` promotion отключена → почти недостижимо.

11. **Sheriff `enforcement` type** — комментарии "junta"/"unconstitutional disabled" вперемешку с активным hiring/raids.

12. **`_execute_order` в civ_governance** — реализован, но никогда не вызывается (все orders ignored).

13. **Amendment vote pass** — `>50%` including abstain; tribunal prompt says "non-abstain majority" — расхождение prompt vs code.

14. **50 amendments в status `voting`** — нет автоматического close/enact pipeline в governance_tick (ручной/zco script).

15. **`party_members` table** не синхронизируется с `agents.party`.

16. **AI governance** и **rule-based president** работают параллельно — `get_latest_ai_decision` влияет на rule engine, возможны расхождения narrative vs action.

17. **`senate_confirm_frs_chief` при <3 senators** auto-confirms без кворума — edge case.

18. **Colors** `gold`/`blue` в backend vs `#ef4444`/`#3b82f6` во frontend.

---

## Приложение A — Файловая карта

| Файл | Роль |
|------|------|
| `governance_tick.py` | Orchestrator 30min |
| `watchdog.py` | Scheduler |
| `president.py` | Executive decisions |
| `senate.py` | Legislature, elections, impeachment |
| `sheriff.py` | Law enforcement, sheriff elections |
| `frs_chief.py` | Monetary directive author |
| `zrs.py` | Central bank execution |
| `civ_governance.py` | President↔Sheriff separation |
| `constitutional_duties.py` | Party policy, duties, weights |
| `ai_governance.py` | LLM decisions daemon |
| `political_parties.py` | Party metadata (cron disabled) |
| `political_economy.py` | Macro/crisis/revolution (parallel cron) |
| `amendments.py` | Popular amendment voting |
| `zco_tribunal.py` | 3-judge review |
| `enact_amendment.py` | Versioning + Walrus + chain |
| `amendment_enforcer.py` | `constitutional_params` |

---

*Конец документа. Сгенерировано аудитом кода без внесения изменений.*
