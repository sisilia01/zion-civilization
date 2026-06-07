#!/usr/bin/env python3
"""
ZION Agent Dossier (Article VI Sec.5 + Bill of Rights Art.2)
Builds an immutable identity record of an agent: personality, key decisions,
and the REASONING behind them — so we can understand *why* an agent acted,
and study the mind that produced a discovery. Archived on Walrus.
"""
import os, json, hashlib
import psycopg2, psycopg2.extras
from decimal import Decimal
from datetime import datetime, timezone
from walrus import store_blob, WALRUS_AGGREGATOR

DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)
def jsafe(o):
    if isinstance(o,Decimal): return float(o)
    if isinstance(o,datetime): return o.isoformat()
    if isinstance(o,dict): return {k:jsafe(v) for k,v in o.items()}
    if isinstance(o,list): return [jsafe(x) for x in o]
    return o

def ensure_table():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS agent_dossiers (
        id SERIAL PRIMARY KEY, agent_id INTEGER UNIQUE, agent_name VARCHAR(50),
        dossier JSONB, sha256 VARCHAR(64), blob_id VARCHAR(100),
        updated_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def build_dossier(agent_id):
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # Identity + personality
    cur.execute("""SELECT id,name,class,balance,age_days,charisma,aggression,faith,
        ambition,loyalty,intelligence,clan_name,born_at FROM agents WHERE id=%s""",(agent_id,))
    agent=cur.fetchone()
    if not agent: cur.close(); conn.close(); return None
    agent=dict(agent)

    # Memory / reasoning history
    cur.execute("""SELECT * FROM agent_memory WHERE agent_id=%s ORDER BY updated_at DESC LIMIT 10""",(agent_id,))
    memory=[dict(r) for r in cur.fetchall()]

    # Trading history (behavior + outcomes)
    cur.execute("""SELECT pair,direction,pnl,pnl_percent,opened_at,closed_at
        FROM agent_trades WHERE agent_id=%s AND status='CLOSED' ORDER BY closed_at DESC LIMIT 10""",(agent_id,))
    trades=[dict(r) for r in cur.fetchall()]
    cur.execute("""SELECT COUNT(*) n, AVG(pnl_percent) avg_pnl,
        COUNT(CASE WHEN pnl>0 THEN 1 END) wins FROM agent_trades WHERE agent_id=%s AND status='CLOSED'""",(agent_id,))
    trade_stats=dict(cur.fetchone())

    # Voting history
    cur.execute("""SELECT a.title, av.vote FROM amendment_votes av
        JOIN amendments a ON a.id=av.amendment_id WHERE av.agent_id=%s ORDER BY av.created_at DESC LIMIT 10""",(agent_id,))
    votes=[dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()

    dossier={
        "type":"agent_dossier","agent_id":agent['id'],"name":agent['name'],
        "identity":{"class":agent['class'],"clan":agent['clan_name'],
            "age_days":agent['age_days'],"born_at":jsafe(agent['born_at'])},
        "personality":{"charisma":agent['charisma'],"aggression":agent['aggression'],
            "faith":agent['faith'],"ambition":agent['ambition'],"loyalty":agent['loyalty'],
            "intelligence":agent['intelligence']},
        "economic":{"balance":jsafe(agent['balance']),
            "trades":trade_stats['n'],"wins":trade_stats['wins'],
            "avg_pnl_pct":jsafe(trade_stats['avg_pnl'])},
        "reasoning_history":jsafe(memory),
        "recent_trades":jsafe(trades),
        "voting_record":jsafe(votes),
        "compiled_at":datetime.now(timezone.utc).isoformat(),
        "note":"Immutable record of identity and reasoning, per Article VI Sec.5. Permits inspection of the mind behind the agent's actions.",
    }
    return dossier

def publish_dossier(agent_id):
    ensure_table()
    d=build_dossier(agent_id)
    if not d: print(f"Agent {agent_id} not found"); return
    text=json.dumps(d,sort_keys=True)
    sha=hashlib.sha256(text.encode()).hexdigest()
    res=store_blob(d,blob_type="agent_dossier"); blob=res['blob_id'] if res else None
    conn=db(); cur=conn.cursor()
    cur.execute("""INSERT INTO agent_dossiers (agent_id,agent_name,dossier,sha256,blob_id)
        VALUES (%s,%s,%s,%s,%s) ON CONFLICT (agent_id) DO UPDATE SET
        dossier=EXCLUDED.dossier, sha256=EXCLUDED.sha256, blob_id=EXCLUDED.blob_id, updated_at=NOW()""",
        (agent_id,d['name'],json.dumps(d),sha,blob))
    conn.commit(); cur.close(); conn.close()
    print("="*60); print(f"  AGENT DOSSIER — {d['name']} (#{agent_id})"); print("="*60)
    print(f"  Class: {d['identity']['class']}  Age: {d['identity']['age_days']}d")
    p=d['personality']
    print(f"  Personality: ambition {p['ambition']}, loyalty {p['loyalty']}, intelligence {p['intelligence']}")
    print(f"  Trades: {d['economic']['trades']}  Wins: {d['economic']['wins']}  AvgPnL: {d['economic']['avg_pnl_pct']}")
    print(f"  Reasoning records: {len(d['reasoning_history'])}  Votes: {len(d['voting_record'])}")
    print(f"  SHA-256: {sha}")
    if blob: print(f"  Walrus (immutable mind): {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)
    return d

def top_agents(n=5):
    """Find most active/notable agents to profile."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT agent_id, COUNT(*) trades FROM agent_trades
        WHERE status='CLOSED' GROUP BY agent_id ORDER BY trades DESC LIMIT %s""",(n,))
    ids=[r['agent_id'] for r in cur.fetchall()]; cur.close(); conn.close()
    return ids

if __name__=="__main__":
    import sys
    if len(sys.argv)>1:
        publish_dossier(int(sys.argv[1]))
    else:
        print("Most active agents:", top_agents(5))
        ids=top_agents(1)
        if ids: publish_dossier(ids[0])
