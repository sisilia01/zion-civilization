#!/usr/bin/env python3
"""
ZION Amendment Enforcer — applies enacted constitutional amendments to gameplay params.
Reads amendments with status='enacted', maps change_type to parameter deltas, and
persists runtime values in constitutional_params for other modules via get_param().
"""
from __future__ import annotations

import psycopg2
import psycopg2.extras

import os
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

DEFAULT_PARAMS = {
    "top_tax_rate": 0.35,
    "min_tax_rate": 0.05,
    "term_limit_hours": 720,
    "basic_income": 0.0,
    "wealth_tax_rate": 0.0,
    "police_funding_bonus": 0.0,
    "corporate_tax_rate": 0.10,
}

# change_type -> param_key -> delta applied to current value when amendment is enacted
CHANGE_TYPE_MAP = {
    "tax_increase": {
        "top_tax_rate": 0.05,
        "min_tax_rate": 0.01,
        "wealth_tax_rate": 0.02,
    },
    "tax_decrease": {
        "top_tax_rate": -0.05,
        "min_tax_rate": -0.01,
    },
    "redistribution": {
        "basic_income": 5.0,
        "wealth_tax_rate": 0.03,
        "top_tax_rate": 0.02,
    },
    "deregulation": {
        "corporate_tax_rate": -0.02,
        "top_tax_rate": -0.03,
        "min_tax_rate": -0.01,
    },
    "governance": {
        "term_limit_hours": -168,
    },
    "rights_expansion": {
        "basic_income": 2.0,
        "police_funding_bonus": 500.0,
    },
}

PARAM_BOUNDS = {
    "top_tax_rate": (0.05, 0.75),
    "min_tax_rate": (0.0, 0.25),
    "term_limit_hours": (168, 2160),
    "basic_income": (0.0, 50.0),
    "wealth_tax_rate": (0.0, 0.25),
    "police_funding_bonus": (0.0, 10000.0),
    "corporate_tax_rate": (0.0, 0.35),
}


def db():
    return psycopg2.connect(**DB)


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS constitutional_params (
            param_key VARCHAR(80) PRIMARY KEY,
            param_value NUMERIC(20, 6) NOT NULL,
            source_amendment_id INTEGER REFERENCES amendments(id),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def _clamp(key: str, value: float) -> float:
    lo, hi = PARAM_BOUNDS.get(key, (None, None))
    if lo is not None:
        value = max(lo, value)
    if hi is not None:
        value = min(hi, value)
    return round(value, 6)


def ensure_defaults(cur) -> None:
    """Seed constitutional_params with codebase defaults if missing."""
    for key, default in DEFAULT_PARAMS.items():
        cur.execute(
            """
            INSERT INTO constitutional_params (param_key, param_value, source_amendment_id)
            VALUES (%s, %s, NULL)
            ON CONFLICT (param_key) DO NOTHING
            """,
            (key, default),
        )


def _current_params(cur) -> dict[str, float]:
    cur.execute("SELECT param_key, param_value FROM constitutional_params")
    rows = {r["param_key"]: float(r["param_value"]) for r in cur.fetchall()}
    merged = dict(DEFAULT_PARAMS)
    merged.update(rows)
    return merged


def get_param(key: str, default=None):
    """Read a constitutional gameplay parameter (falls back to DEFAULT_PARAMS)."""
    if default is None:
        default = DEFAULT_PARAMS.get(key)
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        ensure_schema(cur)
        cur.execute(
            "SELECT param_value FROM constitutional_params WHERE param_key = %s",
            (key,),
        )
        row = cur.fetchone()
        if row is None:
            return default
        return float(row["param_value"])
    finally:
        cur.close()
        conn.close()


def apply_enacted_amendments() -> list[int]:
    """
    Apply all enacted amendments not yet reflected in constitutional_params.
    Returns list of amendment IDs applied this run.
    """
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    applied: list[int] = []
    try:
        ensure_schema(cur)
        ensure_defaults(cur)
        conn.commit()

        cur.execute(
            """
            SELECT a.*
            FROM amendments a
            WHERE a.status = 'enacted'
              AND a.id NOT IN (
                  SELECT DISTINCT source_amendment_id
                  FROM constitutional_params
                  WHERE source_amendment_id IS NOT NULL
              )
            ORDER BY a.id
            """
        )
        pending = cur.fetchall()
        if not pending:
            print("[enforcer] no unapplied enacted amendments")
            return applied

        params = _current_params(cur)

        for amendment in pending:
            aid = amendment["id"]
            ctype = (amendment.get("change_type") or "").strip()
            deltas = CHANGE_TYPE_MAP.get(ctype)
            if not deltas:
                print(f"[enforcer] amendment #{aid} ({ctype}): no CHANGE_TYPE_MAP entry — skipped")
                continue

            print(f"[enforcer] applying amendment #{aid} ({ctype}): {amendment.get('title', '')[:60]}")
            for param_key, delta in deltas.items():
                current = float(params.get(param_key, DEFAULT_PARAMS.get(param_key, 0)))
                new_val = _clamp(param_key, current + float(delta))
                params[param_key] = new_val
                cur.execute(
                    """
                    INSERT INTO constitutional_params (param_key, param_value, source_amendment_id, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (param_key) DO UPDATE SET
                        param_value = EXCLUDED.param_value,
                        source_amendment_id = EXCLUDED.source_amendment_id,
                        updated_at = NOW()
                    """,
                    (param_key, new_val, aid),
                )
                print(f"  {param_key}: {current} -> {new_val} (delta {delta:+.4g})")

            applied.append(aid)

        conn.commit()
        print(f"[enforcer] applied {len(applied)} amendment(s): {applied}")
        return applied
    finally:
        cur.close()
        conn.close()


def print_params() -> None:
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        ensure_schema(cur)
        ensure_defaults(cur)
        conn.commit()
        cur.execute(
            """
            SELECT param_key, param_value, source_amendment_id, updated_at
            FROM constitutional_params
            ORDER BY param_key
            """
        )
        print("=" * 60)
        print("  CONSTITUTIONAL PARAMS (gameplay)")
        print("=" * 60)
        for row in cur.fetchall():
            src = row["source_amendment_id"] or "default"
            print(
                f"  {row['param_key']:22s} = {float(row['param_value']):>10.4f}  "
                f"(source amendment: {src})"
            )
        print("=" * 60)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    apply_enacted_amendments()
    print_params()
