#!/usr/bin/env python3
"""
ZION Watchdog — следит за всеми скриптами цивилизации 24/7
Если скрипт упал — перезапускает автоматически
"""
import subprocess
import time
import os
import logging

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
    # CIVILIZATION_LOGIC.md schedule (new architecture)
    "birth":        ("birth.py",          1800),   # 30 min
    "news":         ("news.py",           1800),   # 30 min
    "tax":          ("tax_cron.py",       3600),   # 1 hour
    "corporations": ("corporations.py",   3600),   # 1 hour
    "clans":        ("clans.py",          3600),   # 1 hour
    "police":       ("police.py",         3600),   # 1 hour
    "sheriff":      ("sheriff.py",        3600),   # 1 hour
    "president":    ("president.py",      3600),   # 1 hour
    "senate":       ("senate.py",         3600),   # 1 hour — legislature & elections
    "political_parties": ("political_parties.py", 3600),
    "vip_reflection": ("vip_reflection.py", 86400),  # once per day
    "neo":          ("neo.py",            3600),   # 1 hour
    "zrs":          ("zrs.py",            7200),   # 2 hours — canonical central bank
    "education":    ("education.py",      3600),   # 1 hour (paths are 2-3 days)
    "religion":     ("religion.py",       1800),   # 30 min — faith/prayer cycle
    # Other civilization modules (unchanged intervals)
    "epidemics":    ("epidemics.py",      7200),
    "marriages":    ("marriages.py",      3600),
    "market":       ("market.py",         1800),
    "espionage":    ("espionage.py",      3600),
    "casino":       ("casino.py",         1800),
    "catastrophes": ("catastrophes.py",   7200),
    "zionwork":     ("zionwork.py",       1800),
    # Retired - replaced by senate.py + president.py + political_parties.py
    "walrus":       ("walrus.py",         3600),
    "polymarket":   ("polymarket_sync.py",   7200),
    "settlements":  ("settlement_check.py",  3600),
}

# Vacancy checks: run election scripts if no active office holder (every 30 min)
ELECTION_CHECKS = {
    "sheriff_check": ("sheriff.py", 1800),
    "president_check": ("president.py", 1800),
}

last_run = {name: 0 for name in CRON_SCRIPTS}
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
    for name, (script, interval) in CRON_SCRIPTS.items():
        try:
            time_since_run = now - last_run[name]
            if time_since_run < interval:
                continue

            if not is_screen_running(name):
                log.info(f"Running {name} (interval {interval}s)")
                run_script(name, script)
                last_run[name] = now
            elif check_log_stuck(name, interval):
                log.warning(f"{name} appears stuck — restarting")
                run_script(name, script)
                last_run[name] = now
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
