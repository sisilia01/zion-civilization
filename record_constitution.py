#!/usr/bin/env python3
"""
ZION Constitution Genesis Recorder
Records the Genesis Constitution v1.0 immutably on Walrus + Sui.
This is the origin point of the civilization's constitutional lineage (Article VII).
"""
import os
import sys
import json
import hashlib
import psycopg2
from datetime import datetime, timezone

# Reuse the proven Walrus storage mechanism
from walrus import store_blob, WALRUS_AGGREGATOR, conn as walrus_conn, cur as walrus_cur

CONSTITUTION_PATH = os.path.expanduser("~/zion_backend/constitution/CONSTITUTION_ZION_v1.0.md")

def ensure_constitution_table():
    walrus_cur.execute("""
        CREATE TABLE IF NOT EXISTS constitution_versions (
            id SERIAL PRIMARY KEY,
            version VARCHAR(20),
            sha256 VARCHAR(64) UNIQUE,
            blob_id VARCHAR(100),
            sui_object_id VARCHAR(100),
            prev_sha256 VARCHAR(64),
            recorded_at TIMESTAMP DEFAULT NOW()
        )
    """)
    walrus_conn.commit()

def record_genesis():
    # 1. Read the Constitution
    with open(CONSTITUTION_PATH, "r", encoding="utf-8") as f:
        text = f.read()

    # 2. Compute SHA-256 fingerprint
    sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()
    print(f"Constitution SHA-256: {sha256}")

    # 3. Check if already recorded
    walrus_cur.execute("SELECT blob_id, sui_object_id FROM constitution_versions WHERE sha256=%s", (sha256,))
    existing = walrus_cur.fetchone()
    if existing:
        print(f"Already recorded. Blob: {existing['blob_id']}")
        print(f"View: {WALRUS_AGGREGATOR}/v1/blobs/{existing['blob_id']}")
        return

    # 4. Build the Genesis package
    genesis_package = {
        "type": "constitution_genesis",
        "project": "ZION Civilization",
        "title": "The Constitution of ZION",
        "version": "1.0",
        "label": "Genesis Constitution",
        "sha256": sha256,
        "prev_version": None,
        "prev_sha256": None,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "network": "sui_testnet",
        "description": "Founding charter of the autonomous AI civilization ZION. Origin point of the constitutional lineage. Article VII establishes the amendment process by which this document may evolve.",
        "constitution_text": text,
    }

    # 5. Store on Walrus (+ Sui object) using the proven mechanism
    print("Storing on Walrus...")
    result = store_blob(genesis_package, blob_type="constitution_genesis")
    if not result:
        print("ERROR: Walrus store failed.")
        return

    blob_id = result["blob_id"]
    sui_obj = result["sui_object_id"]

    # 6. Record in the constitution lineage table (start of the evolutionary tree)
    walrus_cur.execute("""
        INSERT INTO constitution_versions (version, sha256, blob_id, sui_object_id, prev_sha256)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (sha256) DO NOTHING
    """, ("1.0", sha256, blob_id, sui_obj, None))
    walrus_conn.commit()

    # 7. Report
    print("\n" + "=" * 60)
    print("  GENESIS CONSTITUTION RECORDED ON-CHAIN")
    print("=" * 60)
    print(f"  Version:      1.0 (Genesis)")
    print(f"  SHA-256:      {sha256}")
    print(f"  Walrus Blob:  {blob_id}")
    print(f"  Sui Object:   {sui_obj}")
    print(f"  View on-chain: {WALRUS_AGGREGATOR}/v1/blobs/{blob_id}")
    print("=" * 60)
    print("\n  This is the immutable origin of ZION's constitutional lineage.")
    print("  Every future amendment will link back to this Genesis hash.")

if __name__ == "__main__":
    ensure_constitution_table()
    record_genesis()
