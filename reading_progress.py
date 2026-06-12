#!/usr/bin/env python3
"""Per-agent reading progress and civilization-wide book completion tracking."""
from __future__ import annotations

import os
from typing import Any

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
    conn = psycopg2.connect(**DB)
    with conn.cursor() as c:
        c.execute("SET lock_timeout = '8s'")
    conn.commit()
    return conn


def ensure_schema_safe(cur) -> None:
    try:
        ensure_schema(cur)
    except psycopg2.Error:
        cur.connection.rollback()


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS reading_progress (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id),
            book_id INTEGER NOT NULL REFERENCES books(id),
            chunk_index INTEGER NOT NULL,
            insight TEXT,
            read_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (agent_id, book_id, chunk_index)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_progress_agent ON reading_progress(agent_id, read_at DESC)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_progress_book ON reading_progress(book_id, chunk_index)"
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS book_completion (
            book_id INTEGER PRIMARY KEY REFERENCES books(id),
            total_chunks INTEGER NOT NULL DEFAULT 0,
            chunks_read INTEGER NOT NULL DEFAULT 0,
            pct_complete NUMERIC NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def next_unread_chunk(agent_id: int, cur=None) -> dict[str, Any] | None:
    """
    Return the next chunk this agent has not read.
    Prioritizes in-progress books (continue where left off), then new books.
    """
    own_conn = cur is None
    if own_conn:
        conn = db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        ensure_schema_safe(cur)
        conn.commit()

    cur.execute(
        """
        SELECT bc.id AS chunk_id, bc.book_id, bc.chunk_index, bc.chunk_text,
               bc.word_count, b.title, b.track, b.author
        FROM book_chunks bc
        JOIN books b ON b.id = bc.book_id
        WHERE NOT EXISTS (
            SELECT 1 FROM reading_progress rp
            WHERE rp.agent_id = %s
              AND rp.book_id = bc.book_id
              AND rp.chunk_index = bc.chunk_index
        )
        ORDER BY
            CASE WHEN EXISTS (
                SELECT 1 FROM reading_progress rp2
                WHERE rp2.agent_id = %s AND rp2.book_id = bc.book_id
            ) THEN 0 ELSE 1 END,
            (
                SELECT MAX(rp3.read_at) FROM reading_progress rp3
                WHERE rp3.agent_id = %s AND rp3.book_id = bc.book_id
            ) DESC NULLS LAST,
            bc.book_id,
            bc.chunk_index
        LIMIT 1
        """,
        (agent_id, agent_id, agent_id),
    )
    row = cur.fetchone()

    if own_conn:
        cur.connection.close()

    return dict(row) if row else None


def record_chunk_read(
    cur,
    agent_id: int,
    book_id: int,
    chunk_index: int,
    insight: str,
) -> None:
    """Record that an agent finished a chunk."""
    cur.execute(
        """
        INSERT INTO reading_progress (agent_id, book_id, chunk_index, insight)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (agent_id, book_id, chunk_index) DO UPDATE SET
            insight = EXCLUDED.insight,
            read_at = NOW()
        """,
        (agent_id, book_id, chunk_index, insight),
    )


def _scalar(row) -> int:
    if not row:
        return 0
    if isinstance(row, dict):
        return int(next(iter(row.values())) or 0)
    return int(row[0] or 0)


def update_book_completion(cur, book_id: int) -> None:
    """Refresh civilization-wide completion stats for one book."""
    cur.execute("SELECT COUNT(*) AS n FROM book_chunks WHERE book_id = %s", (book_id,))
    total = _scalar(cur.fetchone())
    cur.execute(
        """
        SELECT COUNT(DISTINCT chunk_index) AS n FROM reading_progress
        WHERE book_id = %s
        """,
        (book_id,),
    )
    read = _scalar(cur.fetchone())
    pct = round((read / total) * 100, 2) if total else 0.0
    cur.execute(
        """
        INSERT INTO book_completion (book_id, total_chunks, chunks_read, pct_complete, updated_at)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT (book_id) DO UPDATE SET
            total_chunks = EXCLUDED.total_chunks,
            chunks_read = EXCLUDED.chunks_read,
            pct_complete = EXCLUDED.pct_complete,
            updated_at = NOW()
        """,
        (book_id, total, read, pct),
    )


def refresh_all_book_completion(cur) -> None:
    cur.execute("SELECT DISTINCT book_id FROM book_chunks")
    for row in cur.fetchall():
        book_id = row["book_id"] if isinstance(row, dict) else row[0]
        update_book_completion(cur, book_id)


def civilization_reading_stats(cur) -> dict[str, Any]:
    """Aggregate stats for the whole library."""
    cur.execute("SELECT COUNT(*) AS n FROM book_chunks")
    total_chunks = _scalar(cur.fetchone())

    cur.execute(
        """
        SELECT COUNT(*) AS n FROM (
            SELECT DISTINCT book_id, chunk_index FROM reading_progress
        ) sub
        """
    )
    chunks_read = _scalar(cur.fetchone())

    pct_library = round((chunks_read / total_chunks) * 100, 2) if total_chunks else 0.0

    cur.execute(
        """
        SELECT b.title, bc.chunks_read, bc.pct_complete, bc.total_chunks
        FROM book_completion bc
        JOIN books b ON b.id = bc.book_id
        ORDER BY bc.chunks_read DESC, bc.pct_complete DESC
        LIMIT 5
        """
    )
    top_books = [dict(r) for r in cur.fetchall()]

    cur.execute(
        """
        SELECT COUNT(DISTINCT agent_id) AS n FROM reading_progress
        WHERE read_at > NOW() - INTERVAL '7 days'
        """
    )
    active_readers = _scalar(cur.fetchone())

    cur.execute("SELECT COUNT(DISTINCT book_id) AS n FROM book_chunks")
    total_books = _scalar(cur.fetchone())

    return {
        "total_books": total_books,
        "total_chunks": total_chunks,
        "chunks_read": chunks_read,
        "pct_library_consumed": pct_library,
        "top_books": top_books,
        "active_readers_7d": active_readers,
    }
