# ZION Backend — Аудит стабильности

**Дата:** 2026-06-13  
**Режим:** только анализ, изменений в коде/конфигах не вносилось  
**Контекст инцидента:** процесс держал транзакцию Postgres в состоянии `idle in transaction` ~8.5 часов; последний видимый запрос — `SELECT policy_mode, reserve, interest_rate, tax_modifier ... FROM zrs_state`. Это заблокировало `ALTER TABLE` на `agents` и вызвало каскад из 100+ зависших запросов.

---

## ЧАСТЬ 1: Источник конкретного инцидента

### 1.1 Grep: `policy_mode, reserve, interest_rate, tax_modifier` + `zrs_state`

Точное совпадение с текстом инцидента (**все 4 колонки в одном SELECT**) найдено **только в одном месте**:

| Файл | Строки | Функция | Запрос |
|------|--------|---------|--------|
| `ai_governance.py` | 313–318 | `get_civilization_state()` | `SELECT policy_mode, reserve, interest_rate, tax_modifier FROM zrs_state WHERE id = 1` |

Другие обращения к `zrs_state` (частичные SELECT, UPDATE, другой набор колонок):

| Файл | Строки | Примечание |
|------|--------|------------|
| `api.py` | 5552–5556 | `/frs/stats` — другие колонки (`loans_frozen`, без `interest_rate`) |
| `ai_governance.py` | 264 | `get_faction_budgets()` — только `reserve` |
| `civ_common.py` | 958, 1248, 1341+ | `policy_mode` или `*` |
| `civ_economics.py` | 344 | только `reserve` |
| `president.py` | 45–49 | только `reserve` |
| `tax_cron.py` | 153 | через `get_zrs_state()` |
| `zrs.py`, `senate_budget.py`, `genesis.py` | разные | UPDATE / частичные SELECT |

**Вывод:** инцидентный запрос однозначно указывает на `ai_governance.py:get_civilization_state()`.

### 1.2 Анализ путей выполнения `get_civilization_state()`

```python
# ai_governance.py:291-553 (упрощённо)
async def get_civilization_state() -> dict:
    conn = get_db()          # psycopg2.connect без statement_timeout
    cur = conn.cursor()
    try:
        # ~10 SELECT на agents, zrs_state, president_state, ...
        cur.execute("SELECT policy_mode, reserve, interest_rate, tax_modifier FROM zrs_state WHERE id = 1")
        zrs = cur.fetchone()

        # ВТОРОЕ соединение — но ПЕРВОЕ остаётся в открытой транзакции!
        econ_conn = get_conn()
        econ = fetch_economic_indicators(econ_cur)  # civ_common: timeout 120s
        econ_conn.close()

        # ещё ~15 SELECT (president, sheriff, clans, corporations, events, ...)
        return { ... большой dict ... }
    except Exception as e:
        return {}
    finally:
        cur.close()
        conn.close()   # commit НИГДЕ не вызывается
```

| Путь | `commit()` | `close()` | Риск |
|------|------------|-----------|------|
| Успешное завершение | ❌ нет (read-only) | ✅ `finally` | Средний: транзакция держит `AccessShareLock` на прочитанных таблицах до `close()` |
| `except` → `return {}` | ❌ | ✅ `finally` | Аналогично |
| Зависание **между** SELECT на `zrs_state` (стр. 318) и следующим запросом на **main** conn (стр. 330) | ❌ | ❌ не достигнут | **Высокий:** main conn в `idle in transaction`, последний запрос = zrs SELECT |
| Зависание на любом последующем SELECT **без timeout** на main conn | ❌ | ❌ | **Высокий:** `ai_governance.DB_CONFIG` не задаёт `statement_timeout` / `lock_timeout` |
| Kill -9 процесса | — | ❌ | Соединение оборвётся на стороне PG, но до kill — полный простой |

**Критический анти-паттерн (стр. 313–328):** после SELECT из `zrs_state` на **основном** соединении вызывается `fetch_economic_indicators()` на **отдельном** соединении. Основное соединение в это время уже в транзакции (после первых SELECT на `agents`) и простаивает — классический `idle in transaction`. Если вторичный вызов или Python-код «застрянет», основная транзакция живёт часами.

