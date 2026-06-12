#!/usr/bin/env python3
"""
ZION Watchdog — следит за всеми скриптами цивилизации 24/7
Если скрипт упал — перезапускает автоматически
"""
import subprocess
import time
import os
import logging
import random

from civ_common import get_conn

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [WATCHDOG] %(message)s',
    handlers=[
        logging.FileHandler('/root/zion_backend/watchdog.log'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

BACKEND_DIR = "/root/zion_backend"

# Long-running daemons (API + settlement) are managed by systemd — not watchdog/screen
DAEMONS: dict[str, str | None] = {}

# Scripts that run once and exit: interval + log_stuck restarts
CRON_SCRIPTS = {
    # USA democracy — unified governance tick (FRS → President → Senate → Sheriff)
    "governance":        ("governance_tick.py", 1800),   # 30 min — canonical government cycle
    "political_economy": ("political_economy.py", 1800),  # 30 min — macro feedback loops
    "senate_budget":     ("senate_budget.py",    3600),   # 1 hour — senate spending (fiscal)
    "birth":        ("birth.py",          1800),   # 30 min
    "survival":     ("survival.py",       1800),   # 30 min — evolutionary selection (bank feeds profitable traders)
    "predict":      ("predict_market.py",  1800),   # 30 min — agents forecast across domains (probability calibration study)
    "corp_economy": ("corp_economy.py",    3600),   # 1 hour — corporate hiring/poaching/credit/bankruptcy
    "corp_court":   ("corp_court.py",      7200),   # 2 hours — corporate lawsuits (AI judges)
    "news":         ("news.py",           1800),   # 30 min
    "tax":          ("tax_cron.py",       3600),   # 1 hour
    # [DISABLED for scientific clarity] corporations.py ARCHIVED — corp_economy.py is the active corporate system
    # "corporations": ("corporations.py",   1800),   # 30 min — hiring every cycle
    # [DISABLED for scientific clarity] "clans":        ("clans.py",          3600),   # 1 hour
    "police":       ("police.py",         1800),   # 30 min — authority dynamics (studied as collective-behavior signal)
    # president/senate/sheriff governance handled by governance_tick.py only
    # [DISABLED for scientific clarity] "political_parties": ("political_parties.py", 3600),
    # [DISABLED for scientific clarity] "disasters": ("disasters.py", 2700),  # 45 min average
    # [DISABLED for scientific clarity] "faction_engine": ("faction_engine.py", 1800),  # каждые 30 мин
    "vip_reflection": ("vip_reflection.py", 86400),  # once per day
    # [DISABLED for scientific clarity] "neo":          ("neo.py",            3600),   # 1 hour
    "zrs":          ("zrs.py",            7200),   # 2 hours — canonical central bank
    "science":      ("science_tick.py",   1800),   # 30 min — constitutional science autonomy
    "knowledge_loop": ("knowledge_loop.py", 86400),  # 1x/day — feedback loop: science findings → agent memory
    "knowledge_study": ("agent_knowledge.py study", 3600),  # hourly — agents read books via Ollama
    "zrs_drain":    ("zrs.py drain",      3600),   # 1 hour — population wealth drain
    # [DISABLED for scientific clarity] "education":    ("education.py",      3600),   # 1 hour (paths are 2-3 days)
    # [DISABLED for scientific clarity] "religion":     ("religion.py",       1800),   # 30 min — faith/prayer cycle
    # Other civilization modules (unchanged intervals)
    # [DISABLED for scientific clarity] "epidemics":    ("epidemics.py",      7200),
    # [DISABLED for scientific clarity] "marriages":    ("marriages.py",      3600),
    "market":       ("market.py",         1800),
    # [DISABLED for scientific clarity] "espionage":    ("espionage.py",      3600),
    # [DISABLED for scientific clarity] "casino":       ("casino.py",         1800),
    "catastrophes": ("catastrophes.py",   10800),  # 3h — exogenous shocks (institutional stress test)
    "crisis_response": ("crisis_response.py", 3600),   # 1h — govt reacts to catastrophes
    "zionwork":     ("zionwork.py",       1800),
    # Retired - replaced by senate.py + president.py + political_parties.py
    "zion_speech":      ("zion_speech.py cycle", 3600),       # hourly — agents converse in ZION
    "zion_evolution":   ("zion_evolution.py cycle", 3600),    # hourly — mixed speech + new words
    "zion_lang_record": ("zion_lang_record.py", 86400),       # daily Walrus authorship record
    "security_patterns":   ("vuln_patterns.py propose 3", 86400),             # daily: agents expand detection library (data only)
    "security_self_audit": ("security_audit.py scan ~/zion_backend", 86400),  # daily self-audit, own code only
    "walrus":       ("walrus.py",         3600),
    "polymarket":   ("polymarket_sync.py",   7200),
    "settlements":  ("settlement_check.py",  3600),
}

# Vacancy checks: run election scripts if no active office holder (every 30 min)
ELECTION_CHECKS = {
    "sheriff_check": ("sheriff.py", 1800),
    "president_check": ("president.py", 1800),
}


def get_random_interval(min_sec=900, max_sec=2700):
    return random.randint(min_sec, max_sec)


# Per-script random scheduling windows (seconds)
RANDOM_INTERVAL_RANGES = {
    # [DISABLED for scientific clarity] "political_parties": (1200, 3600), # 20-60 min
    # [DISABLED for scientific clarity] "disasters": (2700, 5400),        # 45-90 min
    # [DISABLED for scientific clarity] "faction_engine": (900, 1800),    # 15-30 мин
}

last_run = {name: 0 for name in CRON_SCRIPTS}
current_intervals = {name: interval for name, (_, interval) in CRON_SCRIPTS.items()}
for _name, (_min_s, _max_s) in RANDOM_INTERVAL_RANGES.items():
    if _name in current_intervals:
        current_intervals[_name] = get_random_interval(_min_s, _max_s)
last_election_check = {name: 0 for name in ELECTION_CHECKS}
last_coin_manager = 0
COIN_MANAGER_INTERVAL = 14400  # каждые 4 часа


def is_screen_running(name):
    """Проверяет запущена ли screen сессия"""
    try:
        result = subprocess.run(
            ["screen", "-ls"], capture_output=True, text=True, timeout=10
        )
        if f".{name}" not in result.stdout:
            return False
        chunk = result.stdout.split(f".{name}", 1)[1][:20]
        return "(Dead" not in chunk
    except Exception as e:
        log.warning(f"screen -ls failed for {name}: {e}")
        return False


def is_api_running():
    """HTTP health check for heartbeat logging only (API managed by systemd)."""
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
             "http://localhost:8000/stats"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() == "200"
    except Exception:
        return False


def run_script(name, script):
    """Запускает скрипт в screen сессии"""
    subprocess.run(["screen", "-S", name, "-X", "quit"], capture_output=True)
    time.sleep(1)
    cmd = f"cd {BACKEND_DIR} && python3 {script} >> {name}.log 2>&1"
    subprocess.run(["screen", "-dmS", name, "bash", "-c", cmd])
    log.info(f"Started {name} ({script})")


def check_log_stuck(name, max_age_seconds):
    """Проверяет не завис ли скрипт (лог не обновлялся слишком долго)"""
    log_file = f"{BACKEND_DIR}/{name}.log"
    if not os.path.exists(log_file):
        return False
    age = time.time() - os.path.getmtime(log_file)
    return age > max_age_seconds * 2


def ensure_daemons():
    """Screen daemons only (API/settlement use systemd: zion-api, zion-settlement)."""
    for name, script in DAEMONS.items():
        try:
            if is_screen_running(name):
                continue
            log.warning(f"Daemon {name} screen not running — starting")
            run_script(name, script)
        except Exception as e:
            log.exception(f"Daemon check failed for {name}: {e}")


def has_active_office(office: str) -> bool:
    """True if an active president or sheriff row exists."""
    table = "sheriff_state" if office == "sheriff" else "president_state"
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT 1 FROM {table} WHERE is_active = true LIMIT 1")
        exists = cur.fetchone() is not None
        cur.close()
        return exists
    except Exception as e:
        log.warning(f"Office check failed for {office}: {e}")
        return True  # assume filled on DB error to avoid election spam
    finally:
        if conn:
            conn.close()


def check_election_offices(now):
    """Every 30 min: run sheriff.py / president.py if office is vacant."""
    for name, (script, interval) in ELECTION_CHECKS.items():
        try:
            if now - last_election_check[name] < interval:
                continue
            last_election_check[name] = now

            office = "sheriff" if name == "sheriff_check" else "president"
            if has_active_office(office):
                continue

            if is_screen_running(name):
                continue

            log.warning(f"No active {office} — running {script} for election")
            run_script(name, script)
        except Exception as e:
            log.exception(f"Election check failed for {name}: {e}")


def check_cron_scripts(now):
    """Interval + log_stuck logic for scripts that run and exit."""
    for name, (script, _) in CRON_SCRIPTS.items():
        try:
            interval = current_intervals.get(name, CRON_SCRIPTS[name][1])
            time_since_run = now - last_run[name]
            if time_since_run < interval:
                continue

            if not is_screen_running(name):
                log.info(f"Running {name} (interval {interval}s)")
                run_script(name, script)
                last_run[name] = now
                if name in RANDOM_INTERVAL_RANGES:
                    min_s, max_s = RANDOM_INTERVAL_RANGES[name]
                    current_intervals[name] = get_random_interval(min_s, max_s)
            elif check_log_stuck(name, interval):
                log.warning(f"{name} appears stuck — restarting")
                run_script(name, script)
                last_run[name] = now
                if name in RANDOM_INTERVAL_RANGES:
                    min_s, max_s = RANDOM_INTERVAL_RANGES[name]
                    current_intervals[name] = get_random_interval(min_s, max_s)
            else:
                last_run[name] = now
        except Exception as e:
            log.exception(f"Cron check failed for {name}: {e}")


def main():
    global last_coin_manager

    log.info("=== ZION Watchdog started ===")
    log.info(
        f"API/settlement: systemd | {len(CRON_SCRIPTS)} cron scripts | "
        f"{len(ELECTION_CHECKS)} election checks"
    )

    while True:
        try:
            now = time.time()

            ensure_daemons()
            check_election_offices(now)
            check_cron_scripts(now)

            if int(now) % 600 < 30:
                if is_api_running():
                    log.info(f"Heartbeat — API:✅ | Cron:{len(CRON_SCRIPTS)}")
                else:
                    log.warning(
                        "Heartbeat — API:❌ down — check: systemctl status zion-api"
                    )
                    print("[WATCHDOG] API down — restarting...")
                    subprocess.Popen(
                        ["nohup", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"],
                        cwd="/root/zion_backend",
                        stdout=open("/var/log/zion-api.log", "a"),
                        stderr=open("/var/log/zion-api.log", "a"),
                    )
                    time.sleep(5)
                    print("[WATCHDOG] API restarted")

            if now - last_coin_manager >= COIN_MANAGER_INTERVAL:
                subprocess.Popen(
                    ["python3", f"{BACKEND_DIR}/coin_manager.py"],
                    stdout=open(f"{BACKEND_DIR}/coin_manager.log", "a"),
                    stderr=subprocess.STDOUT
                )
                last_coin_manager = now
                log.info("Coin manager started")

        except Exception as e:
            log.exception(f"Watchdog loop error: {e}")

        time.sleep(30)


if __name__ == "__main__":
    main()
