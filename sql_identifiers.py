"""Validate SQL identifiers before use in DDL (psycopg2 cannot parameterize names)."""
from __future__ import annotations

import re

_COLUMN_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
_TABLE_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
_TYPEDEF_RE = re.compile(r"^[A-Za-z0-9_(),.'\s=]+$")


def safe_column_name(name: str) -> str:
    """Letters, digits, underscore; must start with letter or underscore."""
    if not _COLUMN_RE.match(name):
        raise ValueError(f"Invalid column name: {name}")
    return name


def safe_table_name(name: str) -> str:
    if not _TABLE_RE.match(name):
        raise ValueError(f"Invalid table name: {name}")
    return name


def safe_column_typedef(typedef: str) -> str:
    """PostgreSQL type fragment for ADD COLUMN (hardcoded migrations only)."""
    typedef = typedef.strip()
    if not typedef or not _TYPEDEF_RE.match(typedef):
        raise ValueError(f"Invalid column typedef: {typedef}")
    return typedef