**Внешние API внутри этой функции:** нет (OpenRouter не вызывается). LLM-вызовы идут позже в `ai_decide()` / `_run_faction_round()`, уже **после** закрытия соединения `get_civilization_state`.

### 1.3 Кто вызывает `get_civilization_state()`

| Вызывающий | Строки | Частота |
|------------|--------|---------|
| `ai_governance.py` → `run_ai_governance_cycle()` | 1929 | Каждые **30 мин** (`asyncio.sleep(1800)`) + при старте |
| `api.py` → `GET /api/scenarios/active` | 7273–7276 | По запросу клиента (может быть часто) |
| systemd `zion-governance.service` | — | Долгоживущий процесс `ai_governance.py` (PID виден в `ps`) |

**Вероятная схема инцидента:**
1. `zion-governance` (или API-запрос к `/api/scenarios/active`) открыл транзакцию, выполнил SELECT из `zrs_state`.
2. Соединение осталось открытым без `COMMIT`/`ROLLBACK` на **8.5 ч** (`idle in transaction`).
3. Параллельно watchdog запустил ~N screen-скриптов, каждый вызвал `ensure_schema()` → `ALTER TABLE agents ADD COLUMN IF NOT EXISTS ...`.
4. `ALTER TABLE` ждёт `AccessExclusiveLock` → каскад блокировок → API зависает, но процесс uvicorn **жив** → systemd не перезапускает.

---

## ЧАСТЬ 2: Аудит управления соединениями (`psycopg2.connect`)

### 2.1 Сводка по инфраструктуре

| Механизм | Файл | Таймауты | Примечание |
|----------|------|----------|------------|
| `get_conn()` / `DB_CONFIG` | `civ_common.py:30-36` | `lock_timeout=8s`, `statement_timeout=120s` | Используется большинством civilization-скриптов |
| `get_db()` pool | `zion_db.py` + `api.py:1037` | те же через `DB_CONFIG` | `close()` → `rollback()` → возврат в пул |
| `get_db()` governance | `ai_governance.py:27-33, 111` | **НЕТ** | Отдельный `DB_CONFIG` без `options` |
| Module-level `conn = psycopg2.connect(...)` | `walrus.py`, `zionbet.py`, `neo.py`, `epidemics.py`, `casino.py`, `espionage.py`, `marriages.py`, `zionwork.py` | обычно нет | Глобальное соединение на весь процесс |

### 2.2 Таблица рисков (ключевые файлы)

