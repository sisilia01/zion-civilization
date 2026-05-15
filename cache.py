import threading
import time
import json
from datetime import datetime, timezone

_cache = {}
_lock = threading.Lock()

def get(key):
    with _lock:
        item = _cache.get(key)
        if item and time.time() - item['ts'] < item['ttl']:
            return item['data']
    return None

def set(key, data, ttl=300):
    with _lock:
        _cache[key] = {'data': data, 'ts': time.time(), 'ttl': ttl}

def warm(key, fn, ttl=300, interval=None):
    """Фоновый поток который обновляет кэш"""
    def runner():
        while True:
            try:
                data = fn()
                set(key, data, ttl)
                print(f"[CACHE] {key} updated at {datetime.now(timezone.utc).isoformat()}")
            except Exception as e:
                print(f"[CACHE] {key} error: {e}")
            time.sleep(interval or ttl)
    t = threading.Thread(target=runner, daemon=True)
    t.start()
    return t
