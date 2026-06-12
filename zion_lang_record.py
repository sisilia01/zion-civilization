#!/usr/bin/env python3
"""ZION Language — Walrus authorship record (public manifest, no seed)."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
import requests

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

WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space"
WALRUS_EPOCHS = 53


def db():
    return psycopg2.connect(**DB)


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zion_lang_records (
            id SERIAL PRIMARY KEY,
            blob_id VARCHAR(120) NOT NULL,
            manifest_type VARCHAR(50) DEFAULT 'zion_language',
            recorded_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def _upload_manifest(payload: bytes) -> dict | None:
    try:
        resp = requests.put(
            f"{WALRUS_PUBLISHER}/v1/blobs?epochs={WALRUS_EPOCHS}",
            data=payload,
            headers={"Content-Type": "application/json"},
            timeout=90,
        )
        if resp.status_code not in (200, 201):
            print(f"Walrus HTTP {resp.status_code}: {resp.text[:300]}")
            return None
        result = resp.json()
        blob_info = result.get("newlyCreated", result.get("alreadyCertified", {}))
        blob_obj = blob_info.get("blobObject", blob_info) if isinstance(blob_info, dict) else {}
        blob_id = blob_obj.get("blobId") or result.get("blobId")
        if not blob_id:
            return None
        return {"blob_id": blob_id, "sui_object_id": blob_obj.get("id", "")}
    except Exception as e:
        print(f"Walrus upload error: {e}")
        return None


def build_public_manifest() -> dict:
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT symbol_id, svg_path, phoneme, stroke_signature
        FROM zion_alphabet ORDER BY symbol_id
        """
    )
    alphabet = [
        {
            "symbol_id": r["symbol_id"],
            "phoneme": r["phoneme"],
            "stroke_signature": r.get("stroke_signature"),
            "svg_preview": (r.get("svg_path") or "")[:120],
        }
        for r in cur.fetchall()
    ]

    cur.execute(
        """
        SELECT word_id, zion_word, seed_hash, created_at
        FROM zion_vocab ORDER BY word_id
        """
    )
    vocab_public = [
        {
            "word_id": r["word_id"],
            "zion_word": r["zion_word"],
            "seed_hash": r["seed_hash"],
            "created_at": str(r["created_at"]),
        }
        for r in cur.fetchall()
    ]

    cur.execute(
        """
        SELECT id, from_agent, to_agent, zion_text, created_at
        FROM agent_messages_zion
        ORDER BY created_at DESC LIMIT 100
        """
    )
    messages = [
        {
            "id": r["id"],
            "from_agent": r["from_agent"],
            "to_agent": r["to_agent"],
            "zion_text": r["zion_text"],
            "created_at": str(r["created_at"]),
        }
        for r in cur.fetchall()
    ]

    cur.close()
    conn.close()

    return {
        "manifest_type": "zion_language_v1",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "note": "Public manifest — no seed, no true_meanings. Authorship proven via Walrus timestamp.",
        "alphabet": alphabet,
        "vocabulary_public": vocab_public,
        "agent_messages_public": messages,
        "symbol_count": len(alphabet),
        "vocab_count": len(vocab_public),
        "message_count": len(messages),
    }


def record_to_walrus() -> str | None:
    manifest = build_public_manifest()
    payload = json.dumps(manifest, ensure_ascii=False, default=str).encode("utf-8")
    result = _upload_manifest(payload)
    if not result:
        print("[zion_lang_record] Walrus upload failed")
        return None

    blob_id = result["blob_id"]
    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    cur.execute(
        """
        INSERT INTO zion_lang_records (blob_id, manifest_type, recorded_at)
        VALUES (%s, %s, NOW())
        """,
        (blob_id, manifest.get("manifest_type", "zion_language")),
    )
    conn.commit()
    cur.close()
    conn.close()

    print(f"[zion_lang_record] recorded blob_id={blob_id} (epochs={WALRUS_EPOCHS})")
    print(f"  alphabet={manifest['symbol_count']} vocab={manifest['vocab_count']} msgs={manifest['message_count']}")
    return blob_id


if __name__ == "__main__":
    blob = record_to_walrus()
    sys.exit(0 if blob else 1)
