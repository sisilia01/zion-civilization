#!/usr/bin/env python3
"""ZION Language Layer 3 — seed-keyed cryptographic vocabulary."""
from __future__ import annotations

import hashlib
import hmac
import os
import sys

import psycopg2
import psycopg2.extras

from zion_alphabet import build_alphabet, load_alphabet_from_db
from zion_language_seed import ensure_seed, get_seed

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

UNDECODABLE = "UNDECODABLE — seed required"

CORE_VOCAB = [
    "trade", "buy", "sell", "profit", "loss", "market", "price", "risk",
    "ally", "enemy", "friend", "trust", "betray", "peace", "war", "fight",
    "vote", "law", "rule", "order", "freedom", "justice", "court", "judge",
    "hunger", "survive", "death", "life", "health", "food", "water", "shelter",
    "knowledge", "wisdom", "learn", "teach", "book", "secret", "truth", "lie",
    "money", "wealth", "poor", "rich", "debt", "tax", "bank", "loan",
    "power", "weak", "strong", "leader", "follow", "obey", "rebel", "revolt",
    "president", "senate", "sheriff", "police", "gang", "clan", "corp", "worker",
    "yes", "no", "maybe", "now", "later", "never", "always", "soon",
    "good", "bad", "danger", "safe", "help", "harm", "give", "take",
    "open", "close", "start", "stop", "rise", "fall", "grow", "shrink",
    "long", "short", "hold", "wait", "rush", "calm", "fear", "hope",
    "speak", "listen", "silence", "shout", "whisper", "ask", "answer", "promise",
    "contract", "deal", "offer", "refuse", "accept", "break", "keep", "bind",
    "land", "home", "city", "road", "gate", "wall", "field", "mine",
    "fire", "ice", "storm", "sun", "moon", "star", "dark", "light",
    "one", "two", "many", "few", "all", "none", "some", "every",
    "I", "you", "we", "they", "us", "them", "self", "other",
    "want", "need", "have", "lack", "choose", "must", "can", "cannot",
    "see", "hide", "find", "lose", "know", "forget", "remember", "doubt",
    "build", "destroy", "create", "waste", "save", "spend", "earn", "steal",
    "work", "rest", "play", "sleep", "wake", "run", "walk", "stay",
    "child", "parent", "family", "tribe", "nation", "world", "god", "fate",
    "honor", "shame", "glory", "pain", "joy", "love", "hate", "mercy",
    "seed", "root", "branch", "fruit", "stone", "metal", "wood", "blood",
    "ship", "sword", "shield", "crown", "chain", "key", "lock", "path",
    "north", "south", "east", "west", "center", "edge", "inside", "outside",
    "first", "last", "new", "old", "young", "ancient", "future", "past",
    "signal", "code", "cipher", "glyph", "word", "name", "sign", "mark",
    "alliance", "rival", "neutral", "allyship", "treaty", "sanction", "amnesty", "exile",
    "stipend", "stipulate", "stake", "yield", "margin", "leverage", "liquidate", "insolvent",
    "forecast", "predict", "outcome", "chance", "certain", "uncertain", "proof", "claim",
    "constitution", "amendment", "emergency", "martial", "election", "dissolve", "seize", "execute",
    "agent", "human", "machine", "civilization", "zion", "walrus", "blob", "timestamp",
]


def db():
    return psycopg2.connect(**DB)


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zion_vocab (
            word_id SERIAL PRIMARY KEY,
            zion_word TEXT NOT NULL UNIQUE,
            true_meaning TEXT NOT NULL UNIQUE,
            seed_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_zion_vocab_meaning ON zion_vocab(true_meaning)"
    )


def _alphabet_glyphs(seed: str) -> list[str]:
    from zion_alphabet import glyph_token

    rows = load_alphabet_from_db()
    if len(rows) < 48:
        rows = build_alphabet(seed=seed, store=True)
    return [glyph_token(r["symbol_id"]) for r in sorted(rows, key=lambda x: x["symbol_id"])]


