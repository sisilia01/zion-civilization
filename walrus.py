#!/usr/bin/env python3
"""ZION Walrus Integration — decentralized storage on Walrus testnet."""
import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
import psycopg2
import psycopg2.extras
import requests
import json
from datetime import datetime, timezone

WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space"
WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space"
WALRUS_EPOCHS_REQUESTED = 200  # Target max retention (~200 days when network allows)
WALRUS_EPOCHS_FALLBACK = 53    # Current Walrus testnet cap (EInvalidEpochsAhead above this)

conn = psycopg2.connect(
    host="localhost", database="zion_db",
    user="zion_user", password=os.environ.get("DB_PASSWORD", "")
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def ensure_table():
    cur.execute("""
        CREATE TABLE IF NOT EXISTS walrus_blobs (
            id SERIAL PRIMARY KEY,
            blob_id VARCHAR(100) UNIQUE,
            blob_type VARCHAR(50),
            content_summary TEXT,
            sui_object_id VARCHAR(100),
            epoch INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()

def _parse_walrus_response(resp: requests.Response) -> dict | None:
    if resp.status_code not in (200, 201):
        print(f"Walrus HTTP {resp.status_code}: {resp.text[:300]}")
        return None
    try:
        result = resp.json()
    except Exception:
        print(f"Walrus invalid JSON: {resp.text[:300]}")
        return None
    blob_info = result.get("newlyCreated", result.get("alreadyCertified", {}))
    blob_obj = blob_info.get("blobObject", blob_info) if isinstance(blob_info, dict) else {}
    blob_id = (
        blob_obj.get("blobId")
        or result.get("blobId")
        or result.get("blob_id")
    )
    sui_obj_id = blob_obj.get("id", "")
    if not blob_id:
        return None
    return {
        "blob_id": blob_id,
        "sui_object_id": sui_obj_id,
        "registered_epoch": blob_obj.get("registeredEpoch", 0),
    }

def store_bytes(
    payload: bytes,
    blob_type: str = "events",
    content_type: str = "application/json",
    summary: str = "",
) -> dict | None:
    """Store raw bytes as a Walrus blob with maximum retention epochs."""
    try:
        parsed = None
        for epochs in (WALRUS_EPOCHS_REQUESTED, WALRUS_EPOCHS_FALLBACK):
            resp = requests.put(
                f"{WALRUS_PUBLISHER}/v1/blobs?epochs={epochs}",
                data=payload,
                headers={"Content-Type": content_type},
                timeout=60,
            )
            parsed = _parse_walrus_response(resp)
            if parsed:
                break
            if "EInvalidEpochsAhead" not in (resp.text or ""):
                break
        if not parsed:
            return None
        cur.execute("""
            INSERT INTO walrus_blobs (blob_id, blob_type, content_summary, sui_object_id, epoch)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (blob_id) DO NOTHING
        """, (
            parsed["blob_id"],
            blob_type,
            (summary or "")[:200],
            parsed["sui_object_id"],
            parsed.get("registered_epoch", 0),
        ))
        conn.commit()
        return {"blob_id": parsed["blob_id"], "sui_object_id": parsed["sui_object_id"]}
    except Exception as e:
        print(f"Walrus store error: {e}")
        return None

def store_blob(data: dict, blob_type: str = "events") -> dict | None:
    """Store JSON data as Walrus blob."""
    payload = json.dumps(data, default=str, ensure_ascii=False)
    return store_bytes(
        payload.encode("utf-8"),
        blob_type=blob_type,
        content_type="application/json",
        summary=str(data)[:200],
    )

def store_file(path: str, blob_type: str = "constitution") -> dict | None:
    """Store a file on Walrus (e.g. constitution markdown)."""
    with open(path, "rb") as f:
        data = f.read()
    return store_bytes(
        data,
        blob_type=blob_type,
        content_type="text/markdown; charset=utf-8",
        summary=f"file:{os.path.basename(path)}",
    )

def store_amendment_record(amendment: dict, extra: dict | None = None) -> dict | None:
    """Upload an enacted amendment package to Walrus for permanent record."""
    pkg = {
        "type": "constitutional_amendment",
        "project": "ZION Civilization",
        "network": "sui_testnet",
        "amendment_id": amendment.get("id"),
        "proposal_number": amendment.get("proposal_number"),
        "title": amendment.get("title"),
        "description": amendment.get("description"),
        "change_type": amendment.get("change_type"),
        "votes_for": amendment.get("votes_for"),
        "votes_against": amendment.get("votes_against"),
        "votes_abstain": amendment.get("votes_abstain"),
        "merkle_root": amendment.get("merkle_root"),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        pkg.update(extra)
    return store_blob(pkg, blob_type="constitutional_amendment")

def store_civilization_snapshot():
    """Store hourly civilization snapshot on Walrus"""
    cur.execute("""
        SELECT COUNT(*) as alive, AVG(balance) as avg_bal,
               SUM(balance) as total, 
               COUNT(CASE WHEN class='elite' THEN 1 END) as elite,
               COUNT(CASE WHEN class='middle' THEN 1 END) as middle,
               COUNT(CASE WHEN class IN ('poor','critical') THEN 1 END) as poor
        FROM agents WHERE is_alive=true
    """)
    stats = dict(cur.fetchone())
    
    cur.execute("SELECT agent_name, party, approval_rating, is_dictator FROM president_state WHERE is_active=true LIMIT 1")
    president = dict(cur.fetchone()) if cur.rowcount else {}
    
    cur.execute("SELECT agent_name, sheriff_type, approval_rating FROM sheriff_state WHERE is_active=true LIMIT 1")
    sheriff = dict(cur.fetchone()) if cur.rowcount else {}
    
    cur.execute("SELECT name, corp_type, treasury, employees FROM corporations WHERE is_active=true ORDER BY treasury DESC LIMIT 5")
    corps = [dict(r) for r in cur.fetchall()]
    
    cur.execute("SELECT name, members_count, treasury, wins, losses FROM clans ORDER BY treasury DESC LIMIT 5")
    clans = [dict(r) for r in cur.fetchall()]
    
    cur.execute("SELECT description, event_type, created_at FROM events ORDER BY created_at DESC LIMIT 20")
    events = [dict(r) for r in cur.fetchall()]
    
    snapshot = {
        "type": "civilization_snapshot",
        "timestamp": datetime.now().isoformat(),
        "network": "sui_testnet",
        "project": "ZION Civilization",
        "hackathon": "Sui Overflow 2026",
        "stats": {k: float(v) if v else 0 for k, v in stats.items()},
        "president": {k: str(v) for k, v in president.items()},
        "sheriff": {k: str(v) for k, v in sheriff.items()},
        "top_corporations": corps,
        "top_clans": clans,
        "recent_events": events[:10],
    }
    
    result = store_blob(snapshot, "civilization_snapshot")
    if result:
        print(f"✅ Snapshot stored on Walrus!")
        print(f"   Blob ID: {result['blob_id']}")
        print(f"   Sui Object: {result['sui_object_id']}")
        print(f"   View: {WALRUS_AGGREGATOR}/v1/blobs/{result['blob_id']}")
        return result
    return None

def store_press_article(article_text: str, title: str) -> dict | None:
    """Store press article on Walrus"""
    data = {
        "type": "press_article",
        "title": title,
        "content": article_text,
        "project": "ZION Civilization",
        "timestamp": datetime.now().isoformat(),
    }
    result = store_blob(data, "press_article")
    if result:
        print(f"📰 Press article stored: {result['blob_id']}")
    return result

def get_recent_blobs(limit=10):
    """Get recent Walrus blobs"""
    cur.execute("""
        SELECT blob_id, blob_type, content_summary, sui_object_id, created_at
        FROM walrus_blobs ORDER BY created_at DESC LIMIT %s
    """, (limit,))
    return [dict(r) for r in cur.fetchall()]

def main():
    print(f"\n🐋 ZION Walrus Integration — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        ensure_table()
        result = store_civilization_snapshot()
        
        if result:
            blobs = get_recent_blobs(5)
            print(f"\n📊 Recent Walrus blobs ({len(blobs)}):")
            for b in blobs:
                print(f"  {b['blob_type']}: {b['blob_id'][:20]}... ({b['created_at'].strftime('%H:%M')})")
        
        print("\n✅ Walrus cycle complete!")
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        import traceback; traceback.print_exc()
    finally:
        cur.close()
        conn.close()

def handle_store_receipt():
    import sys
    data = json.loads(sys.stdin.read())
    result = store_blob(data, blob_type="stealth_receipt")
    if result:
        print(f"BLOB_ID:{result['blob_id']}")
    else:
        print("BLOB_ID:error")

def handle_reupload_constitution():
    """Re-upload constitution v3.0 and fix missing amendment Walrus records."""
    import hashlib
    from pathlib import Path

    ensure_table()
    const_path = Path(__file__).resolve().parent / "constitution" / "CONSTITUTION_ZION_v3.0.md"
    text = const_path.read_text(encoding="utf-8")
    sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()

    print("Uploading Constitution v3.0...")
    v3 = store_file(str(const_path), blob_type="constitution_v3")
    if not v3:
        print("ERROR: Constitution v3.0 upload failed")
        return
    print(f"  v3.0 blob: {v3['blob_id']}")

    cur.execute(
        """
        UPDATE constitution_versions
        SET blob_id = %s, sha256 = %s
        WHERE version = '3.0'
        """,
        (v3["blob_id"], sha256),
    )
    if cur.rowcount == 0:
        cur.execute(
            """
            INSERT INTO constitution_versions (version, sha256, blob_id, prev_sha256)
            VALUES ('3.0', %s, %s, NULL)
            """,
            (sha256, v3["blob_id"]),
        )
    conn.commit()

    cur.execute(
        "SELECT * FROM amendments WHERE id IN (16, 35) ORDER BY id"
    )
    amendments = [dict(r) for r in cur.fetchall()]
    for a in amendments:
        print(f"Uploading amendment {a['id']}: {a['title']}")
        extra = {}
        if a["id"] == 35:
            extra["constitution_text"] = text
            extra["constitution_version"] = "3.0"
            extra["constitution_sha256"] = sha256
        result = store_amendment_record(a, extra=extra or None)
        if not result:
            print(f"  ERROR: amendment {a['id']} upload failed")
            continue
        cur.execute(
            "UPDATE amendments SET blob_id = %s WHERE id = %s",
            (result["blob_id"], a["id"]),
        )
        conn.commit()
        print(f"  amendment {a['id']} blob: {result['blob_id']}")

    print("\nDone. Verify:")
    print(f"  Constitution: {WALRUS_AGGREGATOR}/v1/blobs/{v3['blob_id']}")

if __name__ == "__main__":
    import sys
    if "--store-receipt" in sys.argv:
        handle_store_receipt()
    elif "--reupload-constitution" in sys.argv:
        handle_reupload_constitution()
    else:
        main()
