#!/usr/bin/env python3
"""
ZION Corporate Court.
Corporations sue each other (poaching disputes, predatory acquisition, breach).
Three AI judges from ZRS hear the case and rule. Verdicts documented on-chain
(Walrus). Reuses the heterogeneous-tribunal principle for jurisprudence.
"""
import psycopg2, psycopg2.extras, random, json, asyncio, httpx
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key
from walrus import store_blob, WALRUS_AGGREGATOR

KEY = get_openrouter_key()
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
JUDGES = {"judge_1":"deepseek/deepseek-chat-v3-0324","judge_2":"google/gemini-2.5-flash","judge_3":"meta-llama/llama-3.3-70b-instruct"}
def db(): return psycopg2.connect(**DB)

def ensure_schema():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS corp_lawsuits (
        id SERIAL PRIMARY KEY, plaintiff_id INTEGER, defendant_id INTEGER,
        claim_type VARCHAR(40), description TEXT, verdict VARCHAR(20),
        ruling TEXT, judges JSONB, blob_id VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def find_dispute():
    """Find a real dispute from corp_events (e.g. a poaching) to litigate."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT ce.corp_id, ce.detail FROM corp_events ce
        WHERE ce.event_type='poach' ORDER BY ce.id DESC LIMIT 1""")
    poach=cur.fetchone()
    cur.execute("SELECT id,name FROM corporations WHERE is_active=true ORDER BY RANDOM() LIMIT 2")
    two=[dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    if poach and len(two)==2:
        return {"plaintiff":two[0],"defendant":two[1],"claim_type":"talent_poaching",
                "description":f"{two[0]['name']} sues {two[1]['name']} for predatory poaching of key trading talent, alleging unfair competition. Context: {poach['detail']}"}
    if len(two)==2:
        return {"plaintiff":two[0],"defendant":two[1],"claim_type":"unfair_competition",
                "description":f"{two[0]['name']} alleges {two[1]['name']} engaged in predatory pricing to drive it from the market."}
    return None

async def judge_rules(model, case):
    SYS="""You are an AI judge of the ZION Corporate Court (appointed by ZRS). Rule on a corporate dispute fairly under principles of fair competition. Decide for the PLAINTIFF or the DEFENDANT and give a brief legal rationale. Respond ONLY JSON: {"ruling":"plaintiff"|"defendant","rationale":"one sentence"}"""
    user=f"CASE TYPE: {case['claim_type']}\nFACTS: {case['description']}\nRule on this dispute."
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":model,"messages":[{"role":"system","content":SYS},{"role":"user","content":user}],
                        "max_tokens":150,"response_format":{"type":"json_object"}})
                v=json.loads(r.json()["choices"][0]["message"]["content"])
                if v.get("ruling") in ("plaintiff","defendant"): return v
        except: await asyncio.sleep(2)
    return {"ruling":"defendant","rationale":"insufficient evidence (default)"}

async def hold_trial():
    ensure_schema()
    case=find_dispute()
    if not case: print("No dispute to litigate."); return
    print("="*60); print("  ZION CORPORATE COURT"); print("="*60)
    print(f"  {case['plaintiff']['name']} (plaintiff) v. {case['defendant']['name']} (defendant)")
    print(f"  Claim: {case['claim_type']}\n  {case['description']}\n")

    results={}
    for name,model in JUDGES.items():
        v=await judge_rules(model,case)
        results[name]={"model":model,**v}
        print(f"  {name} ({model.split('/')[-1]}): for {v.get('ruling','?').upper()} — {v.get('rationale','')}")
    rulings=[r["ruling"] for r in results.values()]
    verdict = "plaintiff" if rulings.count("plaintiff")>=2 else "defendant"
    winner = case['plaintiff']['name'] if verdict=="plaintiff" else case['defendant']['name']

    pkg={"type":"corp_lawsuit","plaintiff":case['plaintiff']['name'],"defendant":case['defendant']['name'],
         "claim_type":case['claim_type'],"description":case['description'],"verdict":verdict,
         "winner":winner,"judges":results,"recorded_at":datetime.now(timezone.utc).isoformat()}
    res=store_blob(pkg,blob_type="corp_lawsuit"); blob=res['blob_id'] if res else None
    conn=db(); cur=conn.cursor()
    cur.execute("""INSERT INTO corp_lawsuits (plaintiff_id,defendant_id,claim_type,description,verdict,ruling,judges,blob_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",(case['plaintiff']['id'],case['defendant']['id'],
        case['claim_type'],case['description'],verdict,f"Court ruled for {winner}",json.dumps(results),blob))
    conn.commit(); cur.close(); conn.close()
    print(f"\n  >>> VERDICT: court rules for the {verdict.upper()} ({winner})")
    if blob: print(f"  Documented on-chain: {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)

if __name__=="__main__": asyncio.run(hold_trial())
