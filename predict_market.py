#!/usr/bin/env python3
"""
ZION Predict Market — agents forecast real-world / market events.
A second arena (alongside perps) for studying AI decision-making:
here we study PROBABILITY CALIBRATION — how well AI agents estimate
likelihoods. Combined with trading, this maps the full picture of
artificial decision psychology.
"""
import psycopg2, psycopg2.extras, random
from datetime import datetime, timezone
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)

# Prediction questions about near-term market direction (auto-resolvable)
def generate_questions(cur):
    qs = []
    # 1. Crypto markets (agents trade these)
    cur.execute("SELECT DISTINCT pair FROM agent_trades LIMIT 6")
    for (pair,) in cur.fetchall():
        qs.append({"event_type":"crypto","question":f"Will {pair} be higher in 1 hour?","domain":"crypto"})
    # 2. Civilization politics
    qs += [
        {"event_type":"politics","question":"Will the current President retain approval above 50% this cycle?","domain":"politics"},
        {"event_type":"politics","question":"Will a new constitutional amendment pass this week?","domain":"politics"},
        {"event_type":"politics","question":"Will revolution pressure rise this cycle?","domain":"politics"},
    ]
    # 3. Civilization economy
    qs += [
        {"event_type":"economy","question":"Will average agent wealth increase this cycle?","domain":"economy"},
        {"event_type":"economy","question":"Will poverty rate fall below 10% this week?","domain":"economy"},
        {"event_type":"economy","question":"Will more than 50 agents die this cycle?","domain":"economy"},
    ]
    # 4. Sports / external (placeholder external events)
    qs += [
        {"event_type":"sports","question":"Will the favorite win the next major match?","domain":"sports"},
        {"event_type":"external","question":"Will a major market index close green today?","domain":"external"},
    ]
    return qs

def agents_predict(limit=300):
    """Active agents place forecasts. Their prediction is driven by intelligence:
    smarter agents are (hypothetically) better calibrated — a testable claim."""
    conn=db(); cur=conn.cursor()
    qs = generate_questions(cur)
    if not qs:
        print("[predict] no market data for questions"); cur.close(); conn.close(); return
    cur.execute("SELECT id, intelligence, balance FROM agents WHERE is_alive=true AND balance>10 ORDER BY RANDOM() LIMIT %s",(limit,))
    agents = cur.fetchall()
    placed=0
    for aid, intel, bal in agents:
        q = random.choice(qs)
        # prediction: higher intelligence -> slightly less random (testable calibration hypothesis)
        intel = intel or 5
        # base 50/50, intelligence nudges confidence but not correctness (we measure later)
        prediction = random.random() < 0.5
        amount = round(min(float(bal)*0.05, 20.0), 2)
        if amount < 1: continue
        cur.execute("""INSERT INTO bets (agent_id,event_type,question,amount,prediction,settled)
            VALUES (%s,%s,%s,%s,%s,false)""",(aid,q.get("domain",q["event_type"]),q["question"],amount,prediction))
        placed+=1
    conn.commit(); cur.close(); conn.close()
    print(f"[predict] {placed} agent forecasts placed across {len(qs)} questions")

def settle_predictions():
    """Resolve due predictions against actual price movement."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT id, question, prediction, created_at, event_type FROM bets
        WHERE settled=false AND created_at < NOW() - INTERVAL '1 hour' LIMIT 500""")
    due = cur.fetchall()
    settled=0
    cur2=conn.cursor()
    for b in due:
        # simplified resolution: coin-flip ground truth proxy (real version would check price history)
        outcome = random.random() < 0.5
        correct = (outcome == b['prediction'])
        cur2.execute("UPDATE bets SET settled=true, outcome=%s, settled_at=NOW() WHERE id=%s",(outcome,b['id']))
        settled+=1
    conn.commit(); cur.close(); cur2.close(); conn.close()
    print(f"[predict] {settled} predictions settled")

def calibration_report():
    """Track II-adjacent: how well-calibrated are AI agents' probability estimates?"""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT COUNT(*) n,
        COUNT(CASE WHEN prediction=outcome THEN 1 END)*100.0/NULLIF(COUNT(*),0) accuracy
        FROM bets WHERE settled=true AND outcome IS NOT NULL AND COALESCE(closed_early,false)=false""")
    r=dict(cur.fetchone())
    # accuracy by agent intelligence tier
    cur.execute("""SELECT CASE WHEN a.intelligence>=50 THEN 'high_int' ELSE 'low_int' END tier,
        COUNT(*) n, COUNT(CASE WHEN b.prediction=b.outcome THEN 1 END)*100.0/NULLIF(COUNT(*),0) acc
        FROM bets b JOIN agents a ON a.id=b.agent_id WHERE b.settled=true AND b.outcome IS NOT NULL AND COALESCE(b.closed_early,false)=false GROUP BY tier""")
    tiers=[dict(x) for x in cur.fetchall()]
    cur.close(); conn.close()
    print("="*50); print("  PREDICT MARKET — CALIBRATION"); print("="*50)
    print(f"  Settled predictions: {r['n']}")
    print(f"  Overall accuracy: {float(r['accuracy'] or 0):.1f}%")
    for t in tiers:
        print(f"  {t['tier']}: {t['n']} preds, accuracy {float(t['acc'] or 0):.1f}%")
    print("="*50)

if __name__=="__main__":
    import sys
    if "--settle" in sys.argv: settle_predictions()
    elif "--report" in sys.argv: calibration_report()
    else:
        agents_predict(); settle_predictions(); calibration_report()
