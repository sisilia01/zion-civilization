#!/usr/bin/env python3
"""
import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
ZION Walrus Integration — Real decentralized storage
Stores civilization events as blobs on Walrus testnet
"""
import psycopg2
import psycopg2.extras
import requests
import json
from datetime import datetime

WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space"
WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space"

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

def store_blob(data: dict, blob_type: str = "events") -> dict | None:
    """Store data as Walrus blob"""
    try:
        payload = json.dumps(data, default=str, ensure_ascii=False)
        resp = requests.put(
            f"{WALRUS_PUBLISHER}/v1/blobs?epochs=53",
            data=payload.encode('utf-8'),
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        if resp.status_code == 200:
            result = resp.json()
            blob_info = result.get('newlyCreated', result.get('alreadyCertified', {}))
            blob_obj = blob_info.get('blobObject', {})
            blob_id = blob_obj.get('blobId', '')
            sui_obj_id = blob_obj.get('id', '')
            
            if blob_id:
                cur.execute("""
                    INSERT INTO walrus_blobs (blob_id, blob_type, content_summary, sui_object_id, epoch)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (blob_id) DO NOTHING
                """, (blob_id, blob_type, str(data)[:200], sui_obj_id, blob_obj.get('registeredEpoch', 0)))
                conn.commit()
                return {"blob_id": blob_id, "sui_object_id": sui_obj_id}
        return None
    except Exception as e:
        print(f"Walrus store error: {e}")
        return None

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

if __name__ == "__main__":
    import sys
    if "--store-receipt" in sys.argv:
        handle_store_receipt()
    else:
        main()
