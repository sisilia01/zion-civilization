#!/usr/bin/env python3
"""Universal library access + merit-based knowledge for ZION agents."""
from __future__ import annotations

import os
import sys

import psycopg2
import psycopg2.extras

from local_llm import generate_agent_text, generate_local, generate_local_only

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

os.environ.setdefault("USE_LOCAL_MODEL", "true")

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

CONTEXT_TRACKS = {
    "trading": ("ECONOMICS", "ARTIFICIAL_INTELLIGENCE", "PSYCHOLOGY"),
    "forecasting": ("ECONOMICS", "SCIENCE", "POLITICS", "PSYCHOLOGY"),
    "governance": ("POLITICS", "PHILOSOPHY", "ECONOMICS", "HISTORY"),
    "security": ("SECURITY", "BLOCKCHAIN"),
    "science": ("SCIENCE", "ARTIFICIAL_INTELLIGENCE", "COSMOLOGY"),
    "general": ("PHILOSOPHY", "ECONOMICS", "POLITICS", "SCIENCE"),
}


def db():
    conn = psycopg2.connect(**DB)
    with conn.cursor() as c:
        c.execute("SET lock_timeout = '8s'")
    conn.commit()
    return conn


def ensure_schema_safe(cur) -> None:
    """Create tables when possible; skip DDL if DB lock prevents it."""
    try:
        ensure_schema(cur)
    except psycopg2.Error:
        cur.connection.rollback()


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_knowledge (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id),
            book_id INTEGER REFERENCES books(id),
            track VARCHAR(50),
            insight TEXT,
            applied_count INTEGER DEFAULT 0,
            usefulness_score NUMERIC DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent_id)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_knowledge_track ON agent_knowledge(track)"
    )
    cur.execute(
        "ALTER TABLE agent_knowledge ADD COLUMN IF NOT EXISTS chunk_index INTEGER"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_knowledge_book_chunk "
        "ON agent_knowledge(book_id, chunk_index)"
    )


def agent_reads_book(agent_id: int, book_id: int) -> str | None:
    """Agent extracts one practical insight from a book."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    conn.commit()

    cur.execute(
        """
        SELECT a.name, a.class, b.title, b.track, b.summary, b.content
        FROM agents a, books b
        WHERE a.id = %s AND b.id = %s AND a.is_alive = true
        """,
        (agent_id, book_id),
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return None

    prompt = (
        f"You are {row['name']}, a {row['class']} class agent in ZION civilization.\n"
        f"You read '{row['title']}' ({row['track']}).\n"
        f"Summary: {row['summary']}\n"
        f"Excerpt: {(row['content'] or '')[:2000]}\n\n"
        "Extract ONE practical insight for surviving/thriving in ZION "
        "(trading, governance, security, or philosophy). One or two sentences only."
    )
    insight = generate_local_only(prompt, max_tokens=150)

    cur.execute(
        """
        INSERT INTO agent_knowledge (agent_id, book_id, track, insight)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (agent_id, book_id, row["track"], insight),
    )
    conn.commit()
    cur.close()
    conn.close()
    return insight


def agent_reads_chunk(agent_id: int, chunk: dict) -> str | None:
    """Extract one practical insight from a single book chunk (not the whole book)."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema_safe(cur)
    from reading_progress import ensure_schema_safe as ensure_reading_schema, record_chunk_read, update_book_completion

    ensure_reading_schema(cur)
    conn.commit()

    agent = None
    try:
        cur.execute(
            "SELECT name, class FROM agents WHERE id = %s AND is_alive = true",
            (agent_id,),
        )
        agent = cur.fetchone()
    except psycopg2.Error:
        conn.rollback()
    if not agent:
        agent = {"name": f"Agent-{agent_id}", "class": "citizen"}

    book_id = chunk["book_id"]
    chunk_index = chunk["chunk_index"]
    title = chunk.get("title") or "Unknown"
    track = chunk.get("track") or "SCIENCE"
    chunk_text = (chunk.get("chunk_text") or "")[:2000]

    prompt = (
        f"You are {agent['name']}, a {agent['class']} class agent in ZION civilization.\n"
        f"You are reading '{title}' ({track}), section {chunk_index + 1}.\n\n"
        f"TEXT FROM THIS SECTION ONLY:\n{chunk_text}\n\n"
        "Extract ONE practical insight from THIS SECTION ONLY for surviving/thriving in ZION "
        "(trading, governance, security, or philosophy). One or two sentences. "
        "Do not summarize the whole book — only what is in this section."
    )
    insight = generate_local_only(prompt, max_tokens=150)

    try:
        cur.execute(
            """
            INSERT INTO agent_knowledge (agent_id, book_id, track, insight, chunk_index)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (agent_id, book_id, track, insight, chunk_index),
        )
    except psycopg2.Error:
        conn.rollback()
    record_chunk_read(cur, agent_id, book_id, chunk_index, insight)
    update_book_completion(cur, book_id)
    conn.commit()
    cur.close()
    conn.close()
    return insight