| Файл | Функция / точка входа | Гарантированный `close`? | Риск | Причина |
|------|----------------------|---------------------------|------|---------|
| **`ai_governance.py`** | `get_civilization_state()` | ✅ `finally` | **ВЫСОКИЙ** | Нет `commit/rollback`; нет PG-таймаутов; транзакция открыта во время работы второго conn; **источник инцидентного SELECT** |
| **`ai_governance.py`** | `get_db()` / все `execute_*` | ✅ `finally` на execute | Средний | `close` есть, но без session timeouts; длинные циклы UPDATE |
| **`ai_governance.py`** | `get_faction_budgets()` | ✅ `finally` | Средний | Read без `rollback` перед `close` |
| **`ai_governance.py`** | `ai_decide()` | N/A (без DB во время HTTP) | Низкий | OpenRouter **после** закрытия state-conn — правильно |
| **`agent_thoughts.py`** | `thought_cycle()` | ✅ в конце | **ВЫСОКИЙ** | `conn` открыт → SELECT agents → цикл с **`generate_local()` (Ollama)** → INSERT; LLM **внутри** открытой транзакции |
| **`agent_knowledge.py`** | `agent_reads_chunk()` | ✅ в конце | **ВЫСОКИЙ** | SELECT agent → **`generate_agent_text()`** (LLM) → INSERT; транзакция открыта на время LLM |
| **`ingest_new_books.py`** | `ingest_new_books()` / `classify_track()` | ✅ `conn.close()` в конце | **ВЫСОКИЙ** | Цикл `for path in all_files` с открытым `conn`; `classify_track()` вызывает **`generate_local()`** при открытой транзакции |
| **`walrus.py`** | `store_bytes()` | частично | **ВЫСОКИЙ** | Module-level `conn`; **`requests.put()` до `commit`** — HTTP 60s+ при открытой транзакции |
| **`corp_economy.py`** | `ensure_schema()` / `run_cycle()` | ✅ per-function | **ВЫСОКИЙ** | `ALTER TABLE agents/corporations` **каждый час** |
| **`birth.py`** | `run_birth_cycle()` | ✅ `finally`/явный close | **ВЫСОКИЙ** | `ensure_schema(cur)` → ALTER `agents` **каждые 30 мин** |
| **`tax_cron.py`** | `apply_tax_cycle()` | ✅ | **ВЫСОКИЙ** | `ensure_schema` каждый час; трогает `agents`, `zrs_state` |
| **`president.py`** | `main()` | ✅ | **ВЫСОКИЙ** | `ensure_president_schema()` → `ensure_schema()` + ALTER `president_state`; watchdog election check **каждые 30 мин** |
| **`senate.py`** | `ensure_senate_schema()` | при вызове | **ВЫСОКИЙ** | Множественные ALTER `president_state`; вызывается из senate tick |
| **`governance_tick.py`** | `_run_governance_tick_once()` | ✅ `finally` | Средний | Хороший образец: `SET lock_timeout`, `statement_timeout`, `rollback` при ошибках; но длинная транзакция на весь tick (~7 шагов) |
| **`predict_market.py`** | `settle_predictions()` | ✅ | Средний | `ALTER TABLE bets` при каждом запуске (30 мин) |
| **`position_thinking.py`** | `ensure_schema()` | при вызове | Средний | ALTER `bets` |
| **`api.py`** | `_ensure_user_bets_table()` | зависит от endpoint | Средний | ALTER `user_bets` на **многих** bet-endpoints (стр. 2685, 2842, 3096, …) |
| **`zion_evolution.py`** | `cycle()` | ✅ | Средний | `ensure_agent_language_column` → ALTER `agents` **каждый час** |
| **`zion_speech.py`** | `agent_speaks()` | ✅ | Средний | `ensure_seed()` + `_ollama_intent_variation()` **до** `db()` — хорошо; но `ensure_schema` внутри txn |
| **`corp_court.py`** | `hold_trial()` | ✅ | Низкий | LLM **вне** DB-транзакции; INSERT только после судов |
| **`settlement.py`** | `get_db()` | ✅ | Низкий | `statement_timeout=15000`, `connect_timeout=5` |
| **`perps_worker.py`** | `get_db()` + async loop | ✅ per-operation | Средний | HTTP Hyperliquid между DB-операциями; отдельные connect |
| **`watchdog.py`** | `has_active_office()` | ✅ `finally` | Низкий | Короткие read-only запросы |
| **`cleanup_zion_messages.py`** | top-level | ❌ | **ВЫСОКИЙ** | `conn = psycopg2.connect` на уровне модуля, нет `try/finally` в скрипте |
| **`hacker_agents.py`**, **`chunk_books.py`** и др. one-shot | `main` | обычно ✅ | Средний | Зависит от конкретного скрипта |

### 2.3 Анти-паттерн «LLM / HTTP внутри открытой транзакции»

| Файл | Строки | Что происходит |
|------|--------|----------------|
| `agent_thoughts.py` | 145–217 | `conn` открыт → SELECT → **`generate_local()`** в цикле → INSERT |
| `agent_knowledge.py` | 134–187 | SELECT → **`generate_agent_text()`** → INSERT |
| `ingest_new_books.py` | 84–124, 212–231 | `classify_track()` → **`generate_local()`** при открытом `cur` |
| `walrus.py` | 75–99 | **`requests.put()`** 60s timeout → INSERT → `commit` |
| `zion_speech.py` | 116–125 | `ensure_seed()` / Ollama **до** connect — **исправленный** порядок |
| `ai_governance.py` | 1923–1969 | `get_civilization_state` закрывается **до** `ai_decide` (OpenRouter) — **правильно** |

---

