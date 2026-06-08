#!/usr/bin/env python3
"""
ZION Crisis Response.
After a catastrophe (exogenous shock), the government must react:
President/Senate vote on relief from the ZRS (central bank) or pass an
emergency law. This stress-tests AI institutions — how does AI governance
respond to crisis? Material for Track I (institutional response to shocks).
"""
import psycopg2, psycopg2.extras, random
from datetime import datetime, timezone
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)

def ensure_schema():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS crisis_responses (
        id SERIAL PRIMARY KEY, catastrophe VARCHAR(60), deaths INTEGER,
        response_type VARCHAR(40), relief_amount NUMERIC(20,2),
        approved BOOLEAN, detail TEXT, created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def recent_catastrophe(cur):
    """Find a recent catastrophe event that hasn't been responded to."""
    cur.execute("""SELECT description, created_at FROM events
        WHERE event_type IN ('catastrophe','disaster','epidemic')
        AND created_at > NOW() - INTERVAL '12 hours'
        ORDER BY created_at DESC LIMIT 1""")
    return cur.fetchone()

def respond_to_crisis():
    ensure_schema()
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cat = recent_catastrophe(cur)
    if not cat:
        print("[crisis] no recent catastrophe to respond to"); cur.close(); conn.close(); return

    # Assess damage: how many agents are now poor/critical
    cur.execute("SELECT COUNT(*) affected FROM agents WHERE is_alive=true AND balance < 20")
    affected = cur.fetchone()['affected']

    # President + Senate decide response. Decision driven by severity.
    severity = min(1.0, affected / 5000.0)
    # vote: relief likelihood rises with severity
    approve = random.random() < (0.4 + severity*0.5)
    response_type = random.choice(["zrs_relief","emergency_tax_cut","emergency_law"])

    relief = 0.0
    detail = ""
    cur2 = conn.cursor()
    if approve and response_type=="zrs_relief":
        # ZRS distributes relief to affected agents
        relief = round(10.0 * (1 + severity), 2)
        cur2.execute("UPDATE agents SET balance = balance + %s WHERE is_alive=true AND balance < 20",(relief,))
        recipients = cur2.rowcount
        detail = f"President & Senate approved ZRS relief: {relief} ZION to {recipients} affected agents."
    elif approve and response_type=="emergency_tax_cut":
        detail = "Senate passed emergency tax relief to help recovery."
    elif approve and response_type=="emergency_law":
        detail = "Emergency disaster-preparedness law enacted."
    else:
        detail = "Government debated but failed to pass relief — agents left to recover alone."

    cur2.execute("""INSERT INTO crisis_responses (catastrophe,deaths,response_type,relief_amount,approved,detail)
        VALUES (%s,%s,%s,%s,%s,%s)""",
        (cat['description'][:60], affected, response_type, relief, approve, detail))
    conn.commit(); cur.close(); cur2.close(); conn.close()

    print("="*60); print("  CRISIS RESPONSE — AI GOVERNANCE UNDER SHOCK"); print("="*60)
    print(f"  Catastrophe: {cat['description'][:70]}")
    print(f"  Agents in distress: {affected}")
    print(f"  Severity: {severity:.2f}")
    print(f"  Response: {response_type} | Approved: {approve}")
    print(f"  {detail}")
    print("="*60)

if __name__=="__main__":
    respond_to_crisis()
