#!/usr/bin/env python3
"""Thread-safe PostgreSQL connection pool for long-running services (API, background threads)."""
from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Any

import psycopg2
import psycopg2.pool

from civ_common import DB_CONFIG

_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_lock = threading.Lock()

DEFAULT_MIN = 2
DEFAULT_MAX = 25


class PooledConnection:
    """Wraps a psycopg2 connection; close() returns it to the pool instead of destroying it."""

    __slots__ = ("_conn", "_pool", "_released")

    def __init__(self, conn, pool: psycopg2.pool.ThreadedConnectionPool):
        self._conn = conn
        self._pool = pool
        self._released = False

    def __getattr__(self, item: str) -> Any:
        return getattr(self._conn, item)

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    def __enter__(self) -> PooledConnection:
        return self

    def __exit__(self, *args) -> None:
        self.close()

    def close(self) -> None:
        if self._released:
            return
        self._released = True
        conn = self._conn
        pool = self._pool
        self._conn = None
        self._pool = None
        if conn is None or pool is None:
            return
        try:
            if not conn.closed:
                conn.rollback()
        except Exception:
            pass
        try:
            pool.putconn(conn)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass


def init_pool(minconn: int = DEFAULT_MIN, maxconn: int = DEFAULT_MAX) -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    with _lock:
        if _pool is None:
            _pool = psycopg2.pool.ThreadedConnectionPool(minconn, maxconn, **DB_CONFIG)
        return _pool


def get_db() -> PooledConnection:
    """Borrow a connection from the pool. Always call conn.close() when done (returns to pool)."""
    pool = init_pool()
    return PooledConnection(pool.getconn(), pool)


def close_pool() -> None:
    global _pool
    with _lock:
        if _pool is not None:
            _pool.closeall()
            _pool = None


@contextmanager
def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()
