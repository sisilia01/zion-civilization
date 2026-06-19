#!/usr/bin/env python3
"""ZION Language evolution — generational adoption and vocabulary growth."""
from __future__ import annotations

import os
import random
import re
import sys

import psycopg2
import psycopg2.extras

from zion_crypto_lang import CORE_VOCAB, encode, lookup_zion_word
from zion_language_seed import ensure_seed

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

STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "will", "would", "should", "could", "my", "your", "our", "their", "this",
    "that", "it", "he", "she", "they", "we", "you", "i", "me", "him", "her",
}

NEEDED_CONCEPTS = [
    "negotiate", "surrender", "victory", "defeat", "siege", "retreat", "advance",
    "harvest", "famine", "plague", "medicine", "heal", "wound", "armor", "weapon",
    "oracle", "prophecy", "ritual", "prayer", "sacred", "profane", "temple", "altar",
    "merchant", "caravan", "harbor", "fortress", "village", "capital", "border",
    "spy", "ambush", "sabotage", "sabotage", "recon", "scout", "guard", "patrol",
    "oath", "vow", "pardon", "punish", "prison", "escape", "capture", "ransom",
    "dynasty", "heir", "succession", "council", "assembly", "debate", "decree",
    "innovation", "invention", "craft", "forge", "harvest", "sow", "reap", "store",
    "algorithm", "network", "protocol", "token", "wallet", "ledger", "audit", "mint",
    "calm", "panic", "greed", "patience", "courage", "coward", "pride", "humility",
    "ancestor", "descendant", "generation", "lineage", "heritage", "tradition", "custom",
    "dialect", "accent", "phrase", "grammar", "syntax", "symbol", "script", "alphabet",
]

MIXED_SENTENCES = [
    "I will trade my profit for your knowledge",
    "We need allies to survive the market danger",
    "The senate must vote on the new law today",
    "Our clan seeks peace but prepares for war",
    "Share secret knowledge before the enemy strikes",
    "I want to buy food and sell my wealth",
    "Police patrol the road while gangs recruit members",
    "Hold your position and wait for profit rise",
]


def db():
    return psycopg2.connect(**DB)


def ensure_agent_language_column(cur) -> None:
    cur.execute(
        """
        ALTER TABLE agents ADD COLUMN IF NOT EXISTS language_level NUMERIC DEFAULT 0.0
        """
    )


