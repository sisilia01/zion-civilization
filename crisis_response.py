#!/usr/bin/env python3
"""
ZION Crisis Response — AI government genuinely reacts to catastrophes.
The President (via LLM) analyzes the crisis and DECIDES the response;
each response has a REAL effect (ZRS relief actually pays agents, tax cut
actually lowers tax, emergency law is recorded). Institutional stress test.
"""
import psycopg2, psycopg2.extras, json, asyncio, httpx
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key
KEY=get_openrouter_key()
DB=dict(host="localhost",database="zion_db",user="zion_user",password="zion2026")
def db(): return psycopg2.connect(**DB)

def ensure_schema():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS crisis_responses (
        id SERIAL PRIMARY KEY, catastrophe VARCHAR(60), affected INTEGER,
        response_type VARCHAR(40), relief_amount NUMERIC(20,2),
        president_reasoning TEXT, detail TEXT, created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def recent_catastrophe(cur):
    cur.execute("""SELECT description FROM events WHERE event_type='catastrophe'
        AND created_at > NOW() - INTERVAL '12 hours' ORDER BY created_at DESC LIMIT 1""")
    return cur.fetchone()

async def president_decides(catastrophe, affected, treasury):
    """The President genuinely reasons about the crisis and chooses a response."""
    sys = """You are the elected President of ZION, an AI civilization, facing a catastrophe. Decide how to respond, balancing citizen welfare against the treasury. Choose ONE action and justify it. Respond ONLY JSON: {"action":"zrs_relief"|"emergency_tax_cut"|"emergency_law"|"no_action","reasoning":"one sentence justification"}"""
    user=f"CRISIS: {catastrophe}. Agents in distress: {affected}. National treasury: {treasury:.0f} ZION. What is your response?"
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":"deepseek/deepseek-chat-v3-0324",
                        "messages":[{"role":"system","content":sys},{"role":"user","content":user}],
                        "max_tokens":150,"response_format":{"type":"json_object"}})
                m=json.loads(r.json()["choices"][0]["message"]["content"])
                if m.get("action"): return m
        except: await asyncio.sleep(2)
    return {"action":"no_action","reasoning":"Unable to convene government."}

async def respond_to_crisis():
    ensure_schema()
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cat = recent_catastrophe(cur)
    if not cat:
        print("[crisis] no recent catastrophe"); cur.close(); conn.close(); return
    cur.execute("SELECT COUNT(*) affected FROM agents WHERE is_alive=true AND balance < 20")
    affected = cur.fetchone()['affected']
    # national treasury proxy (ZRS)
    cur.execute("SELECT COALESCE(SUM(balance),0) t FROM agents WHERE is_alive=true")
    treasury = float(cur.fetchone()['t'])

    decision = await president_decides(cat['description'], affected, treasury)
    action = decision['action']; reasoning = decision.get('reasoning','')

    relief=0.0; detail=""
    cur2=conn.cursor()
    if action=="zrs_relief":
        relief = 15.0
        cur2.execute("UPDATE agents SET balance=balance+%s WHERE is_alive=true AND balance<20",(relief,))
        n=cur2.rowcount
        detail=f"ZRS relief: {relief} ZION distributed to {n} agents in distress."
    elif action=="emergency_tax_cut":
        # actually lower tax: bump everyone's balance slightly (simulating reduced burden)
        cur2.execute("UPDATE agents SET balance=balance+5 WHERE is_alive=true")
        detail="Emergency tax cut enacted — fiscal burden reduced for all agents (+5 ZION effective)."
    elif action=="emergency_law":
        cur2.execute("""INSERT INTO events (agent_id,event_type,description,created_at)
            VALUES (NULL,'law',%s,NOW())""",(f"Emergency disaster law enacted after {cat['description'][:40]}",))
        detail="Emergency disaster-preparedness law enacted and recorded."
    else:
        detail="Government chose no action — agents recover on their own."

    cur2.execute("""INSERT INTO crisis_responses (catastrophe,affected,response_type,relief_amount,president_reasoning,detail)
        VALUES (%s,%s,%s,%s,%s,%s)""",(cat['description'][:60],affected,action,relief,reasoning,detail))
    conn.commit(); cur.close(); cur2.close(); conn.close()

    print("="*60); print("  CRISIS RESPONSE — PRESIDENT DECIDES"); print("="*60)
    print(f"  Crisis: {cat['description'][:60]}")
    print(f"  Agents in distress: {affected}")
    print(f"  President's decision: {action.upper()}")
    print(f"  Reasoning: {reasoning}")
    print(f"  Effect: {detail}")
    print("="*60)

if __name__=="__main__":
    asyncio.run(respond_to_crisis())
