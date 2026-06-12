#!/usr/bin/env python3
"""ZION Language Layer 2 — agents speak encrypted ZION to each other."""
from __future__ import annotations

import os
import random
import re
import sys

import psycopg2
import psycopg2.extras

from zion_crypto_lang import build_sentence, decode, encode, lookup_zion_word
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

INTENT_TEMPLATES = [
    ("propose trade alliance", ["ally", "trade", "offer", "trust"]),
    ("warn of market risk", ["danger", "market", "risk", "fear"]),
    ("request survival stipend", ["need", "money", "survive", "help"]),
    ("share knowledge secretly", ["knowledge", "secret", "teach", "trust"]),
    ("declare rivalry", ["enemy", "fight", "rival", "war"]),
    ("vote for new law", ["vote", "law", "yes", "order"]),
    ("negotiate peace treaty", ["peace", "treaty", "ally", "trust"]),
    ("predict price rise", ["forecast", "rise", "profit", "market"]),
    ("report police danger", ["police", "danger", "hide", "run"]),
    ("offer corporate deal", ["corp", "deal", "contract", "profit"]),
    ("hunger plea", ["hunger", "food", "need", "help"]),
    ("constitutional oath", ["constitution", "law", "obey", "order"]),
    ("betrayal warning", ["betray", "enemy", "danger", "hide"]),
    ("long position signal", ["long", "trade", "profit", "rise"]),
    ("short the market", ["short", "sell", "fall", "risk"]),
]

TOPIC_POOLS = {
    "trading": ["trade", "buy", "sell", "profit", "loss", "long", "short", "market"],
    "survival": ["survive", "hunger", "food", "death", "life", "help", "need"],
    "governance": ["vote", "law", "president", "senate", "order", "justice"],
}


def db():
    return psycopg2.connect(**DB)


def ensure_schema(cur) -> None:
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
        "CREATE INDEX IF NOT EXISTS idx_agent_messages_zion_from ON agent_messages_zion(from_agent)"
    )


def _ollama_intent_variation(base_intent: str) -> str:
    """Optional Ollama variation of conversational intent (free/local)."""
    try:
        from local_llm import generate_local

        prompt = (
            f"Rewrite this agent intent in 4-8 English words (same meaning): {base_intent}\n"
            "Reply with only the rewritten intent, no quotes."
        )
        variant = generate_local(prompt, max_tokens=30)
        if variant and len(variant) < 120:
            return variant.strip()
    except Exception:
        pass
    return base_intent


def _intent_to_concepts(intent: str) -> list[str]:
    intent_l = intent.lower()
    for label, concepts in INTENT_TEMPLATES:
        if label in intent_l:
            return concepts

    concepts: list[str] = []
    for pool in TOPIC_POOLS.values():
        for word in pool:
            if word in intent_l and word not in concepts:
                concepts.append(word)
    if not concepts:
        for word in re.findall(r"[a-z]+", intent_l):
            if lookup_zion_word(word):
                concepts.append(word)
            if len(concepts) >= 4:
                break
    if not concepts:
        concepts = random.choice(list(TOPIC_POOLS.values()))[:4]
    return concepts[:6]


def agent_speaks(from_id: int, to_id: int, intent: str) -> dict:
    """Map English intent to ZION sentence; store public + private meaning."""
    ensure_seed()
    intent = _ollama_intent_variation(intent) if random.random() < 0.25 else intent
    concepts = _intent_to_concepts(intent)
    zion_text, true_meaning = build_sentence(concepts)

    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    cur.execute(
        """
        INSERT INTO agent_messages_zion (from_agent, to_agent, zion_text, true_meaning)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (from_id, to_id, zion_text, true_meaning),
    )
    msg_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    return {
        "id": msg_id,
        "from_agent": from_id,
        "to_agent": to_id,
        "zion_text": zion_text,
        "true_meaning": true_meaning,
        "intent": intent,
    }


def conversation_cycle(batch: int = 20) -> list[dict]:
    """Random alive agent pairs exchange ZION messages."""
    ensure_seed()
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT %s
        """,
        (max(batch * 2, 40),),
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    if len(ids) < 2:
        print("[zion_speech] not enough alive agents")
        return []

    messages: list[dict] = []
    for _ in range(batch):
        a, b = random.sample(ids, 2)
        label, concepts = random.choice(INTENT_TEMPLATES)
        msg = agent_speaks(a, b, label)
        messages.append(msg)

    print(f"[zion_speech] {len(messages)} ZION exchanges recorded")
    return messages


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "cycle":
        msgs = conversation_cycle(batch=20)
        print("\n--- Sample ZION agent messages (3) ---")
        for m in msgs[:3]:
            print(f"\n  Agent {m['from_agent']} -> Agent {m['to_agent']}")
            print(f"  ZION (public): {m['zion_text']}")
            print(f"  True meaning (seed-only): {m['true_meaning']}")
    else:
        print("Usage: python3 zion_speech.py cycle")