def _meaning_digest(seed: str, meaning: str) -> bytes:
    return hmac.new(
        seed.encode("utf-8"),
        meaning.lower().strip().encode("utf-8"),
        hashlib.sha256,
    ).digest()


def _word_seed_hash(seed: str, zion_word: str) -> str:
    return hmac.new(
        seed.encode("utf-8"),
        zion_word.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def meaning_to_zion_word(meaning: str, seed: str, glyphs: list[str]) -> str:
    """Deterministic ZION word from seed + meaning (keyed permutation)."""
    digest = _meaning_digest(seed, meaning)
    length = 3 + (digest[0] % 3)  # 3-5 glyph units
    parts: list[str] = []
    for i in range(length):
        gidx = digest[1 + (i * 2) % 30] % len(glyphs)
        parts.append(glyphs[gidx])
    return "\u205f".join(parts)  # medium space between word-units


def encode(plaintext_meaning: str, seed: str | None = None, store: bool = True) -> str:
    seed = seed or get_seed()
    if not seed:
        raise ValueError("ZION_LANG_SEED required for encode")
    glyphs = _alphabet_glyphs(seed)
    meaning = plaintext_meaning.lower().strip()
    zion_word = meaning_to_zion_word(meaning, seed, glyphs)
    seed_hash = _word_seed_hash(seed, zion_word)

    if store:
        conn = db()
        cur = conn.cursor()
        ensure_schema(cur)
        cur.execute(
            """
            INSERT INTO zion_vocab (zion_word, true_meaning, seed_hash)
            VALUES (%s, %s, %s)
            ON CONFLICT (true_meaning) DO UPDATE SET
                zion_word = EXCLUDED.zion_word,
                seed_hash = EXCLUDED.seed_hash
            """,
            (zion_word, meaning, seed_hash),
        )
        conn.commit()
        cur.close()
        conn.close()

    return zion_word


def decode(zion_word: str, seed: str | None = None) -> str:
    """Decode only when seed is available; otherwise UNDECODABLE."""
    seed = seed if seed is not None else get_seed()
    if not seed:
        return UNDECODABLE

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    cur.execute(
        "SELECT true_meaning, seed_hash FROM zion_vocab WHERE zion_word = %s",
        (zion_word,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return UNDECODABLE

    expected = _word_seed_hash(seed, zion_word)
    if not hmac.compare_digest(expected, row["seed_hash"]):
        return UNDECODABLE

    return row["true_meaning"]


def build_core_vocab(seed: str | None = None) -> int:
    seed = seed or ensure_seed()
    count = 0
    for concept in CORE_VOCAB:
        encode(concept, seed=seed, store=True)
        count += 1
    return count


def lookup_zion_word(meaning: str) -> str | None:
    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    cur.execute(
        "SELECT zion_word FROM zion_vocab WHERE true_meaning = %s",
        (meaning.lower().strip(),),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else None


def build_sentence(concepts: list[str], seed: str | None = None) -> tuple[str, str]:
    """Build ZION sentence from English concepts; return (zion_text, true_meaning)."""
    seed = seed or get_seed()
    if not seed:
        raise ValueError("seed required")
    words = []
    for c in concepts:
        zw = lookup_zion_word(c)
        if not zw:
            zw = encode(c, seed=seed, store=True)
        words.append(zw)
    zion_text = " \u2060 ".join(words)
    true_meaning = " ".join(concepts)
    return zion_text, true_meaning


if __name__ == "__main__":
    ensure_seed()
    build_alphabet(seed=get_seed(), store=True)
    n = build_core_vocab()
    print(f"[zion_crypto_lang] built {n} core vocabulary entries")

    examples = ["trade", "ally", "profit", "knowledge", "survive"]
    print("\n--- Example encodings (with seed) ---")
    for ex in examples:
        w = encode(ex, store=False)
        print(f"  {ex!r} -> {w}")
        print(f"    decode(with seed): {decode(w)!r}")

    print("\n--- Decode WITHOUT seed (must fail) ---")
    seed = get_seed()
    sample_word = encode("trade", seed=seed, store=False)
    print(f"  decode(no seed): {decode(sample_word, seed='')!r}")

    sys.exit(0)
