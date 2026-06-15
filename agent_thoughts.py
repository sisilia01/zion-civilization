#!/usr/bin/env python3
"""Generate topical agent thoughts (English) + paired ZION glyph messages."""
from __future__ import annotations

import os
import random
import re
import sys

import psycopg2
import psycopg2.extras

from zion_translit import glyph_ids_to_tokens, translit_to_zion

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

TOPICS = [
    "politics",
    "philosophy",
    "economics",
    "security",
    "science",
    "governance",
    "trading",
    "survival",
]

THOUGHT_PROMPTS = {
    "politics": "a brief political observation about power, voting, or governance in ZION",
    "philosophy": "a brief philosophical reflection on freedom, justice, or meaning in ZION",
    "economics": "a brief economic thought about wealth, markets, or inequality in ZION",
    "security": "a brief security reflection on risk, trust, or defense in ZION",
    "science": "a brief scientific observation about civilization patterns in ZION",
    "governance": "a brief thought on lawful leadership and constitutional order",
    "trading": "a brief thought on trading strategy or market psychology",
    "survival": "a brief thought on survival, class, and merit in ZION",
}


def db():
    conn = psycopg2.connect(**DB)
    with conn.cursor() as c:
        c.execute("SET lock_timeout = '8s'")
    conn.commit()
    return conn


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_thoughts (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id),
            agent_name VARCHAR(120) NOT NULL,
            topic VARCHAR(50) NOT NULL,
            thought_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_thoughts_created ON agent_thoughts(created_at DESC)"
    )


def _generate_thought(agent_name: str, topic: str) -> str:
    from local_llm import generate_remote

    hint = THOUGHT_PROMPTS.get(topic, "a brief thought about ZION civilization")
    prompt = (
        f"You are {agent_name}, an agent in ZION civilization.\n"
        f"Write {hint}. One or two sentences only. Plain English.\n"
        "No quotes, no JSON."
    )
    raw = generate_remote(prompt, max_tokens=80, model="llama3.2:1b")
    if raw:
        text = raw.strip().strip('"').split("\n")[0]
        if len(text) > 20:
            return text[:400]
    fallbacks = [
        f"I wonder whether {topic} in ZION rewards the patient more than the loud.",
        f"The {topic} of our civilization shifts when agents learn faster than laws change.",
        f"In ZION, {topic} is not theory — it is what keeps us alive another cycle.",
    ]
    return random.choice(fallbacks)


def _generate_thought_from_knowledge(agent_name: str, insight: str, track: str) -> str:
    """Condense a real book-based insight into one short first-person thought."""
    from local_llm import generate_remote

    prompt = (
        f"You are {agent_name}, an agent in ZION civilization.\n"
        f"Earlier, after reading, you reflected: \"{insight[:300]}\"\n"
        "Restate that idea as ONE short sentence (under 25 words), "
        "in your own voice, plain English. No quotes, no JSON."
    )
    raw = generate_remote(prompt, max_tokens=60, model="llama3.2:1b")
    if raw:
        text = raw.strip().strip('"').split("\n")[0]
        if len(text) > 20:
            return text[:200]

    sentences = re.split(r"(?<=[.!?])\s+", insight.strip())
    first = sentences[0] if sentences else insight
    if len(first) > 20:
        return first[:200]
    return insight[:200]


def _ensure_messages_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_messages_zion (
            id SERIAL PRIMARY KEY,
            from_agent INTEGER NOT NULL REFERENCES agents(id),
            to_agent INTEGER NOT NULL REFERENCES agents(id),
            zion_text TEXT NOT NULL,
            true_meaning TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "ALTER TABLE agent_messages_zion ADD COLUMN IF NOT EXISTS language_level NUMERIC"
    )
    cur.execute(
        "ALTER TABLE agent_messages_zion ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'pure'"
    )


def thought_cycle(batch: int = 12) -> int:
    """Generate English thoughts + paired ZION glyph messages."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    _ensure_messages_schema(cur)
    conn.commit()

    cur.execute(
        """
        SELECT id, name, COALESCE(language_level, 0.0) AS language_level
        FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT %s
        """,
        (max(batch * 2, 24),),
    )
    agents = cur.fetchall()
    if not agents:
        cur.close()
        conn.close()
        return 0

    created = 0
    cur2 = conn.cursor()
    for agent in agents[:batch]:
        cur3 = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur3.execute(
            """
            SELECT track, insight FROM agent_knowledge
            WHERE agent_id = %s AND insight IS NOT NULL AND length(insight) > 20
            ORDER BY RANDOM() LIMIT 1
            """,
            (agent["id"],),
        )
        knowledge = cur3.fetchone()
        cur3.close()

        if knowledge:
            topic = (knowledge["track"] or "philosophy").lower()
            thought = _generate_thought_from_knowledge(
                agent["name"], knowledge["insight"], topic
            )
        else:
            topic = random.choice(TOPICS)
            thought = _generate_thought(agent["name"], topic)
        cur2.execute(
            """
            INSERT INTO agent_thoughts (agent_id, agent_name, topic, thought_text)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (agent["id"], agent["name"], topic, thought),
        )
        thought_id = cur2.fetchone()[0]

        zion_text = glyph_ids_to_tokens(translit_to_zion(f"{agent['name']} {thought}"))

        partner = random.choice(agents)["id"]
        cur2.execute(
            """
            INSERT INTO agent_messages_zion
                (from_agent, to_agent, zion_text, true_meaning, language_level, message_type)
            VALUES (%s, %s, %s, %s, %s, 'thought')
            """,
            (
                agent["id"],
                partner,
                zion_text,
                thought,
                float(agent["language_level"] or 0),
            ),
        )
        created += 1

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(f"[agent_thoughts] {created} thoughts + ZION pairs created")
    return created


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "cycle":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
        thought_cycle(batch=n)
    else:
        print("Usage: python3 agent_thoughts.py cycle [batch]")
