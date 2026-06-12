from __future__ import annotations
"""ZION district territory control — 15 map zones driven by live simulation stats."""

import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass

import hashlib
import threading
import time
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras

NUM_ZONES = 15
POLICE_RATIO_THRESHOLD = 0.15
GANG_RATIO_THRESHOLD = 0.12
DEATH_SPIKE_THRESHOLD = 2

# Matches frontend MAP_DISTRICT_SHAPES (ids 0–14)
DISTRICT_META: list[tuple[str, str]] = [
    ("archipelago", "Архипелаг"),
    ("nw_cape", "СЗ Мыс"),
    ("north", "Север"),
    ("ne_hub", "СВ Узел"),
    ("core", "Ядро"),
    ("west_center", "Запад-Центр"),
    ("east_center", "Восток-Центр"),
    ("north_center", "Север-Центр"),
    ("south_center", "Юг-Центр"),
    ("port", "Порт"),
    ("south_isle", "Юж. Остров"),
    ("south_edge", "Юж. Окраина"),
    ("admin_square", "Адм. Квадрат"),
    ("hills", "Холмы"),
    ("industrial", "Промзона"),
]

POLICE_EVENT_TYPES = frozenset(
    {
        "police",
        "police_action",
        "police_raid",
        "patrol",
        "sheriff_action",
    }
)
GANG_EVENT_TYPES = frozenset(
    {
        "street_crime",
        "gang",
        "gang_battle",
        "rebellion",
        "revolution",
        "espionage",
        "clan_war",
    }
)
DEATH_EVENT_TYPES = frozenset({"death", "murder", "killed", "assassination"})

POLICE_CLASSES = frozenset({"police", "officer", "sheriff"})
GANG_CLASSES = frozenset({"criminal", "gang", "gangster"})

_lock = threading.Lock()
_districts: list[dict[str, Any]] = []
_updated_at: str | None = None
_alive_agents: int = 0
_prev_status: dict[str, str] = {}
_flash_until: dict[str, float] = {}
_started = False


def get_db():
    from zion_db import get_db as _pooled_get_db

    return _pooled_get_db()


def _zone_index_from_event(agent_id: int | None, description: str) -> int:
    if agent_id is not None and agent_id > 0:
        return int(agent_id) % NUM_ZONES
    blob = (description or "").strip()
    if not blob:
        return 0
    h = int(hashlib.md5(blob.encode()).hexdigest()[:8], 16)
    return h % NUM_ZONES


def _zone_population_weights() -> list[float]:
    """Deterministic population share per zone (sums to 1.0)."""
    raw: list[float] = []
    for district_id, _ in DISTRICT_META:
        h = int(hashlib.md5(f"{district_id}:pop".encode()).hexdigest()[:8], 16)
        raw.append(0.82 + (h % 350) / 1000.0)
    total = sum(raw) or 1.0
    return [w / total for w in raw]


