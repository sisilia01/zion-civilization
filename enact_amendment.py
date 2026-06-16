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

def ensure_constitution_schema():
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """ALTER TABLE constitution_versions
           ADD COLUMN IF NOT EXISTS amendment_id INTEGER
           REFERENCES amendments(id)"""
    )
    conn.commit()
    cur.close()
    conn.close()

def latest_version():
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT cv.*
           FROM constitution_versions cv
           WHERE (split_part(cv.version, '.', 1)::int * 100
                  + split_part(cv.version, '.', 2)::int) = (
             SELECT MAX(split_part(version, '.', 1)::int * 100
                        + split_part(version, '.', 2)::int)
             FROM constitution_versions
           )
           ORDER BY cv.id DESC
           LIMIT 1"""
    )
    v = cur.fetchone()
    cur.close()
    conn.close()
    return v

def next_version(prev_ver: str) -> str:
    major, minor = prev_ver.split(".", 1)
    return f"{major}.{int(minor) + 1}"


def _build_amendment_block(amendment: dict, new_ver: str, prev_ver: str) -> str:
    return f"""

---

## ADOPTED AMENDMENT {new_ver} — {amendment['title']}

*Ratified by vote of the agents of ZION. FOR: {amendment['votes_for']} · AGAINST: {amendment['votes_against']} · ABSTAIN: {amendment['votes_abstain']}. Verified unanimously by the ZCO Tribunal. Recorded under Article VII.*

{amendment['description']}

*Vote Merkle root: {amendment['merkle_root']}*
*Supersedes version {prev_ver}.*
"""


def _propagate_constitution_memory(cur) -> int:
    cur.execute(
        """SELECT cv.version, cv.blob_id, a.title
            FROM constitution_versions cv
            LEFT JOIN amendments a ON a.id = cv.amendment_id
            ORDER BY cv.id DESC LIMIT 1"""
    )
    row = cur.fetchone()
    if not row:
        return 0
    version, blob_id, amendment_title = row
    on_chain = f"Verified on-chain: {blob_id}. " if blob_id else "On-chain recording pending. "
    knowledge_text = (
        f"CONSTITUTIONAL UPDATE: Constitution v{version} is now active. "
        f"Latest amendment: '{amendment_title}'. "
        f"{on_chain}"
        f"All agents are bound by the updated constitution. "
        f"Check constitutional_params table for current governance parameters."
    )
    cur.execute(
        """UPDATE agent_memory
            SET civ_knowledge = %s, updated_at = NOW()
            WHERE agent_id IN (SELECT id FROM agents WHERE is_alive=true)""",
        (knowledge_text,),
    )
    return cur.rowcount


def _finalize_enacted(
    conn,
    cur,
    amendment: dict,
    amendment_id: int,
    new_ver: str,
    new_sha: str,
    prev_sha: str,
    blob_id: str | None,
    *,
    pending_onchain: bool = False,
) -> str:
    cur.execute(
        """INSERT INTO constitution_versions (version, sha256, blob_id, prev_sha256, amendment_id)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (sha256) DO NOTHING""",
        (new_ver, new_sha, blob_id, prev_sha, amendment_id),
    )
    cur.execute(
        """UPDATE amendments
           SET status='enacted', blob_id=%s, closed_at=NOW()
           WHERE id=%s""",
        (blob_id, amendment_id),
    )
    conn.commit()
    from amendment_enforcer import apply_enacted_amendments

    apply_enacted_amendments()
    try:
        updated = _propagate_constitution_memory(cur)
        conn.commit()
        if updated:
            print(f"[enact] Constitutional update propagated to {updated} agents")
    except Exception as e:
        print(f"[enact] Memory propagation warning: {e}")

    if pending_onchain or not blob_id:
        print(f"[enact] enacted (pending on-chain) — amendment {amendment_id}")
        return "enacted_pending_onchain"

    print("\n" + "=" * 60)
    print(f"  AMENDMENT ENACTED — Constitution v{new_ver}")
    print(f"  SHA-256: {new_sha}")
    print(f"  Walrus:  {WALRUS_AGGREGATOR}/v1/blobs/{blob_id}")
    print("=" * 60)
    return "enacted"


def enact(amendment_id, allow_soft: bool = False):
    ensure_constitution_schema()
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM amendments WHERE id=%s",(amendment_id,))
    a=cur.fetchone()
    if not a:
        print("Amendment not found")
        cur.close()
        conn.close()
        return None
    if a["votes_for"] <= a["votes_against"]:
        print("Amendment did not pass (FOR must exceed AGAINST among cast votes).")
        cur.close()
        conn.close()
        return None

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
        cur.close()
        conn.close()
        return None

    prev = latest_version()
    if not prev:
        print("[enact] No constitution version found")
        cur.close()
        conn.close()
        return None
    prev_sha = prev["sha256"]
    prev_ver = prev["version"]
    new_ver = next_version(prev_ver)

    prev_path = f"{CONST_DIR}/CONSTITUTION_ZION_v{prev_ver}.md"
    with open(prev_path, "r", encoding="utf-8") as f:
        base = f.read()
    new_text = base + _build_amendment_block(dict(a), new_ver, prev_ver)
    new_path = f"{CONST_DIR}/CONSTITUTION_ZION_v{new_ver}.md"
    with open(new_path, "w", encoding="utf-8") as f:
        f.write(new_text)
    new_sha = hashlib.sha256(new_text.encode()).hexdigest()
    print(f"New version {new_ver} created. SHA-256: {new_sha}")

    pkg = {
        "type": "constitution_amendment",
        "version": new_ver,
        "sha256": new_sha,
        "prev_version": prev_ver,
        "prev_sha256": prev_sha,
        "amendment_title": a["title"],
        "merkle_root": a["merkle_root"],
        "votes_for": a["votes_for"],
        "votes_against": a["votes_against"],
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "constitution_text": new_text,
    }
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
        if allow_soft:
            return _finalize_enacted(
                conn, cur, dict(a), amendment_id, new_ver, new_sha, prev_sha, None, pending_onchain=True
            )
        cur.close()
        conn.close()
        return None

    blob_id = res["blob_id"]
    print(f"Walrus blob: {blob_id}")

    print("Recording on-chain...")
    cmd = [
        "sui", "client", "call", "--package", PACKAGE, "--module", "constitution_registry",
        "--function", "record_amendment", "--args", REGISTRY, CAP, new_sha, blob_id,
        prev_sha, a["merkle_root"], str(a["votes_for"]), str(a["votes_against"]),
        "0x6", "--gas-budget", "100000000",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True)
    tx_ok = "Success" in out.stdout or "Transaction Digest" in out.stdout
    print("On-chain:", "SUCCESS" if tx_ok else "check output")
    if not tx_ok:
        print(out.stdout[-500:], out.stderr[-300:])
        if allow_soft:
            return _finalize_enacted(
                conn, cur, dict(a), amendment_id, new_ver, new_sha, prev_sha, None, pending_onchain=True
            )
        cur.close()
        conn.close()
        return None

    result = _finalize_enacted(
        conn, cur, dict(a), amendment_id, new_ver, new_sha, prev_sha, blob_id, pending_onchain=False
    )
    cur.close()
    conn.close()
    return result

if __name__=="__main__":
    aid = int(sys.argv[1]) if len(sys.argv)>1 else 2
    enact(aid)
