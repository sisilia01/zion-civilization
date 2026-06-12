#!/usr/bin/env python3
"""Auto-ingest new .txt books dropped into knowledge_base — classify, load, chunk."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

from chunk_books import chunk_book, ensure_schema_safe as ensure_chunks_schema
from load_books import (
    CONTENT_LIMIT,
    KNOWLEDGE_ROOT,
    _author_from_filename,
    _summarize,
    _title_from_path,
    ensure_books_schema,
)
from local_llm import generate_local

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

SKIP_NAME_RE = re.compile(r"log", re.IGNORECASE)


def db():
    conn = psycopg2.connect(**DB)
    with conn.cursor() as c:
        c.execute("SET lock_timeout = '8s'")
    conn.commit()
    return conn


def scan_txt_files() -> list[Path]:
    """All .txt under knowledge_base, skipping log artifacts."""
    if not KNOWLEDGE_ROOT.is_dir():
        return []
    return sorted(
        p
        for p in KNOWLEDGE_ROOT.rglob("*.txt")
        if p.is_file()
        and not SKIP_NAME_RE.search(p.name)
        and not re.search(r"batch\d*_log\.txt$", p.name, re.I)
    )


def _normalize_track(raw: str) -> str:
    track = re.sub(r"[^A-Za-z0-9_]", "", raw.upper().replace(" ", "_"))
    return track[:50] if track else "SCIENCE"


def _existing_tracks(cur) -> set[str]:
    from book_classifier import ensure_book_tracks_schema

    ensure_book_tracks_schema(cur)
    cur.execute("SELECT DISTINCT track FROM book_tracks")
    return {
        (r["track"] if isinstance(r, dict) else r[0])
        for r in cur.fetchall()
    }


def classify_track(cur, path: Path, excerpt: str) -> tuple[str, bool]:
    """
    Classify a book into a research track.
    Keyword rules → local Ollama → OpenRouter fallback.
    New tracks are registered automatically in book_tracks.
    """
    from book_classifier import _keyword_classify, classify_book, ensure_book_tracks_schema

    ensure_book_tracks_schema(cur)
    tracks_before = _existing_tracks(cur)
    fname = path.name

    cur.execute("SELECT track FROM book_tracks WHERE filename = %s", (fname,))
    row = cur.fetchone()
    if row:
        track = row["track"] if isinstance(row, dict) else row[0]
        return track, track not in tracks_before

    track = _keyword_classify(fname, excerpt)
    if not track:
        prompt = (
            f"Classify this book into ONE topic category.\n"
            f"Filename: {fname}\n"
            f"First lines: {excerpt[:500]}\n\n"
            "Return only the category name in CAPS with underscores "
            "(e.g. ECONOMICS, ARTIFICIAL_INTELLIGENCE, LITERATURE). "
            "You may invent a new category if none fit."
        )
        local = generate_local(prompt, max_tokens=40)
        if local:
            track = _normalize_track(local.split("\n")[0])
        else:
            track = classify_book(fname, excerpt)

    track = _normalize_track(track)

    cur.execute(
        """
        INSERT INTO book_tracks (filename, track, auto_classified)
        VALUES (%s, %s, true)
        ON CONFLICT (filename) DO UPDATE SET track = EXCLUDED.track
        """,
        (fname, track),
    )

    is_new_track = track not in tracks_before
    return track, is_new_track


def _book_has_chunks(cur, book_id: int) -> bool:
    cur.execute("SELECT 1 FROM book_chunks WHERE book_id = %s LIMIT 1", (book_id,))
    return cur.fetchone() is not None


def ingest_file(cur, path: Path) -> dict | None:
    """Classify + insert + chunk one new book. Returns stats dict or None if skipped."""
    file_path = str(path.resolve())

    cur.execute("SELECT id FROM books WHERE file_path = %s", (file_path,))
    existing = cur.fetchone()
    if existing:
        book_id = int(existing["id"] if isinstance(existing, dict) else existing[0])
        if _book_has_chunks(cur, book_id):
            return None
        n = chunk_book(cur, book_id, file_path)
        return {
            "title": path.stem,
            "track": None,
            "book_id": book_id,
            "chunks": n,
            "new_track": False,
            "action": "chunked_only",
        }

    try:
        raw = path.read_text(encoding="utf-8", errors="ignore").replace("\x00", "")
    except OSError as exc:
        print(f"[ingest_new_books] skip {path.name}: {exc}")
        return None

    if not raw.strip():
        print(f"[ingest_new_books] skip empty: {path.name}")
        return None

    content = raw[:CONTENT_LIMIT]
    excerpt = re.sub(r"\s+", " ", raw).strip()[:2500]
    track, new_track = classify_track(cur, path, excerpt)
    title = _title_from_path(path)
    author = _author_from_filename(path.name)
    summary = _summarize(title, content)

    cur.execute(
        """
        INSERT INTO books (title, author, track, content, summary, file_path, loaded_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
        RETURNING id
        """,
        (title, author, track, content, summary, file_path),
    )
    inserted = cur.fetchone()
    book_id = int(inserted["id"] if isinstance(inserted, dict) else inserted[0])
    chunks = chunk_book(cur, book_id, file_path)

    return {
        "title": title,
        "track": track,
        "book_id": book_id,
        "chunks": chunks,
        "new_track": new_track,
        "action": "ingested",
    }


def ingest_new_books() -> dict:
    """Scan knowledge_base for unprocessed .txt files and run the full pipeline."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_books_schema(cur)
    ensure_chunks_schema(cur)
    conn.commit()

    all_files = scan_txt_files()
    cur.execute("SELECT file_path FROM books")
    known_paths = {
        (r["file_path"] if isinstance(r, dict) else r[0]) for r in cur.fetchall()
    }

    new_candidates = [p for p in all_files if str(p.resolve()) not in known_paths]
    ingested = 0
    chunked_only = 0
    chunks_total = 0
    new_tracks: set[str] = set()
    results: list[dict] = []

    for path in all_files:
        file_path = str(path.resolve())
        cur.execute("SELECT id FROM books WHERE file_path = %s", (file_path,))
        row = cur.fetchone()
        if row and _book_has_chunks(cur, row["id"]):
            continue

        result = ingest_file(cur, path)
        if not result:
            continue

        results.append(result)
        chunks_total += result.get("chunks") or 0
        if result.get("new_track") and result.get("track"):
            new_tracks.add(result["track"])
        if result.get("action") == "chunked_only":
            chunked_only += 1
        else:
            ingested += 1
        conn.commit()
        print(
            f"  [{result.get('action')}] {result.get('title')} → "
            f"{result.get('track') or '(existing)'} ({result.get('chunks')} chunks)"
        )

    cur.close()
    conn.close()

    stats = {
        "scanned": len(all_files),
        "new_found": len(new_candidates),
        "ingested": ingested,
        "chunked_only": chunked_only,
        "chunks_created": chunks_total,
        "new_tracks": sorted(new_tracks),
        "results": results,
    }
    print(
        f"[ingest_new_books] scanned={stats['scanned']} new_found={stats['new_found']} "
        f"ingested={stats['ingested']} chunked_only={stats['chunked_only']} "
        f"chunks={stats['chunks_created']} new_tracks={stats['new_tracks'] or 'none'}"
    )
    return stats


if __name__ == "__main__":
    ingest_new_books()