def read_chunk_cycle(batch: int = 30) -> int:
    """Each agent reads a distinct civilization-unread chunk — cover-to-cover over many cycles."""
    from chunk_books import ensure_schema_safe as ensure_chunks_schema
    from reading_progress import ensure_schema_safe as ensure_reading_schema, assign_unread_chunks_batch

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema_safe(cur)
    ensure_chunks_schema(cur)
    ensure_reading_schema(cur)
    conn.commit()

    cur.execute("SELECT COUNT(*) AS n FROM book_chunks")
    if int((cur.fetchone() or {}).get("n") or 0) == 0:
        print("[agent_knowledge] no book chunks — run chunk_books.py first")
        cur.close()
        conn.close()
        return 0

    agent_ids: list[int] = []
    try:
        cur.execute(
            """
            SELECT id FROM agents
            WHERE is_alive = true
            ORDER BY RANDOM()
            LIMIT %s
            """,
            (batch,),
        )
        agent_ids = [int(r["id"]) for r in cur.fetchall()]
    except psycopg2.Error:
        conn.rollback()
    if not agent_ids:
        cur.execute(
            """
            SELECT agent_id FROM (
                SELECT DISTINCT agent_id FROM zlab_observations
            ) sub
            ORDER BY RANDOM()
            LIMIT %s
            """,
            (batch,),
        )
        agent_ids = [int(r["agent_id"]) for r in cur.fetchall()]

    assignments = assign_unread_chunks_batch(agent_ids, cur)
    cur.close()
    conn.close()

    created = 0
    for agent_id in agent_ids:
        chunk = assignments.get(agent_id)
        if not chunk:
            continue
        insight = agent_reads_chunk(agent_id, chunk)
        if insight:
            created += 1
            print(
                f"  agent {agent_id} | {chunk.get('title')} "
                f"| chunk {chunk['chunk_index']} | {insight[:80]}..."
            )

    print(f"[agent_knowledge] read_chunk_cycle: {created} chunk insights from {len(agent_ids)} agents")
    return created


def reading_stats() -> dict:
    """Civilization-wide library consumption metrics."""
    from chunk_books import ensure_schema_safe as ensure_chunks_schema
    from reading_progress import civilization_reading_stats, ensure_schema_safe as ensure_reading_schema, refresh_all_book_completion

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema_safe(cur)
    ensure_chunks_schema(cur)
    ensure_reading_schema(cur)
    refresh_all_book_completion(cur)
    conn.commit()
    stats = civilization_reading_stats(cur)
    cur.close()
    conn.close()
    return stats


def print_reading_stats() -> None:
    stats = reading_stats()
    print(f"[reading_stats] library: {stats['total_chunks']} chunks across {stats['total_books']} books")
    print(f"[reading_stats] consumed: {stats['chunks_read']} chunks ({stats['pct_library_consumed']}%)")
    print(f"[reading_stats] active readers (7d): {stats['active_readers_7d']}")
    print("[reading_stats] top 5 most-read books:")
    for i, book in enumerate(stats.get("top_books") or [], 1):
        print(
            f"  {i}. {book.get('title')} — "
            f"{book.get('chunks_read')}/{book.get('total_chunks')} chunks "
            f"({book.get('pct_complete')}%)"
        )


def knowledge_study_cycle(batch: int = 50) -> int:
    """Random alive agents each read one random book (any track)."""
    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM books")
    if int(cur.fetchone()[0] or 0) == 0:
        print("[agent_knowledge] no books loaded — run load_books.py first")
        cur.close()
        conn.close()
        return 0

    cur.execute(
        """
        SELECT id FROM agents
        WHERE is_alive = true
        ORDER BY RANDOM()
        LIMIT %s
        """,
        (batch,),
    )
    agent_ids = [r[0] for r in cur.fetchall()]
    created = 0

    for agent_id in agent_ids:
        cur.execute("SELECT id FROM books ORDER BY RANDOM() LIMIT 1")
        book_row = cur.fetchone()
        if not book_row:
            break
        book_id = book_row[0]
        cur.close()
        conn.close()
        if agent_reads_book(agent_id, book_id):
            created += 1
        conn = db()
        cur = conn.cursor()

    cur.close()
    conn.close()
    print(f"[agent_knowledge] study cycle: {created} insights from {len(agent_ids)} agents")
    return created