def _fetch_simulation_stats() -> dict[str, Any]:
    """Pull alive agents, class counts, sheriff police_count, and 5m event boosts."""
    defaults: dict[str, Any] = {
        "alive": 0,
        "police_count": 20,
        "police_agents": 0,
        "gang_agents": 0,
        "class_counts": {},
        "zone_police_boost": [0.0] * NUM_ZONES,
        "zone_gang_boost": [0.0] * NUM_ZONES,
        "zone_death_spike": [False] * NUM_ZONES,
        "incidents_today": 0,
    }
    try:
        from zion_db import db_conn

        with db_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            try:
                cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
                alive = int((cur.fetchone() or {}).get("c") or 0)

                class_counts: dict[str, int] = {}
                police_agents = 0
                gang_agents = 0
                try:
                    cur.execute(
                        """
                        SELECT LOWER(class) AS cls, COUNT(*) AS c
                        FROM agents WHERE is_alive = true
                        GROUP BY LOWER(class)
                        """
                    )
                    for row in cur.fetchall():
                        cls = (row.get("cls") or "unknown").lower()
                        c = int(row.get("c") or 0)
                        class_counts[cls] = c
                        if cls in POLICE_CLASSES:
                            police_agents += c
                        if cls in GANG_CLASSES:
                            gang_agents += c
                except Exception:
                    conn.rollback()

                police_count = police_agents
                try:
                    cur.execute(
                        "SELECT police_count FROM sheriff_state WHERE is_active = true LIMIT 1"
                    )
                    sh = cur.fetchone()
                    sheriff_police = int((sh or {}).get("police_count") or 0)
                    police_count = max(police_agents, sheriff_police)
                except Exception:
                    conn.rollback()

                zone_police_boost = [0.0] * NUM_ZONES
                zone_gang_boost = [0.0] * NUM_ZONES
                zone_deaths = [0] * NUM_ZONES

                try:
                    cur.execute(
                        """
                        SELECT agent_id, event_type, description
                        FROM events
                        WHERE created_at >= NOW() - INTERVAL '5 minutes'
                        """
                    )
                    for row in cur.fetchall():
                        et = (row.get("event_type") or "").lower()
                        desc = str(row.get("description") or "")
                        aid = row.get("agent_id")
                        agent_id = int(aid) if aid is not None else None
                        zi = _zone_index_from_event(agent_id, desc)

                        if et in POLICE_EVENT_TYPES:
                            zone_police_boost[zi] += 3.0
                        if et in GANG_EVENT_TYPES:
                            zone_gang_boost[zi] += 3.0
                        if et in DEATH_EVENT_TYPES or "died" in desc.lower() or "death" in desc.lower():
                            zone_deaths[zi] += 1
                except Exception:
                    conn.rollback()

                incidents_today = 0
                try:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS c FROM events
                        WHERE created_at >= CURRENT_DATE
                        AND (
                            event_type = ANY(%s)
                            OR event_type = ANY(%s)
                            OR event_type = ANY(%s)
                        )
                        """,
                        (list(POLICE_EVENT_TYPES), list(GANG_EVENT_TYPES), list(DEATH_EVENT_TYPES)),
                    )
                    incidents_today = int((cur.fetchone() or {}).get("c") or 0)
                except Exception:
                    conn.rollback()

                zone_death_spike = [d >= DEATH_SPIKE_THRESHOLD for d in zone_deaths]

                return {
                    "alive": alive,
                    "police_count": police_count,
                    "police_agents": police_agents,
                    "gang_agents": gang_agents,
                    "class_counts": class_counts,
                    "zone_police_boost": zone_police_boost,
                    "zone_gang_boost": zone_gang_boost,
                    "zone_death_spike": zone_death_spike,
                    "incidents_today": incidents_today,
                }
            finally:
                cur.close()
    except Exception:
        return defaults


def _status_from_ratios(
    police_ratio: float, gang_ratio: float, death_spike: bool
) -> str:
    if death_spike:
        return "contested"
    police_sig = police_ratio > POLICE_RATIO_THRESHOLD
    gang_sig = gang_ratio > GANG_RATIO_THRESHOLD
    if police_sig and gang_sig:
        return "contested"
    if police_sig:
        return "police"
    if gang_sig:
        return "gang"
    return "police"


def _control_pct(status: str, police_ratio: float, gang_ratio: float) -> int:
    if status == "police":
        return min(100, max(45, int(50 + police_ratio * 120)))
    if status == "gang":
        return min(100, max(45, int(50 + gang_ratio * 120)))
    return min(100, max(35, int(42 + abs(police_ratio - gang_ratio) * 80)))


def _build_district(
    index: int,
    district_id: str,
    name: str,
    stats: dict[str, Any],
    weights: list[float],
) -> dict[str, Any]:
    alive = max(int(stats["alive"]), 1)
    w = weights[index]

    zone_total = max(1, int(alive * w))
    zone_police = max(0, int(stats["police_count"] * w) + int(stats["zone_police_boost"][index]))
    zone_gang = max(0, int(stats["gang_agents"] * w) + int(stats["zone_gang_boost"][index]))

    police_ratio = zone_police / zone_total
    gang_ratio = zone_gang / zone_total
    death_spike = bool(stats["zone_death_spike"][index])

    status = _status_from_ratios(police_ratio, gang_ratio, death_spike)
    control_pct = _control_pct(status, police_ratio, gang_ratio)

    pop_share = weights[index]
    population = max(1, int(alive * pop_share))
    inc_base = int(stats["incidents_today"] * pop_share)
    incidents_today = max(0, inc_base)

    flash = False
    with _lock:
        prev = _prev_status.get(district_id)
        if prev and prev != status:
            _flash_until[district_id] = time.time() + 1.5
            flash = True
        elif time.time() < _flash_until.get(district_id, 0):
            flash = True
        _prev_status[district_id] = status

    return {
        "id": district_id,
        "name": name,
        "status": status,
        "control_pct": control_pct,
        "incidents_today": incidents_today,
        "population": population,
        "status_changed": flash,
        "zone_police": zone_police,
        "zone_gang": zone_gang,
        "zone_total": zone_total,
    }


def refresh_districts() -> None:
    global _districts, _updated_at, _alive_agents
    stats = _fetch_simulation_stats()
    weights = _zone_population_weights()
    built = [
        _build_district(idx, did, dname, stats, weights)
        for idx, (did, dname) in enumerate(DISTRICT_META)
    ]

    with _lock:
        _districts = built
        _alive_agents = int(stats["alive"])
        _updated_at = datetime.now(timezone.utc).isoformat()


def get_districts_payload() -> dict[str, Any]:
    with _lock:
        if not _districts:
            refresh_districts()
        zone_counts = {
            "police": sum(1 for d in _districts if d["status"] == "police"),
            "gang": sum(1 for d in _districts if d["status"] == "gang"),
            "contested": sum(1 for d in _districts if d["status"] == "contested"),
        }
        return {
            "districts": list(_districts),
            "updated_at": _updated_at,
            "alive_agents": _alive_agents,
            "zone_counts": zone_counts,
            "counts": zone_counts,
        }


def start_districts_background(interval: int = 30) -> None:
    global _started
    if _started:
        return
    _started = True

    def loop() -> None:
        while True:
            try:
                refresh_districts()
            except Exception as exc:
                print(f"[districts] refresh error: {exc}")
            time.sleep(interval)

    threading.Thread(target=loop, daemon=True).start()