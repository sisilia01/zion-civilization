#!/usr/bin/env python3
"""One-time loader: OWASP Cheat Sheet Series .md files → books + book_chunks (track=SECURITY)."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import psycopg2

from chunk_books import chunk_book, ensure_schema as ensure_chunks_schema
from load_books import CONTENT_LIMIT, _summarize, ensure_books_schema
from text_utils import is_clean_text

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

CHEATSHEETS_ROOT = Path(
    os.environ.get(
        "OWASP_CHEATSHEETS_DIR",
        "/root/zion_backend/owasp_temp/CheatSheetSeries-master/cheatsheets",
    )
)
AUTHOR = "OWASP Foundation"
TRACK = "SECURITY"
CHEAT_SHEET_SUFFIX = "_Cheat_Sheet.md"


def db():
    conn = psycopg2.connect(**DB)
    with conn.cursor() as c:
        c.execute("SET lock_timeout = '8s'")
    conn.commit()
    return conn


def _title_from_cheatsheet(path: Path) -> str:
    """title = filename without _Cheat_Sheet.md (underscores → spaces)."""
    name = path.name
    if name.endswith(CHEAT_SHEET_SUFFIX):
        stem = name[: -len(CHEAT_SHEET_SUFFIX)]
    else:
        stem = path.stem
    return re.sub(r"\s+", " ", stem.replace("_", " ")).strip()


def _default_summary(title: str) -> str:
    return (
        f"OWASP Cheat Sheet: {title}. "
        "Defensive security guidance for secure development and vulnerability prevention."
    )


def _book_exists(cur, title: str, file_path: str) -> int | None:
    """Return existing book id if title or file_path already loaded."""
    cur.execute("SELECT id FROM books WHERE title = %s", (title,))
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute("SELECT id FROM books WHERE file_path = %s", (file_path,))
    row = cur.fetchone()
    if row:
        return int(row[0])
    return None


def _book_has_chunks(cur, book_id: int) -> bool:
    cur.execute("SELECT 1 FROM book_chunks WHERE book_id = %s LIMIT 1", (book_id,))
    return cur.fetchone() is not None


def load_owasp_cheatsheets(*, summarize: bool = False, force: bool = False) -> dict[str, int]:
    if not CHEATSHEETS_ROOT.is_dir():
        raise FileNotFoundError(f"Cheatsheets directory not found: {CHEATSHEETS_ROOT}")

    conn = db()
    cur = conn.cursor()
    ensure_books_schema(cur)
    ensure_chunks_schema(cur)
    conn.commit()

    md_files = sorted(CHEATSHEETS_ROOT.glob("*.md"))
    loaded = 0
    skipped = 0
    chunked_only = 0
    chunks_total = 0

    for path in md_files:
        file_path = str(path.resolve())
        title = _title_from_cheatsheet(path)

        existing_id = None if force else _book_exists(cur, title, file_path)
        if existing_id is not None:
            if _book_has_chunks(cur, existing_id):
                skipped += 1
                continue
            n = chunk_book(cur, existing_id, file_path)
            if n:
                chunked_only += 1
                chunks_total += n
                conn.commit()
                print(f"  [chunked_only] {title}: {n} chunks")
            else:
                skipped += 1
            continue

        try:
            raw = path.read_text(encoding="utf-8", errors="ignore").replace("\x00", "")
        except OSError as exc:
            print(f"[load_owasp_cheatsheets] skip {path.name}: {exc}")
            continue

        if not raw.strip():
            print(f"[load_owasp_cheatsheets] skip empty: {path.name}")
            continue

        content = raw[:CONTENT_LIMIT]
        if not is_clean_text(content):
            print(f"[load_owasp_cheatsheets] skip unreadable: {path.name}")
            continue

        if summarize:
            summary = _summarize(title, content)
        else:
            summary = _default_summary(title)

        cur.execute(
            """
            INSERT INTO books (title, author, track, content, summary, file_path, loaded_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            RETURNING id
            """,
            (title, AUTHOR, TRACK, content, summary, file_path),
        )
        book_id = int(cur.fetchone()[0])
        n = chunk_book(cur, book_id, file_path)
        loaded += 1
        chunks_total += n
        conn.commit()

        if loaded % 10 == 0:
            print(f"[load_owasp_cheatsheets] progress: {loaded} loaded...")

        print(f"  [loaded] {title} → {TRACK} ({n} chunks)")

    cur.close()
    conn.close()

    stats = {
        "loaded": loaded,
        "skipped": skipped,
        "chunked_only": chunked_only,
        "chunks_total": chunks_total,
        "total_files": len(md_files),
    }
    print(
        f"[load_owasp_cheatsheets] loaded={loaded} skipped={skipped} "
        f"chunked_only={chunked_only} chunks={chunks_total} "
        f"total_files={len(md_files)} track={TRACK}"
    )
    return stats


if __name__ == "__main__":
    summarize_flag = "--summarize" in sys.argv
    force_flag = "--force" in sys.argv
    load_owasp_cheatsheets(summarize=summarize_flag, force=force_flag)
