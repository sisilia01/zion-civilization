#!/usr/bin/env python3
"""One-time loader: knowledge_base/*.txt → books table."""
from __future__ import annotations

import os
import re
from pathlib import Path

import psycopg2

from local_llm import generate_local
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

KNOWLEDGE_ROOT = Path(os.path.expanduser("~/zion_backend/knowledge_base"))
CONTENT_LIMIT = 8000


def db():
    return psycopg2.connect(**DB)


def ensure_books_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS books (
            id SERIAL PRIMARY KEY,
            title VARCHAR(500),
            author VARCHAR(300),
            track VARCHAR(50),
            content TEXT,
            summary TEXT,
            file_path VARCHAR(500) UNIQUE,
            loaded_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def _title_from_path(path: Path) -> str:
    stem = path.stem.replace("_", " ")
    return re.sub(r"\s+", " ", stem).strip().title()


def _author_from_filename(filename: str) -> str | None:
    parts = Path(filename).stem.split("_")
    if len(parts) >= 2:
        return parts[-1].replace("-", " ").title()
    return None


def _load_track_map(cur) -> dict[str, str]:
    try:
        from book_classifier import ensure_book_tracks_schema

        ensure_book_tracks_schema(cur)
    except ImportError:
        pass
    cur.execute("SELECT filename, track FROM book_tracks")
    return {
        (row[0] if not isinstance(row, dict) else row["filename"]): (
            row[1] if not isinstance(row, dict) else row["track"]
        )
        for row in cur.fetchall()
    }


def _summarize(title: str, excerpt: str) -> str:
    prompt = (
        f"Book: {title}\n"
        f"Excerpt: {excerpt[:1500]}\n\n"
        "Write exactly 2 sentences summarizing the key ideas of this book."
    )
    summary = generate_local(prompt, max_tokens=120)
    if summary:
        return summary.strip()
    return f"{title}: key ideas from the shared ZION library (summary pending)."


def load_books(force: bool = False) -> dict[str, int]:
    conn = db()
    cur = conn.cursor()
    ensure_books_schema(cur)
    conn.commit()

    track_map = _load_track_map(cur)
    per_track: dict[str, int] = {}
    loaded = 0
    skipped = 0

    txt_files = sorted(
        p
        for p in KNOWLEDGE_ROOT.rglob("*.txt")
        if not re.search(r"batch\d*_log\.txt$", p.name, re.I)
    )

    for path in txt_files:
        rel = str(path.relative_to(KNOWLEDGE_ROOT.parent))
        file_path = str(path)

        if not force:
            cur.execute("SELECT id FROM books WHERE file_path = %s", (file_path,))
            if cur.fetchone():
                skipped += 1
                continue

        try:
            raw = path.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            print(f"[load_books] skip {path.name}: {exc}")
            continue

        content = raw[:CONTENT_LIMIT].replace("\x00", "")
        if not is_clean_text(content):
            print(f"[load_books] skip {path.name}: binary or unreadable content")
            continue
        fname = path.name
        track = track_map.get(fname)
        if not track:
            from book_classifier import classify_book

            track = classify_book(fname, content[:500])
        title = _title_from_path(path)
        author = _author_from_filename(fname)
        summary = _summarize(title, content)

        cur.execute(
            """
            INSERT INTO books (title, author, track, content, summary, file_path, loaded_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (file_path) DO UPDATE SET
                title = EXCLUDED.title,
                author = EXCLUDED.author,
                track = EXCLUDED.track,
                content = EXCLUDED.content,
                summary = EXCLUDED.summary,
                loaded_at = NOW()
            """,
            (title, author, track, content, summary, file_path),
        )
        loaded += 1
        per_track[track] = per_track.get(track, 0) + 1
        if loaded % 25 == 0:
            conn.commit()
            print(f"[load_books] progress: {loaded} loaded...")

    conn.commit()
    cur.close()
    conn.close()

    print(f"[load_books] loaded={loaded} skipped={skipped} total_files={len(txt_files)}")
    for track in sorted(per_track):
        print(f"  {track}: {per_track[track]}")
    return per_track


if __name__ == "__main__":
    import sys

    force_reload = "--force" in sys.argv
    load_books(force=force_reload)
