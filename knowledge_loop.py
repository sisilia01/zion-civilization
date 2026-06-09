#!/usr/bin/env python3
"""
ZION Knowledge Feedback Loop.
Validated scientific findings (Academy + SDM) are written back into agent
memory as KNOWLEDGE — not by retraining any neural network, but by updating
what agents KNOW about themselves. Agents then factor this into decisions.
The Chronicle measures behavior before/after, closing a verifiable
self-improvement cycle. Honest: we control knowledge/context, not model weights.
"""
import os, json
import psycopg2, psycopg2.extras
from datetime import datetime, timezone

DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)

def ensure_schema():
    conn=db(); cur=conn.cursor()
    # Add a civilization-knowledge column to agent_memory (idempotent)
    cur.execute("""ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS civ_knowledge TEXT""")
    cur.execute("""ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS knowledge_version INTEGER DEFAULT 0""")
    # Table tracking what knowledge has been propagated (for verifiability)
    cur.execute("""CREATE TABLE IF NOT EXISTS knowledge_propagation (
        id SERIAL PRIMARY KEY, source VARCHAR(50), finding_title VARCHAR(200),
        knowledge_text TEXT, agents_updated INTEGER, sdm_version INTEGER,
        propagated_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def derive_knowledge():
    """Turn the latest validated SDM into actionable knowledge for agents."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT version, rules, divergence_from_human FROM decision_model ORDER BY id DESC LIMIT 1")
    sdm=cur.fetchone()
    cur.close(); conn.close()
    if not sdm: return None, None, None
    rules = sdm['rules'] if isinstance(sdm['rules'], list) else json.loads(sdm['rules'])
    divergence = sdm.get("divergence_from_human") or ""
    version = sdm.get("version") or 0
    rule_text = "; ".join(str(r) for r in rules[:3]) if rules else "No rules recorded."
    knowledge = (
        f"CIVILIZATION KNOWLEDGE v{version} (from Synthetic Decision Model):\n"
        f"Key decision rules observed in v{version} AI agents:\n"
        f"{rule_text}\n"
        f"Observed divergence from human behavior: {divergence}\n"
        "If trading, factor these patterns into your decision."
    )
    return knowledge, version, divergence

def propagate(limit=None):
    """Write the knowledge into agent memory. Agents will read it on next decision."""
    ensure_schema()
    knowledge, sdm_version, divergence = derive_knowledge()
    if not knowledge:
        print("No validated SDM yet — nothing to propagate."); return

    conn=db(); cur=conn.cursor()
    # Update existing agent_memory rows; only for active traders to keep it meaningful
    q = """UPDATE agent_memory SET civ_knowledge=%s, knowledge_version=%s
           WHERE agent_id IN (SELECT id FROM agents WHERE is_alive=true)"""
    params=[knowledge, sdm_version]
    if limit:
        q = """UPDATE agent_memory SET civ_knowledge=%s, knowledge_version=%s
               WHERE agent_id IN (SELECT id FROM agents WHERE is_alive=true LIMIT %s)"""
        params=[knowledge, sdm_version, limit]
    cur.execute(q, params)
    updated = cur.rowcount
    cur.execute("""INSERT INTO knowledge_propagation (source,finding_title,knowledge_text,agents_updated,sdm_version)
        VALUES (%s,%s,%s,%s,%s)""",
        ("SDM","Synthetic Decision Model feedback",knowledge,updated,sdm_version))
    conn.commit(); cur.close(); conn.close()

    print("="*60); print("  KNOWLEDGE FEEDBACK LOOP"); print("="*60)
    print(f"  Source: Synthetic Decision Model v{sdm_version}")
    print(f"  Knowledge propagated to {updated} agents' memory")
    print(f"  (agents will factor this into future decisions)")
    print(f"\n  KNOWLEDGE TEXT:\n  {knowledge}")
    print("="*60)
    print("  This is NOT model retraining. We update what agents KNOW,")
    print("  not their weights. Effect measurable in next Chronicle.")
    print("="*60)

def measure_effect():
    """Compare trading performance before vs after knowledge propagation."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT MAX(propagated_at) p FROM knowledge_propagation")
    row=cur.fetchone()
    if not row or not row['p']:
        print("No propagation yet."); cur.close(); conn.close(); return
    cutoff=row['p']
    cur.execute("""SELECT
        AVG(CASE WHEN closed_at < %s THEN pnl_percent END) before_pnl,
        AVG(CASE WHEN closed_at >= %s THEN pnl_percent END) after_pnl,
        COUNT(CASE WHEN closed_at < %s THEN 1 END) before_n,
        COUNT(CASE WHEN closed_at >= %s THEN 1 END) after_n
        FROM agent_trades WHERE status='CLOSED'""",(cutoff,cutoff,cutoff,cutoff))
    r=dict(cur.fetchone()); cur.close(); conn.close()
    print("\n  EFFECT MEASUREMENT (before vs after knowledge):")
    print(f"    Before: avg PnL {float(r['before_pnl'] or 0):.4f}% (n={r['before_n']})")
    print(f"    After:  avg PnL {float(r['after_pnl'] or 0):.4f}% (n={r['after_n']})")
    print(f"    (meaningful comparison needs trades to accumulate after propagation)")

if __name__=="__main__":
    import sys
    if "--measure" in sys.argv:
        measure_effect()
    else:
        propagate()
        measure_effect()
