#!/usr/bin/env python3
"""
ZION Watchdog — следит за всеми скриптами цивилизации 24/7
Если скрипт упал — перезапускает автоматически
"""
import subprocess
import time
import os
import logging
from datetime import datetime

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

# Все скрипты цивилизации: имя_screen -> (скрипт, интервал_секунд)
SCRIPTS = {
    "tax":          ("tax_cron.py",    3600),   # каждый час
    "birth":        ("birth.py",       1800),   # каждые 30 мин
    "police":       ("police.py",      3600),   # каждый час
    "corporations": ("corporations.py", 1800),   # каждые 30 мин
    "epidemics":    ("epidemics.py",    7200),   # каждые 2 часа
    "marriages":    ("marriages.py",    3600),   # каждый час
    "education":    ("education.py",    3600),   # каждый час
    "market":       ("market.py",       1800),   # каждые 30 мин
    "espionage":    ("espionage.py",    3600),   # каждый час
    "casino":       ("casino.py",       1800),   # каждые 30 мин
    "religion":     ("religion.py",    1800),   # каждые 30 мин
    "catastrophes": ("catastrophes.py",7200),   # каждые 2 часа
    "clans":        ("clans.py",       3600),   # каждый час
    "zionwork":     ("zionwork.py",    1800),   # каждые 30 мин
    "settlement":   ("settlement.py",  300),    # каждые 5 мин
    "frs":          ("frs.py",          1800),   # каждые 30 мин
    "president":    ("president.py",    3600),   # каждый час
    "sheriff":      ("sheriff.py",      3600),   # каждый часждые 5 мин
}

# Время последнего запуска каждого скрипта
last_run = {name: 0 for name in SCRIPTS}
last_coin_manager = 0
COIN_MANAGER_INTERVAL = 14400  # каждые 4 часа

def is_screen_running(name):
    """Проверяет запущена ли screen сессия"""
    result = subprocess.run(
        ["screen", "-ls"], capture_output=True, text=True
    )
    return f".{name}" in result.stdout and "(Dead" not in result.stdout.split(f".{name}")[1][:20]

def is_api_running():
    """Проверяет работает ли API"""
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", 
             "http://localhost:8000/stats"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() == "200"
    except:
        return False

def restart_api():
    """Перезапускает API"""
    log.warning("API DOWN — restarting...")
    subprocess.run(["pkill", "-f", "uvicorn"], capture_output=True)
    time.sleep(2)
    subprocess.run([
        "screen", "-dmS", "zion-api",
        "bash", "-c", f"cd {BACKEND_DIR} && uvicorn api:app --host 0.0.0.0 --port 8000 2>&1 | tee api.log"
    ])
    log.info("API restarted")

def run_script(name, script):
    """Запускает скрипт в screen сессии"""
    # Убиваем старую сессию если есть
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
    # Если лог старше чем 2x интервал — скрипт завис
    return age > max_age_seconds * 2

def main():
    log.info("=== ZION Watchdog started ===")
    log.info(f"Monitoring {len(SCRIPTS)} scripts + API")
    
    while True:
        now = time.time()
        
        # 1. Проверяем API
        if not is_api_running():
            restart_api()
            time.sleep(5)
        
        # 2. Проверяем каждый скрипт
        for name, (script, interval) in SCRIPTS.items():
            time_since_run = now - last_run[name]
            
            # Время пришло запустить скрипт
            if time_since_run >= interval:
                # Проверяем не запущен ли уже
                if not is_screen_running(name):
                    log.info(f"Running {name} (interval {interval}s)")
                    run_script(name, script)
                    last_run[name] = now
                else:
                    # Скрипт запущен — проверяем не завис ли
                    if check_log_stuck(name, interval):
                        log.warning(f"{name} appears stuck — restarting")
                        run_script(name, script)
                        last_run[name] = now
                    else:
                        last_run[name] = now
        
        # 3. Статус каждые 10 минут
        if int(now) % 600 < 30:
            api_status = "✅" if is_api_running() else "❌"
            log.info(f"Heartbeat — API:{api_status} | Scripts monitored: {len(SCRIPTS)}")
        
        # Coin manager каждые 4 часа
        if now - last_coin_manager >= COIN_MANAGER_INTERVAL:
            subprocess.Popen(
                ["python3", f"{BACKEND_DIR}/coin_manager.py"],
                stdout=open(f"{BACKEND_DIR}/coin_manager.log", "a"),
                stderr=subprocess.STDOUT
            )
            last_coin_manager = now
            log.info("Coin manager started")

        time.sleep(30)  # Проверяем каждые 30 секунд

if __name__ == "__main__":
    main()