def ensure_messages_schema(cur) -> None:
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
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zion_vocab_coins (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            true_meaning TEXT NOT NULL,
            zion_word TEXT NOT NULL,
            coined_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def set_language_level(agent_id: int, level: float, cur=None) -> None:
    level = max(0.0, min(1.0, float(level)))
    owns = cur is None
    conn = None
    if owns:
        conn = db()
        cur = conn.cursor()
        ensure_agent_language_column(cur)
    cur.execute(
        "UPDATE agents SET language_level = %s WHERE id = %s",
        (level, agent_id),
    )
    if owns:
        conn.commit()
        cur.close()
        conn.close()


def get_language_level(agent_id: int, cur=None) -> float:
    owns = cur is None
    conn = None
    if owns:
        conn = db()
        cur = conn.cursor()
        ensure_agent_language_column(cur)
    cur.execute(
        "SELECT COALESCE(language_level, 0.0) FROM agents WHERE id = %s",
        (agent_id,),
    )
    row = cur.fetchone()
    level = float(row[0] if row else 0.0)
    if owns:
        cur.close()
        conn.close()
    return level


def civilization_average_language_level(cur=None) -> float:
    owns = cur is None
    conn = None
    if owns:
        conn = db()
        cur = conn.cursor()
        ensure_agent_language_column(cur)
    cur.execute(
        "SELECT COALESCE(AVG(language_level), 0.0) FROM agents WHERE is_alive = true"
    )
    avg = float(cur.fetchone()[0] or 0.0)
    if owns:
        cur.close()
        conn.close()
    return avg


def inherit_language_level(cur, parent_id: int | None) -> float:
    """Children speak slightly more ZION than parents."""
    ensure_agent_language_column(cur)
    if parent_id:
        cur.execute(
            "SELECT COALESCE(language_level, 0.0) FROM agents WHERE id = %s",
            (parent_id,),
        )
        row = cur.fetchone()
        parent_level = float((row[0] if row else 0.0) or 0.0)
        return min(1.0, parent_level + 0.05)
    avg = civilization_average_language_level(cur)
    return min(1.0, avg + 0.02)


def init_founder_language_levels(cur) -> int:
    """Existing agents without level: founders stay 0.0–0.1."""
    ensure_agent_language_column(cur)
    cur.execute(
        """
        UPDATE agents
        SET language_level = ROUND((RANDOM() * 0.1)::numeric, 3)
        WHERE is_alive = true AND COALESCE(language_level, 0) = 0
        """
    )
    return cur.rowcount


def mixed_speech(agent_id: int, english_sentence: str) -> dict:
    """Substitute a fraction of content words with ZION vocab equivalents."""
    ensure_seed()
    level = get_language_level(agent_id)
    words = re.findall(r"[A-Za-z']+|[.,!?;]", english_sentence)
    content_indices = [
        i for i, w in enumerate(words)
        if re.match(r"[A-Za-z']+", w) and w.lower() not in STOP_WORDS
    ]
    if not content_indices:
        return {
            "agent_id": agent_id,
            "language_level": level,
            "english": english_sentence,
            "mixed": english_sentence,
            "zion_tokens": [],
        }

    n_replace = max(0, int(round(len(content_indices) * level)))
    if n_replace == 0:
        return {
            "agent_id": agent_id,
            "language_level": level,
            "english": english_sentence,
            "mixed": english_sentence,
            "zion_tokens": [],
        }

    chosen = set(random.sample(content_indices, min(n_replace, len(content_indices))))
    zion_tokens: list[str] = []
    out: list[str] = []

    for i, w in enumerate(words):
        if i in chosen:
            key = w.lower().strip("'")
            zw = lookup_zion_word(key)
            if zw:
                out.append(f"[ZION:{key}]")
                zion_tokens.append(zw)
            else:
                out.append(w)
        else:
            out.append(w)

    mixed = " ".join(out)
    mixed = re.sub(r"\s+([.,!?;])", r"\1", mixed)

    return {
        "agent_id": agent_id,
        "language_level": level,
        "english": english_sentence,
        "mixed": mixed,
        "zion_text": " \u205f ".join(zion_tokens) if zion_tokens else mixed,
        "zion_tokens": zion_tokens,
    }


def grow_vocabulary(agent_id: int | None = None, count: int = 1) -> list[dict]:
    """Coin new words for concepts not yet in vocab."""
    ensure_seed()
    conn = db()
    cur = conn.cursor()
    ensure_messages_schema(cur)
    cur.execute("SELECT true_meaning FROM zion_vocab")
    existing = {r[0].lower() for r in cur.fetchall()}
    candidates = [c for c in NEEDED_CONCEPTS if c.lower() not in existing]
    candidates += [c for c in CORE_VOCAB if c.lower() not in existing]
    random.shuffle(candidates)

    coined: list[dict] = []
    for concept in candidates[:count]:
        zw = encode(concept, store=True)
        coiner = agent_id
        if coiner is None:
            cur.execute(
                "SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT 1"
            )
            row = cur.fetchone()
            coiner = row[0] if row else None
        if coiner:
            cur.execute(
                """
                INSERT INTO zion_vocab_coins (agent_id, true_meaning, zion_word)
                VALUES (%s, %s, %s)
                """,
                (coiner, concept.lower(), zw),
            )
        coined.append({"agent_id": coiner, "concept": concept, "zion_word": zw})
        if len(coined) >= count:
            break

    conn.commit()
    cur.close()
    conn.close()
    return coined


def store_mixed_message(from_id: int, to_id: int, result: dict) -> int:
    conn = db()
    cur = conn.cursor()
    ensure_messages_schema(cur)
    cur.execute(
        """
        INSERT INTO agent_messages_zion
            (from_agent, to_agent, zion_text, true_meaning, language_level, message_type)
        VALUES (%s, %s, %s, %s, %s, 'mixed')
        RETURNING id
        """,
        (
            from_id,
            to_id,
            result["mixed"],
            result["english"],
            result["language_level"],
        ),
    )
    msg_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return msg_id


def nudge_successful_speakers(cur, batch_limit: int = 5) -> int:
    """Agents who used ZION words recently gain a small language_level bump."""
    cur.execute(
        """
        SELECT from_agent FROM agent_messages_zion
        WHERE message_type = 'mixed' AND language_level > 0
          AND created_at > NOW() - INTERVAL '2 hours'
        GROUP BY from_agent
        ORDER BY RANDOM() LIMIT %s
        """,
        (batch_limit,),
    )
    nudged = 0
    for (aid,) in cur.fetchall():
        cur.execute(
            """
            UPDATE agents SET language_level = LEAST(1.0, COALESCE(language_level, 0) + 0.01)
            WHERE id = %s
            """,
            (aid,),
        )
        nudged += cur.rowcount
    return nudged


def conversation_mixed_batch(batch: int = 20) -> list[dict]:
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_agent_language_column(cur)
    conn.commit()
    cur.execute(
        """
        SELECT id, COALESCE(language_level, 0.0) AS language_level
        FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT %s
        """,
        (max(batch * 2, 40),),
    )
    agents = cur.fetchall()
    cur.close()
    conn.close()

    if len(agents) < 2:
        return []

    results: list[dict] = []
    for _ in range(batch):
        speaker, listener = random.sample(agents, 2)
        sentence = random.choice(MIXED_SENTENCES)
        # Demo spread: occasionally boost level for variety
        sid = speaker["id"]
        level = float(speaker["language_level"] or 0.0)
        mixed = mixed_speech(sid, sentence)
        mixed["to_agent"] = listener["id"]
        store_mixed_message(sid, listener["id"], mixed)
        results.append(mixed)

    return results


def cycle() -> None:
    ensure_seed()
    conn = db()
    cur = conn.cursor()
    ensure_agent_language_column(cur)
    init_founder_language_levels(cur)
    conn.commit()

    coined = grow_vocabulary(count=random.randint(1, 3))
    messages = conversation_mixed_batch(batch=20)
    nudged = nudge_successful_speakers(cur, batch_limit=5)
    conn.commit()
    cur.close()
    conn.close()

    print(f"[zion_evolution] mixed messages: {len(messages)} | coined: {len(coined)} | nudged: {nudged}")
    for c in coined:
        print(f"  coined '{c['concept']}' by agent {c['agent_id']} -> {c['zion_word'][:40]}...")


def demo_mixed_at_levels() -> None:
    """Show mixed speech at representative language levels."""
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM agents WHERE is_alive = true LIMIT 1")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return
    aid = row[0]
    sentence = "I will trade my profit for your knowledge"
    print("\n--- Mixed speech examples (same sentence, different levels) ---")
    for level in (0.2, 0.6, 0.9):
        set_language_level(aid, level)
        result = mixed_speech(aid, sentence)
        print(f"\n  language_level={level:.1f}")
        print(f"  English: {result['english']}")
        print(f"  Mixed:   {result['mixed']}")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "cycle":
        cycle()
        demo_mixed_at_levels()
    else:
        print("Usage: python3 zion_evolution.py cycle")
