#!/usr/bin/env python3
"""ZION Language evolution statistics — adoption, vocab, generations."""
from __future__ import annotations

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


def db():
    return psycopg2.connect(**DB)


def civilization_language_level() -> float:
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS language_level NUMERIC DEFAULT 0.0"
    )
    conn.commit()
    cur.execute(
        """
        SELECT COALESCE(AVG(language_level), 0.0)
        FROM agents WHERE is_alive = true
        """
    )
    avg = float(cur.fetchone()[0] or 0.0)
    cur.close()
    conn.close()
    return avg


def vocab_size_over_time() -> dict:
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT COUNT(*) AS n FROM zion_vocab")
    current = int(cur.fetchone()["n"] or 0)
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM zion_vocab_coins
        WHERE coined_at > NOW() - INTERVAL '7 days'
        """
    )
    recent_coins = 0
    try:
        recent_coins = int(cur.fetchone()["n"] or 0)
    except Exception:
        conn.rollback()
    founding_estimate = max(0, current - recent_coins)
    cur.close()
    conn.close()
    return {
        "current": current,
        "founding_estimate": founding_estimate,
        "coined_last_7d": recent_coins,
    }


def generation_report() -> list[dict]:
    """Language level by agent age (proxy for generation)."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS language_level NUMERIC DEFAULT 0.0"
    )
    conn.commit()
    cur.execute(
        """
        SELECT
            CASE
                WHEN COALESCE(age_days, 0) = 0 THEN 'newborn (gen N+1)'
                WHEN age_days < 20 THEN 'young (0-20d)'
                WHEN age_days < 50 THEN 'adult (20-50d)'
                ELSE 'elder (50d+)'
            END AS cohort,
            COUNT(*) AS agents,
            ROUND(AVG(COALESCE(language_level, 0))::numeric, 3) AS avg_zion_level,
            ROUND(MIN(COALESCE(language_level, 0))::numeric, 3) AS min_level,
            ROUND(MAX(COALESCE(language_level, 0))::numeric, 3) AS max_level
        FROM agents
        WHERE is_alive = true
        GROUP BY 1
        ORDER BY min_level DESC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def print_report() -> None:
    avg = civilization_language_level()
    vocab = vocab_size_over_time()
    gens = generation_report()

    print("=" * 56)
    print("  ZION LANGUAGE EVOLUTION — CIVILIZATION REPORT")
    print("=" * 56)
    print(f"  Civilization ZION adoption: {avg * 100:.1f}% (avg language_level={avg:.3f})")
    print(f"  Vocabulary size: {vocab['current']} words")
    print(f"    (founding core ~{vocab['founding_estimate']}, +{vocab['coined_last_7d']} coined last 7d)")
    print("\n  Generational breakdown:")
    for g in gens:
        print(
            f"    {g['cohort']:18s}  n={g['agents']:5d}  "
            f"avg={float(g['avg_zion_level']):.3f}  "
            f"range [{float(g['min_level']):.2f}–{float(g['max_level']):.2f}]"
        )
    print("=" * 56)


if __name__ == "__main__":
    print_report()
    sys.exit(0)
