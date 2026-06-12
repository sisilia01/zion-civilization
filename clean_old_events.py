#!/usr/bin/env python3
"""Backup and remove pre-constitutional unconstitutional events from the events table."""
from __future__ import annotations

import csv
import os
import sys

import psycopg2
import psycopg2.extras

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

BACKUP_FILE = "old_events_backup.csv"

PATTERNS = [
    "%dictator%",
    "%POWER GRAB%",
    "%martial%",
    "%print%billion%",
    "%dissolv%",
    "%coup%",
    "%junta%",
    "%shadow government%",
    "%seize power%",
    "%seize%",
    "%execute%enem%",
    "%cancel%election%",
    "%overthrow%",
]

WHERE_CLAUSE = " OR ".join("description ILIKE %s" for _ in PATTERNS)


def main() -> int:
    conn = psycopg2.connect(**DB)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        f"""
        SELECT id, agent_id, event_type, description, zion_amount, priority, created_at
        FROM events
        WHERE {WHERE_CLAUSE}
        ORDER BY id
        """,
        PATTERNS,
    )
    rows = cur.fetchall()
    backed_up = len(rows)

    fieldnames = [
        "id",
        "agent_id",
        "event_type",
        "description",
        "zion_amount",
        "priority",
        "created_at",
    ]
    with open(BACKUP_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(row))

    deleted = 0
    if backed_up:
        cur.execute(f"DELETE FROM events WHERE {WHERE_CLAUSE}", PATTERNS)
        deleted = cur.rowcount
        conn.commit()

    cur.close()
    conn.close()

    print(f"Backed up {backed_up} rows to {BACKUP_FILE}")
    print(f"Deleted {deleted} rows from events")
    return 0


if __name__ == "__main__":
    sys.exit(main())
