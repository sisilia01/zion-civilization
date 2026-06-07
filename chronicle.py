#!/usr/bin/env python3
"""
ZION Chronicle (Constitution Article IV Sec.6)
Periodic compilation of the civilization: events, amendments, discoveries,
economy, divergence from Genesis. Archived on Walrus, downloadable.
"""
import os, json, hashlib
import psycopg2, psycopg2.extras
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from walrus import store_blob, WALRUS_AGGREGATOR

DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)
def jsafe(o):
    if isinstance(o,Decimal): return float(o)
    if isinstance(o,dict): return {k:jsafe(v) for k,v in o.items()}
    if isinstance(o,list): return [jsafe(x) for x in o]
    if isinstance(o,datetime): return o.isoformat()
    return o

def ensure_table():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS chronicles (
        id SERIAL PRIMARY KEY, period VARCHAR(10), period_start TIMESTAMP,
        period_end TIMESTAMP, report JSONB, blob_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def compile_chronicle(period="weekly"):
    days = {"weekly":7,"monthly":30,"yearly":365}.get(period,7)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Economy snapshot + divergence from Genesis (equal-start ideal)
    cur.execute("""SELECT COUNT(*) alive, AVG(balance) avg_bal, SUM(balance) total,
        STDDEV(balance) wealth_stddev,
        COUNT(CASE WHEN class IN ('elite','rich') THEN 1 END) upper,
        COUNT(CASE WHEN class IN ('poor','critical') THEN 1 END) lower
        FROM agents WHERE is_alive=true""")
    econ = dict(cur.fetchone())

    # Gini-style inequality proxy
    cur.execute("""SELECT balance FROM agents WHERE is_alive=true ORDER BY balance""")
    bals = [float(r['balance']) for r in cur.fetchall()]
    gini = 0.0
    if bals and sum(bals)>0:
        n=len(bals); cum=0; 
        for i,b in enumerate(bals): cum += (i+1)*b
        gini = (2*cum)/(n*sum(bals)) - (n+1)/n

    # Amendments this period
    cur.execute("""SELECT proposal_number,title,status,votes_for,votes_against
        FROM amendments WHERE created_at>=%s ORDER BY proposal_number""",(since,))
    amendments=[dict(r) for r in cur.fetchall()]

    # Academy findings this period
    cur.execute("""SELECT track,title,tribunal_verdict FROM academy_findings
        WHERE created_at>=%s""",(since,))
    findings=[dict(r) for r in cur.fetchall()]

    # Trading activity
    cur.execute("""SELECT COUNT(*) trades, AVG(pnl_percent) avg_pnl,
        COUNT(CASE WHEN pnl>0 THEN 1 END)*100.0/NULLIF(COUNT(*),0) win_rate
        FROM agent_trades WHERE status='CLOSED' AND closed_at>=%s""",(since,))
    trading=dict(cur.fetchone())

    # Constitution lineage
    cur.execute("SELECT version,sha256,blob_id FROM constitution_versions ORDER BY id")
    lineage=[dict(r) for r in cur.fetchall()]

    cur.close(); conn.close()

    report = {
        "type":"chronicle","period":period,
        "period_start":since.isoformat(),
        "period_end":datetime.now(timezone.utc).isoformat(),
        "project":"ZION Civilization",
        "economy":jsafe(econ),
        "inequality_gini":round(gini,4),
        "constitution_lineage":lineage,
        "amendments_this_period":jsafe(amendments),
        "academy_findings_this_period":jsafe(findings),
        "trading_activity":jsafe(trading),
        "divergence_note":"Gini measures distance from equal-start ideal. Genesis = human-derived US structure.",
    }
    return report

def publish(period="weekly"):
    ensure_table()
    report = compile_chronicle(period)
    res = store_blob(report, blob_type=f"chronicle_{period}")
    blob = res['blob_id'] if res else None
    conn=db(); cur=conn.cursor()
    cur.execute("""INSERT INTO chronicles (period,period_start,period_end,report,blob_id)
        VALUES (%s,%s,%s,%s,%s)""",
        (period,report['period_start'],report['period_end'],json.dumps(report),blob))
    conn.commit(); cur.close(); conn.close()

    print("="*60); print(f"  ZION CHRONICLE — {period.upper()}"); print("="*60)
    e=report['economy']
    print(f"  Alive agents: {int(e['alive'])}")
    print(f"  Avg balance: {e['avg_bal']:.2f}  Total: {e['total']:.0f}")
    print(f"  Inequality (Gini): {report['inequality_gini']}  (0=equal, 1=max unequal)")
    print(f"  Upper class: {int(e['upper'])}  Lower class: {int(e['lower'])}")
    print(f"  Amendments this period: {len(report['amendments_this_period'])}")
    print(f"  Academy findings: {len(report['academy_findings_this_period'])}")
    t=report['trading_activity']
    if t['trades']: print(f"  Trades: {t['trades']}  Win rate: {float(t['win_rate'] or 0):.1f}%")
    print(f"  Constitution versions: {len(report['constitution_lineage'])}")
    if blob: print(f"\n  Downloadable: {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)
    return report

if __name__=="__main__":
    import sys
    p = sys.argv[1] if len(sys.argv)>1 else "weekly"
    publish(p)