## ЧАСТЬ 3: Аудит `ensure_schema` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

### 3.1 Центральная функция `civ_common.ensure_schema(cur)` (стр. 146–703)

Вызывается в начале цикла (не один раз при деплое) из **watchdog-скриптов**:

| ALTER на таблице | Строки в `civ_common.py` |
|------------------|--------------------------|
| **`agents`** (debt, home_zone, clan_name + ~12 колонок через `_add_columns`) | 147–168 |
| **`corporations`** (8+ колонок) | 169–190 |
| **`zrs_state`** (reserve + corporate_crisis) | 255–263 |
| **`zrs_loans`** | 431–434 |
| **`president_state`** / **`sheriff_state`** | 489–511 |
| **martial_law** на нескольких таблицах | 703 |

**Даже при существующих колонках** PostgreSQL берёт кратковременный `AccessExclusiveLock` на таблицу.

### 3.2 Дополнительные ALTER вне `civ_common`

| Файл | Функция | Таблицы | Вызывается каждый cycle? |
|------|---------|---------|--------------------------|
| `president.py` | `ensure_president_schema()` | `president_state`, + `ensure_schema` → **agents** | ✅ `main()` при election check / ручной запуск (30 мин) |
| `senate.py` | `ensure_senate_schema()` | `president_state`, + `ensure_schema` | ✅ при senate tick / governance |
| `sheriff.py` | schema helpers | `sheriff_state` | при sheriff tick |
| `corp_economy.py` | `ensure_schema()` | **agents**, **corporations** | ✅ **каждый час** (`watchdog`) |
| `agent_thoughts.py` | `_ensure_messages_schema()` | `agent_messages_zion` | ✅ **каждые 30 мин** |
| `zion_evolution.py` | `ensure_agent_language_column()` | **agents** | ✅ **каждый час** |
| `zion_lang_stats.py` | schema | **agents** | при запуске |
| `predict_market.py` | `settle_predictions()` | **bets** | ✅ **каждые 30 мин** |
| `position_thinking.py` | `ensure_schema()` | **bets** | при запуске |
| `polymarket_sync.py` | schema | `polymarket_markets` | ✅ **каждые 2 ч** |
| `knowledge_loop.py` | `ensure_schema()` | `agent_memory` | ✅ **раз в сутки** |
| `api.py` | `_ensure_user_bets_table()` | `user_bets` | ✅ **при каждом** обращении к bet-API |
| `agent_knowledge.py` | `ensure_schema()` | `agent_knowledge` | ✅ **каждые 30 мин** (read_chunk) |

### 3.3 Скрипты watchdog, вызывающие `ensure_schema(cur)` **на каждом запуске**

| Watchdog-имя | Скрипт | Интервал | Таблицы (через ensure_schema + локальные ALTER) |
|--------------|--------|----------|--------------------------------------------------|
| `governance` | `governance_tick.py` | 30 мин | agents, corporations, zrs_state, … (через дочерние модули) |
| `birth` | `birth.py` | 30 мин | **agents**, corporations, zrs_state, events, … |
| `tax` | `tax_cron.py` | 1 ч | **agents**, zrs_state, civilization_state, … |
| `police` | `police.py` | 30 мин | agents, … |
| `news` | `news.py` | 30 мин | agents, events, … |
| `political_economy` | `political_economy.py` | 30 мин | agents, corporations, … |
| `zrs` | `zrs.py` | 2 ч | zrs_state, agents, … |
| `corp_economy` | `corp_economy.py` | 1 ч | **agents**, **corporations** |
| `catastrophes` | `catastrophes.py` | 3 ч | agents, … |
| `science` | `science_tick.py` | 30 мин | (science tables) |
| `agent_thoughts` | `agent_thoughts.py cycle` | 30 мин | **agents**, agent_messages_zion |
| `zion_evolution` | `zion_evolution.py cycle` | 1 ч | **agents**, agent_messages_zion |
| `knowledge_study` | `agent_knowledge.py read_chunk_cycle` | 30 мин | agent_knowledge, books, … |
| `predict` | `predict_market.py` | 30 мин | **bets** |
| `president_check` | `president.py` | 30 мин (если вакансия) | **agents**, president_state |
| `sheriff_check` | `sheriff.py` | 30 мин (если вакансия) | agents, sheriff_state |

