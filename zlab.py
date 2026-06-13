#!/usr/bin/env python3
"""Z-LAB — autonomous agent research observations from the knowledge base."""
from __future__ import annotations

import hashlib
import os
import random
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg2
import psycopg2.extras

try:
    from openrouter_key import _load_env_file, get_openrouter_key

    _load_env_file()
except ImportError:
    def get_openrouter_key():
        return os.environ.get("OPENROUTER_KEY", "")

BOOKS_DIR = Path(os.path.expanduser("~/zion_backend/knowledge_base/books"))
MODEL = "deepseek/deepseek-chat-v3-0324"
TRACKS = ("ECONOMICS", "POLITICS", "PHILOSOPHY", "LINGUISTICS", "SCIENCE")

TRACK_KEYWORDS = {
    "ECONOMICS": (
        "econom", "market", "trade", "wealth", "money", "capital", "labor",
        "profit", "tax", "commerce", "finance", "bank", "price", "supply",
    ),
    "POLITICS": (
        "politic", "power", "government", "law", "state", "senate", "democra",
        "republic", "constitution", "war", "empire", "treaty", "govern",
    ),
    "PHILOSOPHY": (
        "philosoph", "ethic", "conscious", "moral", "metaphys", "exist",
        "reason", "virtue", "soul", "mind", "kant", "plato", "nietzsche",
    ),
    "LINGUISTICS": (
        "language", "linguist", "word", "grammar", "speech", "rhetoric",
        "translation", "semantic", "syntax",
    ),
}

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}


def db_conn():
    return psycopg2.connect(**DB)


