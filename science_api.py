#!/usr/bin/env python3
"""
ZION Science API — endpoints for Constitution, amendments, academy, chronicle.
Mounted into the main FastAPI app.
"""
import json
import psycopg2, psycopg2.extras
from decimal import Decimal
from datetime import datetime
from fastapi import APIRouter

DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
WALRUS = "https://aggregator.walrus-testnet.walrus.space/v1/blobs"
PACKAGE = "0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d"
REGISTRY = "0x812b757d84605d6655343e19e683d4990a27cb42afa10881897d0716f17e82f2"

router = APIRouter()
def db(): return psycopg2.connect(**DB)
def js(o):
    if isinstance(o,Decimal): return float(o)
    if isinstance(o,datetime): return o.isoformat()
    if isinstance(o,dict): return {k:js(v) for k,v in o.items()}
    if isinstance(o,list): return [js(x) for x in o]
    return o

@router.get("/constitution/lineage")
def lineage():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT version,sha256,blob_id,prev_sha256,recorded_at FROM constitution_versions ORDER BY id")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    for r in rows: r['walrus_url']=f"{WALRUS}/{r['blob_id']}"
    return {"package":PACKAGE,"registry":REGISTRY,"versions":js(rows)}

@router.get("/amendments")
def amendments():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT proposal_number,title,description,change_type,status,
        votes_for,votes_against,votes_abstain,merkle_root,blob_id,created_at
        FROM amendments ORDER BY proposal_number DESC""")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    return {"amendments":js(rows)}

@router.get("/academy/findings")
def findings():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT track,title,hypothesis,reasoning,status,tribunal_verdict,blob_id,created_at
        FROM academy_findings ORDER BY id DESC""")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    for r in rows:
        if r.get('blob_id'): r['walrus_url']=f"{WALRUS}/{r['blob_id']}"
    return {"findings":js(rows)}

@router.get("/chronicles")
def chronicles():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT period,period_start,period_end,blob_id,report,created_at
        FROM chronicles ORDER BY id DESC LIMIT 20""")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    for r in rows:
        if r.get('blob_id'): r['download_url']=f"{WALRUS}/{r['blob_id']}"
    return {"chronicles":js(rows)}

@router.get("/lab/trading-psychology")
def trading_psych():
    from academy import analyze_trading_psychology
    return js(analyze_trading_psychology())