**Оценка конкуренции за лок:** при ~15–20 параллельных screen-процессах, каждые 30–60 мин, множественные `ALTER` на **`agents`** создают постоянную борьбу за `AccessExclusiveLock`. В сочетании с любым `idle in transaction` на чтении `agents` — **гарантированный каскад**.

---

## ЧАСТЬ 4: Фоновые процессы и интервалы

### 4.1 Systemd-сервисы (`systemctl list-units | grep zion`)

| Сервис | ExecStart | Restart | Интервал / режим | Основные таблицы БД |
|--------|-----------|---------|------------------|---------------------|
| `zion-api.service` | `uvicorn api:app :8000` | `always`, `RestartSec=10` | Постоянно | agents, user_bets, events, zrs_state, … (все API) |
| `zion-governance.service` | `python3 ai_governance.py` | `always`, `RestartSec=30` | Цикл **30 мин** | zrs_state, agents, president_state, sheriff_state, events, ai_faction_memory |
| `zion-watchdog.service` | `python3 watchdog.py` | `always`, `RestartSec=10` | Цикл **30 сек** | Запускает screen-скрипты; `sheriff_state`/`president_state` для election check |
| `zion-settlement.service` | `python3 settlement.py` | `always`, `RestartSec=10` | Постоянно (~60s budget) | user_bets, markets |
| `zion-perps.service` | `python3 perps_worker.py` | `always`, `RestartSec=10` | Async loop | agent_trades, perps positions |
| `zion-scheduled-payments.service` | `node scheduled_worker.js` | `always` | Постоянно | (zion_zk, не civ DB напрямую) |
| `zion-auto-withdraw.service` | `node auto_withdraw.js` | `always` | Постоянно | (zion_zk) |
| `zion-frontend.service` | (frontend) | `always` | Постоянно | — |
| `zk-server.service` | `node zk_server.js` | `always`, `RestartSec=5` | Постоянно | — |

**Screen-сессии:** на момент аудита `screen -ls` → **No Sockets found**. Watchdog создаёт их динамически (`screen -dmS <name>`), скрипт завершается, сессия исчезает. Одновременно может быть **до ~35** краткоживущих screen-процессов при срабатывании интервалов.

### 4.2 Watchdog `CRON_SCRIPTS` (полный список из `watchdog.py`)

| Имя screen | Скрипт | Интервал (сек) | Ключевые таблицы |
|------------|--------|----------------|------------------|
| `governance` | `governance_tick.py` | 1800 | agents, zrs_state, president_state, senate_laws, civilization_state |
| `political_economy` | `political_economy.py` | 1800 | agents, corporations, crisis_state |
| `senate_budget` | `senate_budget.py` | 3600 | zrs_state, senate, agents |
| `birth` | `birth.py` | 1800 | **agents**, zrs_state |
| `survival` | `survival.py` | 1800 | agents (selection) |
| `predict` | `predict_market.py` | 1800 | **bets**, agents |
| `corp_economy` | `corp_economy.py` | 3600 | **agents**, **corporations**, corp_events |
| `corp_court` | `corp_court.py` | 7200 | corp_lawsuits, corporations |
| `news` | `news.py` | 1800 | events, agents, media |
| `tax` | `tax_cron.py` | 3600 | **agents**, zrs_state, civilization_state |
| `police` | `police.py` | 1800 | police_divisions, sheriff_state, agents |
| `vip_reflection` | `vip_reflection.py` | 86400 | agents, events |
| `zrs` | `zrs.py` | 7200 | **zrs_state**, zrs_loans, agents |
| `science` | `science_tick.py` | 1800 | zlab_observations, science tables |
| `knowledge_loop` | `knowledge_loop.py` | 86400 | agent_memory |
| `ingest_new_books` | `ingest_new_books.py` | 3600 | books, book_chunks, book_tracks |
| `knowledge_study` | `agent_knowledge.py read_chunk_cycle` | 1800 | agent_knowledge, books |
| `zrs_drain` | `zrs.py drain` | 3600 | agents, zrs_state |
| `market` | `market.py` | 1800 | market data, agents |
| `catastrophes` | `catastrophes.py` | 10800 | agents, civilization_state |
| `crisis_response` | `crisis_response.py` | 3600 | crisis_state, president_state |
| `zionwork` | `zionwork.py` | 1800 | work/jobs tables |
| `zion_speech` | `zion_speech.py cycle` | 3600 | agent_messages_zion, agents |
| `zion_evolution` | `zion_evolution.py cycle` | 3600 | agents, agent_messages_zion, zion_words |
| `zion_lang_record` | `zion_lang_record.py` | 86400 | language stats |
| `agent_thoughts` | `agent_thoughts.py cycle` | 1800 | agent_thoughts, agent_messages_zion, **agents** |
| `security_patterns` | `vuln_patterns.py propose 3` | 86400 | vuln_patterns |
| `security_self_audit` | `security_audit.py scan` | 86400 | audit tables |
| `walrus` | `walrus.py` | 3600 | walrus_blobs, agents, events (snapshot) |
| `polymarket` | `polymarket_sync.py` | 7200 | polymarket_markets |
| `settlements` | `settlement_check.py` | 3600 | user_bets |

