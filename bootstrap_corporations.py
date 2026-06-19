#!/usr/bin/env python3
"""
One-off: revive bankrupt corporations after corp_economy.py balancing fix.

Run manually after reviewing corp_economy.py changes:
    cd /root/zion_backend && python3 bootstrap_corporations.py

Revives the first 8 corporations (by id) with 1000 ZION treasury each.
Does NOT auto-hire — corp_economy.py run_cycle() will hire on next watchdog tick.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

from corp_economy import db


def bootstrap_corporations(cur, revive_count: int = 8, treasury: float = 1000.0) -> list[int]:
    cur.execute(
        """
        UPDATE corporations SET
            treasury = %s,
            is_active = true,
            negative_cycles = 0,
            last_cycle_revenue = 0
        WHERE id IN (
            SELECT id FROM corporations ORDER BY id LIMIT %s
        )
        RETURNING id, name
        """,
        (treasury, revive_count),
    )
    revived = cur.fetchall()
    return revived


def main() -> int:
    conn = db()
    cur = conn.cursor()
    try:
        revived = bootstrap_corporations(cur)
        conn.commit()
        print(f"Revived {len(revived)} corporations with 1000 ZION treasury:")
        for corp_id, name in revived:
            print(f"  #{corp_id}: {name}")
        print(
            "\nNext: corp_economy watchdog tick will hire + generate revenue. "
            "Run manually now with: python3 corp_economy.py"
        )
        return 0 if revived else 1
    except Exception as exc:
        conn.rollback()
        print(f"[bootstrap] failed: {exc}")
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