def ensure_schema(cur) -> None:
    from book_classifier import ensure_book_tracks_schema, sync_book_tracks

    ensure_book_tracks_schema(cur)
    sync_book_tracks(cur, verbose=False)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zlab_observations (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER,
            agent_name VARCHAR(100),
            book_title VARCHAR(200),
            author VARCHAR(100),
            track VARCHAR(50),
            observation_text TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            week_number INTEGER,
            month_number INTEGER,
            year_number INTEGER
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zlab_reports (
            id SERIAL PRIMARY KEY,
            report_type VARCHAR(20) DEFAULT 'weekly',
            week_number INTEGER,
            month_number INTEGER,
            year_number INTEGER,
            content_md TEXT,
            walrus_blob_id VARCHAR(100),
            sha256 VARCHAR(64),
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def parse_book_filename(path: Path) -> tuple[str, str]:
    stem = path.stem.replace("_", " ")
    parts = path.stem.split("_")
    if len(parts) >= 2:
        author = parts[-1].replace("-", " ").title()
        title = " ".join(parts[:-1]).replace("-", " ").title()
    else:
        author = "Unknown"
        title = stem.title()
    return title, author


def assign_track(title: str, author: str, excerpt: str = "", filename: str | None = None) -> str:
    from book_classifier import classify_book

    if filename:
        return classify_book(filename, excerpt[:500])
    blob = f"{title} {author} {excerpt[:500]}".lower()
    for track, keywords in TRACK_KEYWORDS.items():
        if any(k in blob for k in keywords):
            return track
    return classify_book(f"{title}_{author}.txt", excerpt[:500])


def assign_track_for_book(cur, book_path: Path, excerpt: str = "") -> str:
    from book_classifier import classify_book, ensure_book_tracks_schema

    ensure_book_tracks_schema(cur)
    cur.execute("SELECT track FROM book_tracks WHERE filename = %s", (book_path.name,))
    row = cur.fetchone()
    if row:
        return row["track"] if isinstance(row, dict) else row[0]
    track = classify_book(book_path.name, excerpt[:500])
    cur.execute(
        """
        INSERT INTO book_tracks (filename, track, auto_classified)
        VALUES (%s, %s, true)
        ON CONFLICT (filename) DO NOTHING
        """,
        (book_path.name, track),
    )
    return track


def resolve_track_for_book(
    cur,
    book_path: Path,
    book_title: str,
    author: str = "",
    excerpt: str = "",
) -> str:
    """Resolve track from book_tracks / books — never reuse stale seed values."""
    from book_classifier import ensure_book_tracks_schema

    ensure_book_tracks_schema(cur)

    cur.execute("SELECT track FROM book_tracks WHERE filename = %s", (book_path.name,))
    row = cur.fetchone()
    if row:
        return row["track"] if isinstance(row, dict) else row[0]

    cur.execute(
        """
        SELECT bt.track
        FROM book_tracks bt
        JOIN books b ON bt.filename = split_part(b.file_path, '/', -1)
        WHERE b.title ILIKE %s OR %s ILIKE '%%' || b.title || '%%'
        LIMIT 1
        """,
        (f"%{book_title}%", book_title),
    )
    row = cur.fetchone()
    if row:
        track = row["track"] if isinstance(row, dict) else row[0]
        cur.execute(
            """
            INSERT INTO book_tracks (filename, track, auto_classified)
            VALUES (%s, %s, true)
            ON CONFLICT (filename) DO UPDATE SET track = EXCLUDED.track
            """,
            (book_path.name, track),
        )
        return track

    cur.execute(
        "SELECT track FROM books WHERE title ILIKE %s LIMIT 1",
        (f"%{book_title}%",),
    )
    row = cur.fetchone()
    if row:
        track = row["track"] if isinstance(row, dict) else row[0]
        cur.execute(
            """
            INSERT INTO book_tracks (filename, track, auto_classified)
            VALUES (%s, %s, true)
            ON CONFLICT (filename) DO UPDATE SET track = EXCLUDED.track
            """,
            (book_path.name, track),
        )
        return track

    return assign_track_for_book(cur, book_path, excerpt)


def read_book_excerpt(path: Path, max_chars: int = 2500) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return text
    start = random.randint(0, max(0, len(text) - max_chars))
    return text[start : start + max_chars]


def list_books() -> list[Path]:
    if not BOOKS_DIR.is_dir():
        return []
    return [p for p in BOOKS_DIR.glob("*.txt") if p.is_file()]


def period_numbers(when: datetime | None = None) -> tuple[int, int, int]:
    dt = when or datetime.now(timezone.utc)
    iso = dt.isocalendar()
    return iso.week, dt.month, dt.year


def get_civ_stats(cur) -> dict:
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    alive = int(cur.fetchone()["c"] or 0)
    cur.execute(
        "SELECT COALESCE(revolution_meter, 0) AS m FROM civilization_state WHERE id = 1"
    )
    row = cur.fetchone() or {}
    revolution = float(row.get("m") or 0)
    cur.execute("SELECT COUNT(*) AS c FROM amendments WHERE status = 'enacted'")
    amendments_count = int(cur.fetchone()["c"] or 0)
    cur.execute("SELECT COALESCE(AVG(balance), 0) AS avg FROM agents WHERE is_alive = true")
    avg_bal = float((cur.fetchone() or {}).get("avg") or 0)
    prosperity = min(100, max(0, round(avg_bal / 20, 1)))
    return {
        "alive": alive,
        "revolution": revolution,
        "amendments_count": amendments_count,
        "prosperity": prosperity,
    }


def pick_research_agents(cur, n: int = 4) -> list[dict]:
    cur.execute(
        """
        SELECT id, name, class
        FROM agents
        WHERE is_alive = true AND class IN ('elite', 'middle')
        ORDER BY RANDOM()
        LIMIT %s
        """,
        (n,),
    )
    return [dict(r) for r in cur.fetchall()]


def _llm_observation(prompt: str) -> str | None:
    from local_llm import generate_agent_text

    text = generate_agent_text(prompt, max_tokens=220, model=MODEL)
    if text:
        return text
    print("[zlab] LLM error: local and OpenRouter both failed")
    return None


def build_prompt(agent: dict, book_title: str, author: str, excerpt: str, stats: dict) -> str:
    return f"""You are agent {agent['name']}, class {agent['class']} in ZION civilization.
Current civilization state: prosperity={stats['prosperity']}%, revolution={stats['revolution']},
alive agents={stats['alive']}, amendments enacted={stats['amendments_count']}

You just read excerpts from "{book_title}" by {author}.
Excerpt: {excerpt[:1200]}

Write ONE short scientific observation (2-3 sentences) about civilization patterns you notice, inspired by this book.
Connect it to real ZION data. Be specific with numbers.
Sign it as a researcher."""


def _fetch_agent_insight(cur, agent_id: int, track: str) -> str | None:
    try:
        cur.execute(
            """
            SELECT insight FROM agent_knowledge
            WHERE agent_id = %s AND track = %s
            AND insight NOT ILIKE '%%gutenberg%%'
            AND insight NOT ILIKE '%%z-library%%'
            AND insight NOT ILIKE '%%zlibrary%%'
            AND length(insight) > 100
            ORDER BY RANDOM() LIMIT 1
            """,
            (agent_id, track),
        )
        row = cur.fetchone()
        if row:
            val = row["insight"] if isinstance(row, dict) else row[0]
            text = (val or "").strip()
            return text or None
    except Exception:
        pass
    return None


def fallback_observation(
    cur,
    agent: dict,
    book_title: str,
    author: str,
    stats: dict,
    track: str,
) -> str:
    insight = _fetch_agent_insight(cur, agent["id"], track)
    if insight:
        return insight

    civ_state = stats
    prosperity = civ_state.get("prosperity", 0)
    templates = [
        f"Studying {book_title}, I find parallels to ZION's current state: "
        f"prosperity at {prosperity:.1f}%, {civ_state.get('alive', 0):,} agents alive. — {agent['name']}",
        f"The principles in {book_title} reveal unexpected insights for our civilization's "
        f"{track.lower()} dynamics. — {agent['name']}",
        f"Reading {book_title} changes how I see ZION's {track.lower()} challenges "
        f"under revolution pressure {civ_state.get('revolution', 0):.0f}. — {agent['name']}",
        f"From {book_title}: the most relevant concept for ZION today is how systems adapt "
        f"under constitutional change ({civ_state.get('amendments_count', 0)} amendments). — {agent['name']}",
        f"{book_title} offers a framework I hadn't considered for our {track.lower()} domain "
        f"at prosperity index {prosperity:.1f}%. — {agent['name']}",
        f"The author of {book_title} would observe ZION's situation as a test of "
        f"elite–middle incentives with {civ_state.get('alive', 0):,} participants. — {agent['name']}",
        f"Cross-referencing {book_title} with ZION's prosperity index {prosperity:.1f}% "
        f"suggests new {track.lower()} priorities. — {agent['name']}",
        f"What {book_title} teaches about systems under pressure applies directly to ZION "
        f"with revolution at {civ_state.get('revolution', 0):.0f}. — {agent['name']}",
    ]
    return random.choice(templates)


def _observation_text(
    cur,
    agent: dict,
    book_title: str,
    author: str,
    excerpt: str,
    stats: dict,
    track: str,
) -> str:
    prior_insight = _fetch_agent_insight(cur, agent["id"], track)
    prompt = build_prompt(agent, book_title, author, excerpt, stats)
    if prior_insight:
        prompt = f"Prior insight from this agent's reading:\n{prior_insight}\n\n{prompt}"
    return (
        _llm_observation(prompt)
        or prior_insight
        or fallback_observation(cur, agent, book_title, author, stats, track)
    )


def insert_observation(
    cur,
    agent: dict,
    book_title: str,
    author: str,
    track: str,
    text: str,
    when: datetime | None = None,
) -> int:
    week, month, year = period_numbers(when)
    cur.execute(
        """
        INSERT INTO zlab_observations
            (agent_id, agent_name, book_title, author, track, observation_text,
             week_number, month_number, year_number, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (
            agent["id"],
            agent["name"],
            book_title,
            author,
            track,
            text,
            week,
            month,
            year,
            when or datetime.now(timezone.utc),
        ),
    )
    row = cur.fetchone()
    return int(row["id"] if isinstance(row, dict) else row[0])


def generate_observations(cur, count: int | None = None) -> list[int]:
    books = list_books()
    if not books:
        print("[zlab] no books in knowledge_base/books")
        return []
    agents = pick_research_agents(cur, random.randint(3, 5))
    if not agents:
        print("[zlab] no elite/middle agents available")
        return []
    stats = get_civ_stats(cur)
    n = count or random.randint(3, 5)
    created: list[int] = []
    for agent in agents[:n]:
        book_path = random.choice(books)
        book_title, author = parse_book_filename(book_path)
        excerpt = read_book_excerpt(book_path)
        track = resolve_track_for_book(cur, book_path, book_title, author, excerpt)
        text = _observation_text(cur, agent, book_title, author, excerpt, stats, track)
        oid = insert_observation(cur, agent, book_title, author, track, text)
        created.append(oid)
        print(f"[zlab] observation #{oid}: {agent['name']} / {book_title[:40]}")
    return created


def seed_samples(cur, n: int = 10) -> int:
    """Demo observations without LLM."""
    books = list_books()
    if not books:
        return 0
    cur.execute("SELECT COUNT(*) AS c FROM zlab_observations")
    if int(cur.fetchone()["c"] or 0) > 0:
        return 0
    stats = get_civ_stats(cur)
    cur.execute(
        """
        SELECT id, name, class FROM agents
        WHERE is_alive = true AND class IN ('elite', 'middle')
        ORDER BY RANDOM() LIMIT %s
        """,
        (n,),
    )
    agents = [dict(r) for r in cur.fetchall()]
    if not agents:
        return 0
    created = 0
    for i in range(n):
        agent = agents[i % len(agents)]
        book_path = books[i % len(books)]
        book_title, author = parse_book_filename(book_path)
        excerpt = read_book_excerpt(book_path)
        track = resolve_track_for_book(cur, book_path, book_title, author, excerpt)
        text = _observation_text(cur, agent, book_title, author, excerpt, stats, track)
        insert_observation(cur, agent, book_title, author, track, text)
        created += 1
    print(f"[zlab] seeded {created} sample observations")
    return created


def run_governance_tick(cur, ctx: dict) -> dict:
    """Generate research observations each governance cycle."""
    ensure_schema(cur)
    created = generate_observations(cur)
    ctx["zlab"] = {
        "observations_created": len(created),
        "summary": f"{len(created)} research observations" if created else "no observations",
    }

    tick_id = int(ctx.get("tick_id") or 0)
    if tick_id > 0 and tick_id % 50 == 0:
        try:
            from weekly_report_generator import maybe_generate_weekly_report

            report = maybe_generate_weekly_report(cur, tick_id)
            if report:
                ctx["zlab"]["weekly_report"] = report.get("id")
        except Exception as e:
            print(f"[zlab] weekly report error: {e}")

    try:
        from archive_generator import maybe_run_scheduled_reports

        archive_reports = maybe_run_scheduled_reports(cur)
        if archive_reports:
            ctx["zlab"]["archive_reports"] = [r.get("id") for r in archive_reports]
    except Exception as e:
        print(f"[zlab] archive schedule error: {e}")

    return ctx


def main():
    import sys

    conn = db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    if "--seed" in sys.argv or "--generate-samples" in sys.argv:
        flag = "--seed" if "--seed" in sys.argv else "--generate-samples"
        idx = sys.argv.index(flag)
        n = 10
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            n = int(sys.argv[idx + 1])
        seed_samples(cur, n)
    else:
        generate_observations(cur)
    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
