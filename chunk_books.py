#!/usr/bin/env python3
"""Split full book texts on disk into ~5000-word chunks for incremental reading."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import psycopg2

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

WORDS_PER_CHUNK = 5000
GUTENBERG_START = re.compile(
    r"\*{3}\s*START OF (?:THIS |THE )?PROJECT GUTENBERG.*?\n",
    re.IGNORECASE,
)
GUTENBERG_END = re.compile(
    r"\*{3}\s*END OF (?:THIS |THE )?PROJECT GUTENBERG",
    re.IGNORECASE,
)


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
        CREATE TABLE IF NOT EXISTS book_chunks (
            id SERIAL PRIMARY KEY,
            book_id INTEGER NOT NULL REFERENCES books(id),
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            char_start INTEGER NOT NULL,
            char_end INTEGER NOT NULL,
            word_count INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (book_id, chunk_index)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_book_chunks_book ON book_chunks(book_id, chunk_index)"
    )


def strip_gutenberg_boilerplate(text: str) -> str:
    """Remove Project Gutenberg header/footer when present."""
    start = GUTENBERG_START.search(text)
    if start:
        text = text[start.end() :]
    end = GUTENBERG_END.search(text)
    if end:
        text = text[: end.start()]
    return text.strip()


def split_into_chunks(text: str, words_per_chunk: int = WORDS_PER_CHUNK) -> list[dict]:
    """Split text into ordered word-based chunks with char offsets."""
    words = text.split()
    if not words:
        return []

    chunks: list[dict] = []
    offset = 0
    chunk_index = 0

    for i in range(0, len(words), words_per_chunk):
        slice_words = words[i : i + words_per_chunk]
        chunk_str = " ".join(slice_words)
        start = text.find(slice_words[0], offset)
        if start < 0:
            start = offset
        end = start + len(chunk_str)
        chunks.append(
            {
                "chunk_index": chunk_index,
                "chunk_text": chunk_str,
                "char_start": start,
                "char_end": end,
                "word_count": len(slice_words),
            }
        )
        offset = end
        chunk_index += 1

    return chunks


def chunk_book(cur, book_id: int, file_path: str) -> int:
    """Chunk one book from disk. Returns number of chunks created."""
    path = Path(file_path)
    if not path.is_file():
        alt = Path(os.path.expanduser("~/zion_backend/knowledge_base")) / path.name
        if alt.is_file():
            path = alt
        else:
            print(f"[chunk_books] missing file for book {book_id}: {file_path}")
            return 0

    raw = path.read_text(encoding="utf-8", errors="ignore").replace("\x00", "")
    cleaned = strip_gutenberg_boilerplate(raw)
    parts = split_into_chunks(cleaned)
    if not parts:
        print(f"[chunk_books] empty text for book {book_id}: {path.name}")
        return 0

    for part in parts:
        cur.execute(
            """
            INSERT INTO book_chunks
                (book_id, chunk_index, chunk_text, char_start, char_end, word_count)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (book_id, chunk_index) DO NOTHING
            """,
            (
                book_id,
                part["chunk_index"],
                part["chunk_text"],
                part["char_start"],
                part["char_end"],
                part["word_count"],
            ),
        )
    return len(parts)


def chunk_all_books() -> dict:
    """Chunk every book not yet chunked. Idempotent."""
    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    conn.commit()

    cur.execute(
        """
        SELECT b.id, b.file_path, b.title
        FROM books b
        WHERE b.file_path IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM book_chunks bc WHERE bc.book_id = b.id
          )
        ORDER BY b.id
        """
    )
    pending = cur.fetchall()

    books_chunked = 0
    chunks_created = 0
    for book_id, file_path, title in pending:
        n = chunk_book(cur, book_id, file_path)
        if n:
            books_chunked += 1
            chunks_created += n
            print(f"  [{book_id}] {title}: {n} chunks")

    conn.commit()

    cur.execute("SELECT COUNT(DISTINCT book_id) FROM book_chunks")
    total_books = int(cur.fetchone()[0] or 0)
    cur.execute("SELECT COUNT(*) FROM book_chunks")
    total_chunks = int(cur.fetchone()[0] or 0)
    avg = round(total_chunks / total_books, 1) if total_books else 0.0

    cur.close()
    conn.close()

    stats = {
        "books_chunked_this_run": books_chunked,
        "chunks_created_this_run": chunks_created,
        "total_books": total_books,
        "total_chunks": total_chunks,
        "avg_chunks_per_book": avg,
    }
    print(
        f"[chunk_books] {stats['total_books']} books, {stats['total_chunks']} chunks, "
        f"avg {stats['avg_chunks_per_book']} chunks/book "
        f"(+{books_chunked} books / +{chunks_created} chunks this run)"
    )
    return stats


if __name__ == "__main__":
    chunk_all_books()
