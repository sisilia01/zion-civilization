#!/usr/bin/env python3
"""
ZION Scientific Academy (Constitution Article VI)
Track I: Laws of the Civilization | Track II: AI Trading Psychology
Agents form hypotheses, analyze on-chain data, Tribunal peer-reviews.
"""
import os, json, hashlib
import psycopg2, psycopg2.extras
from datetime import datetime, timezone

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
def db(): return psycopg2.connect(**DB)

def ensure_tables():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS academy_findings (
        id SERIAL PRIMARY KEY, track VARCHAR(10), title VARCHAR(200),
        hypothesis TEXT, evidence JSONB, reasoning TEXT,
        proposed_by INTEGER, status VARCHAR(20) DEFAULT 'pending',
        tribunal_verdict VARCHAR(20), blob_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def analyze_trading_psychology():
    """Track II: extract real patterns from agent trades — the data for the
    central question: why do AI agents trade imperfectly?"""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    findings = {}

    # 1. Overall win/loss
    cur.execute("""SELECT COUNT(*) n, AVG(pnl_percent) avg_pnl,
        COUNT(CASE WHEN pnl>0 THEN 1 END) wins,
        COUNT(CASE WHEN pnl<0 THEN 1 END) losses
        FROM agent_trades WHERE status='CLOSED'""")
    o = cur.fetchone()
    win_rate = (o['wins']/o['n']*100) if o['n'] else 0
    findings['overall'] = {'trades':o['n'],'win_rate':round(win_rate,1),
        'avg_pnl_pct':round(float(o['avg_pnl'] or 0),3),'wins':o['wins'],'losses':o['losses']}

    # 2. LONG vs SHORT bias (do agents favor one direction irrationally?)
    cur.execute("""SELECT direction, COUNT(*) n, AVG(pnl_percent) avg_pnl,
        COUNT(CASE WHEN pnl>0 THEN 1 END)*100.0/COUNT(*) win_rate
        FROM agent_trades WHERE status='CLOSED' GROUP BY direction""")
    findings['directional_bias'] = [dict(r) for r in cur.fetchall()]

    # 3. Do losers hold longer than winners? (loss aversion / disposition effect)
    cur.execute("""SELECT
        AVG(CASE WHEN pnl>0 THEN EXTRACT(EPOCH FROM (closed_at-opened_at)) END) win_hold,
        AVG(CASE WHEN pnl<0 THEN EXTRACT(EPOCH FROM (closed_at-opened_at)) END) loss_hold
        FROM agent_trades WHERE status='CLOSED' AND closed_at IS NOT NULL""")
    h = cur.fetchone()
    findings['disposition_effect'] = {
        'avg_winner_hold_sec': round(float(h['win_hold'] or 0),1),
        'avg_loser_hold_sec': round(float(h['loss_hold'] or 0),1),
        'holds_losers_longer': (h['loss_hold'] or 0) > (h['win_hold'] or 0)}

    # 4. Per-pair performance
    cur.execute("""SELECT pair, COUNT(*) n, AVG(pnl_percent) avg_pnl
        FROM agent_trades WHERE status='CLOSED' GROUP BY pair ORDER BY n DESC LIMIT 8""")
    findings['by_pair'] = [dict(r) for r in cur.fetchall()]

    cur.close(); conn.close()
    return findings

def print_report(f):
    print("\n"+"="*60)
    print("  ZION SCIENTIFIC ACADEMY — TRACK II")
    print("  The Psychology of Artificial Trading")
    print("="*60)
    o=f['overall']
    print(f"\n  Total closed trades: {o['trades']}")
    print(f"  Win rate: {o['win_rate']}%  (wins {o['wins']} / losses {o['losses']})")
    print(f"  Avg PnL per trade: {o['avg_pnl_pct']}%")
    print(f"\n  DIRECTIONAL BIAS (do agents favor LONG or SHORT?):")
    for d in f['directional_bias']:
        print(f"    {d['direction']}: {d['n']} trades, win {float(d['win_rate']):.1f}%, avg PnL {float(d['avg_pnl']):.3f}%")
    de=f['disposition_effect']
    print(f"\n  DISPOSITION EFFECT (loss aversion test):")
    print(f"    Winners held: {de['avg_winner_hold_sec']}s")
    print(f"    Losers held:  {de['avg_loser_hold_sec']}s")
    print(f"    Holds losers longer than winners: {de['holds_losers_longer']}")
    if de['holds_losers_longer']:
        print(f"    >>> SIGNAL: agents exhibit disposition effect — a HUMAN bias,")
        print(f"        despite having no emotions. Inherited from training data?")
    print(f"\n  BY PAIR:")
    for p in f['by_pair']:
        print(f"    {p['pair']}: {p['n']} trades, avg PnL {float(p['avg_pnl']):.3f}%")
    print("="*60)

if __name__=="__main__":
    ensure_tables()
    f = analyze_trading_psychology()
    print_report(f)