**Election checks (30 мин):**

| Имя | Скрипт | Условие | Таблицы |
|-----|--------|---------|---------|
| `president_check` | `president.py` | нет active president | president_state, **agents** |
| `sheriff_check` | `sheriff.py` | нет active sheriff | sheriff_state, agents |

**Дополнительно в watchdog:** `coin_manager.py` каждые **4 ч**; API heartbeat + `systemctl restart zion-api` каждые **~10 мин** если `/stats` ≠ 200.

### 4.3 Cron

```cron
30 3 * * * python3 /root/zion_backend/zionbet.py      # ежедневно 03:30
0  6 * * * python3 /root/zion_backend/nft_lottery.py   # ежедневно 06:00
```

| Скрипт | Таблицы |
|--------|---------|
| `zionbet.py` | **bets**, agents |
| `nft_lottery.py` | nft_legends, agents |

`/etc/cron.d/*` — только certbot, e2scrub, sysstat (не ZION).

---

## ЧАСТЬ 5: Настройки PostgreSQL (текущие)

```sql
SHOW idle_in_transaction_session_timeout;  -- 0  (ОТКЛЮЧЕНО)
SHOW statement_timeout;                    -- 0  (ОТКЛЮЧЕНО)
SHOW lock_timeout;                         -- 0  (ОТКЛЮЧЕНО)
```

**Все три таймаута = 0** на уровне сервера. Per-session таймауты заданы только в `civ_common.DB_CONFIG` (`lock_timeout=8s`, `statement_timeout=120s`), но **`ai_governance.py` их не использует**.

### Рекомендуемые команды (НЕ ПРИМЕНЯТЬ — только для планирования)

```sql
-- Автоматически убивать зависшие idle-транзакции через 60 сек
ALTER ROLE zion_user SET idle_in_transaction_session_timeout = '60s';

-- Убивать любой одиночный запрос дольше 30 сек (осторожно: долгие отчёты)
ALTER ROLE zion_user SET statement_timeout = '30s';

-- Опционально: не ждать лок дольше 5 сек
ALTER ROLE zion_user SET lock_timeout = '5s';
```

**Примечание:** `statement_timeout=30s` может сломать легитимные тяжёлые запросы (полный scan `agents`). Безопаснее начать только с `idle_in_transaction_session_timeout=60s`.

---

## ЧАСТЬ 6: Health-check / автоперезапуск API

### 6.1 Текущее состояние `zion-api.service`

```ini
Restart=always
RestartSec=10
StartLimitBurst=5 / 10   # дублирующиеся ключи в unit-файле
```

✅ Restart при **краше** процесса есть.  
❌ Restart при **зависании** (процесс жив, но не отвечает из-за lock wait на DB) — **нет**.

### 6.2 Существующий watchdog