def apply_knowledge_to_decision(agent_id: int, context: str = "general") -> str:
    """Return top 3 insights by usefulness_score for the context's tracks."""
    tracks = CONTEXT_TRACKS.get(context.lower(), CONTEXT_TRACKS["general"])
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)

    cur.execute(
        """
        SELECT insight, track, usefulness_score
        FROM agent_knowledge
        WHERE agent_id = %s AND track = ANY(%s)
        ORDER BY usefulness_score DESC, created_at DESC
        LIMIT 3
        """,
        (agent_id, list(tracks)),
    )
    rows = cur.fetchall()

    cur.close()
    conn.close()
    if not rows:
        return ""
    return "\n".join(f"- [{r['track']}] {r['insight']}" for r in rows)


def reward_knowledge_merit(agent_id: int, context: str) -> int:
    """Increment usefulness when knowledge led to a successful outcome."""
    tracks = CONTEXT_TRACKS.get(context.lower())
    if not tracks:
        return 0
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE agent_knowledge SET
            usefulness_score = usefulness_score + 1,
            applied_count = applied_count + 1
        WHERE agent_id = %s AND track = ANY(%s)
        """,
        (agent_id, list(tracks)),
    )
    updated = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return updated


def expert_analysis(topic: str, track: str, top_n: int = 5) -> str:
    """Collective expert report from agents with most insights in a track."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)

    cur.execute(
        """
        SELECT ak.agent_id, a.name, COUNT(*) AS insight_count,
               STRING_AGG(ak.insight, ' | ' ORDER BY ak.usefulness_score DESC) AS insights
        FROM agent_knowledge ak
        JOIN agents a ON a.id = ak.agent_id
        WHERE ak.track = %s AND a.is_alive = true
        GROUP BY ak.agent_id, a.name
        ORDER BY insight_count DESC, SUM(ak.usefulness_score) DESC
        LIMIT %s
        """,
        (track, top_n),
    )
    experts = cur.fetchall()
    cur.close()
    conn.close()

    if not experts:
        return f"No experts with {track} insights yet. Run study cycles after load_books.py."

    expert_block = "\n".join(
        f"- {e['name']}: {e['insights'][:400]}" for e in experts
    )
    prompt = (
        f"Topic: {topic}\nTrack: {track}\n\n"
        f"Expert agent insights:\n{expert_block}\n\n"
        "Synthesize a combined expert report (vulnerabilities, risks, recommendations). "
        "Be specific and actionable. 4-8 sentences."
    )
    report = generate_local(prompt, max_tokens=400) or generate_agent_text(
        prompt, max_tokens=400
    )
    return report or "Expert analysis unavailable (LLM offline)."


def record_knowledge_application(agent_id: int, profit: float = 0) -> None:
    """Bump usefulness when knowledge leads to profitable application."""
    if profit <= 0:
        return
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE agent_knowledge SET
            applied_count = applied_count + 1,
            usefulness_score = usefulness_score + %s
        WHERE id = (
            SELECT id FROM agent_knowledge
            WHERE agent_id = %s
            ORDER BY created_at DESC LIMIT 1
        )
        """,
        (min(profit, 10.0), agent_id),
    )
    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "read_chunk_cycle":
        batch = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        read_chunk_cycle(batch=batch)
    elif len(sys.argv) >= 2 and sys.argv[1] == "reading_stats":
        print_reading_stats()
    elif len(sys.argv) >= 2 and sys.argv[1] == "study":
        batch = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        knowledge_study_cycle(batch=batch)
    elif len(sys.argv) >= 4 and sys.argv[1] == "expert":
        topic = sys.argv[2]
        track = sys.argv[3]
        print(expert_analysis(topic, track))
    else:
        print("Usage: python3 agent_knowledge.py read_chunk_cycle [batch]")
        print("       python3 agent_knowledge.py reading_stats")
        print("       python3 agent_knowledge.py study [batch]")
        print('       python3 agent_knowledge.py expert "topic" TRACK')
