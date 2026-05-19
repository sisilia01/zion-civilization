#!/usr/bin/env python3
"""
ZION Watchdog — следит за всеми скриптами цивилизации 24/7
Если скрипт упал — перезапускает автоматически
"""
import subprocess
import time
import os
import logging

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

# Long-running daemons: only restart when screen session is dead (never log-age restarts)
DAEMONS = {
    "settlement": "settlement.py",
    "zion-api": None,  # started via start_api(); not a python file in BACKEND_DIR
}

# Scripts that run once and exit: interval + log_stuck restarts
CRON_SCRIPTS = {
    "tax":          ("tax_cron.py",       3600),
    "birth":        ("birth.py",          1800),
    "corporations": ("corporations.py",   1800),
    "epidemics":    ("epidemics.py",      7200),
    "marriages":    ("marriages.py",      3600),
    "education":    ("education.py",      3600),
    "market":       ("market.py",         1800),
    "espionage":    ("espionage.py",      3600),
    "casino":       ("casino.py",         1800),
    "religion":     ("religion.py",       1800),
    "catastrophes": ("catastrophes.py",   7200),
    "clans":        ("clans.py",          3600),
    "zionwork":     ("zionwork.py",       1800),
    "neo":          ("neo.py",            3600),
    "politics":     ("politics.py",       3600),
    "frs":          ("frs.py",            1800),
    "president":    ("president.py",      3600),
    "sheriff":      ("sheriff.py",        3600),
    "walrus":       ("walrus.py",         3600),
    "polymarket":   ("polymarket_sync.py",   7200),
    "settlements":  ("settlement_check.py",  3600),
    "police":       ("police.py",            1800),
}

last_run = {name: 0 for name in CRON_SCRIPTS}
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
    """HTTP health check (logging only; daemons use screen state for restarts)"""
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
             "http://localhost:8000/stats"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() == "200"
    except Exception:
        return False


def start_api():
    """Start zion-api daemon in screen (only called when screen is dead)"""
    log.info("Starting zion-api daemon...")
    subprocess.run(["pkill", "-f", "uvicorn"], capture_output=True)
    time.sleep(2)
    subprocess.run([
        "screen", "-dmS", "zion-api",
        "bash", "-c",
        f"cd {BACKEND_DIR} && uvicorn api:app --host 0.0.0.0 --port 8000 2>&1 | tee api.log"
    ])
    log.info("zion-api daemon started")


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
    """Restart daemons only when their screen session is dead."""
    for name, script in DAEMONS.items():
        try:
            if is_screen_running(name):
                continue
            log.warning(f"Daemon {name} screen not running — starting")
            if name == "zion-api":
                start_api()
            else:
                run_script(name, script)
        except Exception as e:
            log.exception(f"Daemon check failed for {name}: {e}")


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
        f"Monitoring {len(DAEMONS)} daemons + {len(CRON_SCRIPTS)} cron scripts"
    )

    while True:
        try:
            now = time.time()

            ensure_daemons()
            check_cron_scripts(now)

            if int(now) % 600 < 30:
                api_status = "✅" if is_api_running() else "❌"
                log.info(
                    f"Heartbeat — API:{api_status} | "
                    f"Daemons:{len(DAEMONS)} Cron:{len(CRON_SCRIPTS)}"
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