`watchdog.py` уже проверяет `http://localhost:8000/stats` каждые **~10 минут** (`int(now) % 600 < 30`) с `curl` timeout **10 сек** и делает `systemctl restart zion-api` при не-200.

**Пробелы:**
- Интервал **10 мин** — слишком долго при каскадном коллапсе API.
- Endpoint `/stats` может **кешироваться 30 сек** (`api.py:2400`) — не всегда отражает живость DB.
- Нет отдельного systemd timer — зависит от работоспособности самого watchdog.

### 6.3 Предлагаемый systemd watchdog timer (НЕ ПРИМЕНЯТЬ)

**`/etc/systemd/system/zion-api-healthcheck.service`**
```ini
[Unit]
Description=ZION API health probe

[Service]
Type=oneshot
ExecStart=/bin/bash -c '\
  curl -sf --max-time 5 http://127.0.0.1:8000/api/stats >/dev/null \
  || systemctl restart zion-api'
```

**`/etc/systemd/system/zion-api-healthcheck.timer`**
```ini
[Unit]
Description=ZION API health probe every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

Активация (когда будет разрешено): `systemctl enable --now zion-api-healthcheck.timer`

---

## ИТОГ: Топ-5 критических проблем (приоритет исправления)

| # | Проблема | Файл:строки | Риск повторения до исправления |
|---|----------|-------------|--------------------------------|
| **1** | **Источник инцидента:** `get_civilization_state()` держит read-транзакцию без `rollback/commit`, без PG-таймаутов; после SELECT `zrs_state` основной conn простаивает, пока работает второй | `ai_governance.py:291-553`, особенно **313-328** | **90%** — сервис работает 24/7, цикл 30 мин + API `/api/scenarios/active` |
| **2** | **`ensure_schema()` + ALTER на `agents` при каждом запуске** ~15+ watchdog-скриптов каждые 30–60 мин конкурируют за `AccessExclusiveLock` | `civ_common.py:146-168`, вызовы из `birth.py:42`, `tax_cron.py:150`, `corp_economy.py:28-36`, … | **85%** — при любом `idle in transaction` на `agents` повторится каскад |
| **3** | **Глобальные PG-таймауты = 0**; `ai_governance` и legacy-скрипты не наследуют `civ_common` timeouts | Сервер PG + `ai_governance.py:27-33` | **80%** — любой зависший скрипт блокирует БД часами |
| **4** | **LLM/HTTP внутри открытой DB-транзакции** — Ollama/OpenRouter/Walrus могут занять минуты/часы | `agent_thoughts.py:167-187`, `agent_knowledge.py:160-170`, `ingest_new_books.py:106-124`, `walrus.py:75-99` | **60%** — усиливает п.1–2, создаёт собственные idle-транзакции |
| **5** | **API health-check слишком редкий**; зависший uvicorn не перезапускается systemd сам по себе | `zion-api.service`, `watchdog.py:253-266` | **70%** при DB lock storm — API «мёртв» до 10 мин |

### Оценка общего риска до дедлайна хакатона (7 дней)

При текущей конфигурации (**~35 фоновых циклов**, ALTER на `agents` каждые 30 мин, нулевые PG-таймауты, 2 долгоживущих writer'а `ai_governance` + `perps_worker`) вероятность **повторного полного падения API** оценивается как **высокая (70–85%)** в течение недели без хотя бы пунктов **1 + 2 + 3**.

### Минимальный порядок действий (для разработки, не выполнялось в этом аудите)

1. `ai_governance.py`: `rollback()` после read-only блоков; добавить `options` с timeouts; не держать main conn при `fetch_economic_indicators`.
2. Вынести `ensure_schema()` в одноразовый миграционный шаг / флаг `schema_version`; убрать ALTER из hot path.
3. `ALTER ROLE zion_user SET idle_in_transaction_session_timeout = '60s'` (самый безопасный быстрый предохранитель).
4. Закрывать DB-соединение **до** `generate_local()` / OpenRouter / Walrus HTTP.
5. systemd timer health-check каждую минуту с `curl --max-time 5`.

---

*Аудит выполнен статическим анализом кода и проверкой runtime-конфигурации 2026-06-13. Изменения в репозиторий и систему не вносились.*
