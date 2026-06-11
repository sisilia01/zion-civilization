#!/usr/bin/env python3
"""
ZION Amendment Enactment (Article VII Sec.5)
Closes the full loop: vote -> tribunal -> on-chain.
Creates new Constitution version, hashes it, stores on Walrus,
records on-chain via record_amendment with Merkle proof + tribunal verdicts.
"""
import os, sys, json, hashlib, subprocess
import psycopg2, psycopg2.extras
from datetime import datetime, timezone
from walrus import store_amendment_record, store_blob, WALRUS_AGGREGATOR

import os
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
PACKAGE = "0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d"
REGISTRY = "0x812b757d84605d6655343e19e683d4990a27cb42afa10881897d0716f17e82f2"
CAP = "0x3d4c0ead1f73e6b1fae40d8db2171857d892801c466f609b33f4b4a6e3627c73"
CONST_DIR = os.path.expanduser("~/zion_backend/constitution")

def db(): return psycopg2.connect(**DB)

def latest_version():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM constitution_versions ORDER BY id DESC LIMIT 1")
    v=cur.fetchone(); cur.close(); conn.close(); return v

def enact(amendment_id):
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM amendments WHERE id=%s",(amendment_id,))
    a=cur.fetchone()
    if not a: print("Amendment not found"); return
    if a['votes_for'] <= a['votes_against']:
        print("Amendment did not pass."); return

    # Verify tribunal unanimously approved (constitutional requirement Article IV)
    cur2 = conn.cursor()
    cur2.execute(
        """SELECT unanimous FROM tribunal_records
                   WHERE amendment_id=%s
                   ORDER BY id DESC LIMIT 1""",
        (amendment_id,),
    )
    tribunal_row = cur2.fetchone()
    cur2.close()
    if not tribunal_row or not tribunal_row[0]:
        print(f"[enact] BLOCKED: No unanimous tribunal record for amendment {amendment_id}")
        print("[enact] Amendment cannot be enacted without ZCO Tribunal unanimity (Article IV)")
        cur.close()
        conn.close()
        return None

    prev = latest_version()
    prev_sha = prev['sha256']; prev_ver = prev['version']
    new_ver = f"1.{int(prev_ver.split('.')[1])+1}" if '.' in prev_ver else "1.1"

    # Build new constitution version: old text + adopted amendment appended
    with open(f"{CONST_DIR}/CONSTITUTION_ZION_v1.0.md","r",encoding="utf-8") as f:
        base = f.read()
    amendment_block = f"""

---

## ADOPTED AMENDMENT {new_ver} — {a['title']}

*Ratified by vote of the agents of ZION. FOR: {a['votes_for']} · AGAINST: {a['votes_against']} · ABSTAIN: {a['votes_abstain']}. Verified unanimously by the ZCO Tribunal. Recorded under Article VII.*

{a['description']}

*Vote Merkle root: {a['merkle_root']}*
*Supersedes version {prev_ver}.*
"""
    new_text = base + amendment_block
    new_path = f"{CONST_DIR}/CONSTITUTION_ZION_v{new_ver}.md"
    with open(new_path,"w",encoding="utf-8") as f: f.write(new_text)
    new_sha = hashlib.sha256(new_text.encode()).hexdigest()
    print(f"New version {new_ver} created. SHA-256: {new_sha}")

    # Store new version on Walrus
    pkg = {"type":"constitution_amendment","version":new_ver,"sha256":new_sha,
           "prev_version":prev_ver,"prev_sha256":prev_sha,
           "amendment_title":a['title'],"merkle_root":a['merkle_root'],
           "votes_for":a['votes_for'],"votes_against":a['votes_against'],
           "recorded_at":datetime.now(timezone.utc).isoformat(),
           "constitution_text":new_text}
    print("Storing on Walrus...")
    res = store_amendment_record(
        dict(a),
        extra={
            "constitution_version": new_ver,
            "constitution_sha256": new_sha,
            "constitution_text": new_text,
            "package_type": "constitution_amendment",
        },
    )
    if not res:
        res = store_blob(pkg, blob_type="constitution_amendment")
    if not res:
        print("Walrus failed")
        return
    blob_id = res['blob_id']
    print(f"Walrus blob: {blob_id}")

    # Record on-chain via record_amendment
    print("Recording on-chain...")
    cmd = ["sui","client","call","--package",PACKAGE,"--module","constitution_registry",
           "--function","record_amendment","--args",REGISTRY,CAP,new_sha,blob_id,
           prev_sha,a['merkle_root'],str(a['votes_for']),str(a['votes_against']),
           "0x6","--gas-budget","100000000"]
    out = subprocess.run(cmd,capture_output=True,text=True)
    tx_ok = "Success" in out.stdout or "Transaction Digest" in out.stdout
    print("On-chain:", "SUCCESS" if tx_ok else "check output")
    if not tx_ok: print(out.stdout[-500:], out.stderr[-300:])

    # Save new version to lineage table
    cur2=conn.cursor()
    cur2.execute("""INSERT INTO constitution_versions (version,sha256,blob_id,prev_sha256)
                    VALUES (%s,%s,%s,%s) ON CONFLICT (sha256) DO NOTHING""",
                 (new_ver,new_sha,blob_id,prev_sha))
    cur2.execute("UPDATE amendments SET status='enacted', blob_id=%s WHERE id=%s",(blob_id,amendment_id))
    conn.commit(); cur.close(); cur2.close(); conn.close()

    from amendment_enforcer import apply_enacted_amendments
    apply_enacted_amendments()

    # Propagate new constitution to agent memory
    try:
        conn = psycopg2.connect(
            host=os.environ.get("DB_HOST","localhost"),
            database=os.environ.get("DB_NAME","zion_db"),
            user=os.environ.get("DB_USER","zion_user"),
            password=os.environ.get("DB_PASSWORD","zion2026"))
        cur = conn.cursor()
        # Read latest constitution version text
        cur.execute("""SELECT cv.version, cv.blob_id, a.title
            FROM constitution_versions cv
            LEFT JOIN amendments a ON a.id = cv.amendment_id
            ORDER BY cv.id DESC LIMIT 1""")
        row = cur.fetchone()
        if row:
            version, blob_id, amendment_title = row
            knowledge_text = (
                f"CONSTITUTIONAL UPDATE: Constitution v{version} is now active. "
                f"Latest amendment: '{amendment_title}'. "
                f"Verified on-chain: {blob_id}. "
                f"All agents are bound by the updated constitution. "
                f"Check constitutional_params table for current governance parameters."
            )
            # Write to ALL alive agents' memory
            cur.execute("""UPDATE agent_memory 
                SET civ_knowledge = %s, updated_at = NOW()
                WHERE agent_id IN (SELECT id FROM agents WHERE is_alive=true)""",
                (knowledge_text,))
            updated = cur.rowcount
            conn.commit()
            print(f"[enact] Constitutional update propagated to {updated} agents")
        cur.close(); conn.close()
    except Exception as e:
        print(f"[enact] Memory propagation warning: {e}")

    print("\n"+"="*60)
    print(f"  AMENDMENT ENACTED — Constitution v{new_ver}")
    print(f"  SHA-256: {new_sha}")
    print(f"  Prev:    {prev_sha[:16]}... (v{prev_ver})")
    print(f"  Walrus:  {WALRUS_AGGREGATOR}/v1/blobs/{blob_id}")
    print(f"  Lineage: Genesis -> v{new_ver} (linked on-chain)")
    print("="*60)

if __name__=="__main__":
    aid = int(sys.argv[1]) if len(sys.argv)>1 else 2
    enact(aid)
