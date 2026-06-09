#!/usr/bin/env python3
"""
ZION Academy — Corporate Political Economy analysis (Track I extension).
Studies the capital-vs-labor-vs-state conflict: hiring concentration,
talent wars, corporate failure, lobbying, and court outcomes — as emergent
institutional dynamics of an AI society. Peer-reviewed by Tribunal.
"""
import psycopg2, psycopg2.extras, json, asyncio, httpx
from decimal import Decimal
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key
from walrus import store_blob, WALRUS_AGGREGATOR

KEY=get_openrouter_key()
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
TRIBUNAL={"judge_1":"deepseek/deepseek-chat-v3-0324","judge_2":"google/gemini-2.5-flash","judge_3":"meta-llama/llama-3.3-70b-instruct"}
def db(): return psycopg2.connect(**DB)
def jsafe(o):
    if isinstance(o,Decimal): return float(o)
    if isinstance(o,datetime): return o.isoformat()
    if isinstance(o,dict): return {k:jsafe(v) for k,v in o.items()}
    if isinstance(o,list): return [jsafe(x) for x in o]
    return o

def gather():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT COUNT(*) active, ROUND(AVG(treasury),0) avg_treasury, ROUND(SUM(zion_credit),0) total_debt FROM corporations WHERE is_active=true")
    corp=dict(cur.fetchone())
    cur.execute("SELECT COUNT(*) FROM corporations WHERE is_active=false")
    corp['bankrupt']=cur.fetchone()['count']
    cur.execute("SELECT COUNT(*) employed FROM agents WHERE employer_corp_id IS NOT NULL AND is_alive=true")
    corp['employed']=cur.fetchone()['employed']
    # hiring concentration: top corp share of employees
    cur.execute("""SELECT c.name, COUNT(a.id) emp FROM corporations c
        JOIN agents a ON a.employer_corp_id=c.id WHERE a.is_alive=true
        GROUP BY c.name ORDER BY emp DESC LIMIT 3""")
    corp['top_employers']=[dict(r) for r in cur.fetchall()]
    cur.execute("SELECT event_type, COUNT(*) n FROM corp_events GROUP BY event_type")
    corp['events']=[dict(r) for r in cur.fetchall()]
    cur.execute("SELECT verdict, COUNT(*) n FROM corp_lawsuits GROUP BY verdict")
    corp['lawsuits']=[dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsafe(corp)

async def review(model, hyp, ev):
    SYS="""You review a Track I finding about ZION's corporate political economy. Judge ONLY: supported by the data? reasoning sound? not overstated? Respond ONLY JSON: {"verdict":"validated"|"rejected","reason":"one sentence"}"""
    user=f"FINDING: {hyp}\nDATA: {json.dumps(ev)[:1500]}"
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":model,"messages":[{"role":"system","content":SYS},{"role":"user","content":user}],
                        "max_tokens":150,"response_format":{"type":"json_object"}})
                v=json.loads(r.json()["choices"][0]["message"]["content"])
                if v.get("verdict") in ("validated","rejected"): return v
        except: await asyncio.sleep(2)
    return {"verdict":"error","reason":"failed"}

async def main():
    ev=gather()
    top = ev['top_employers'][0]['emp'] if ev['top_employers'] else 0
    hyp=(f"ZION's corporate sector shows an emerging capital-labor structure: "
         f"{ev['active']} active firms employ {ev['employed']} agents on {ev['total_debt']} ZION of debt, "
         f"with the largest employer holding {top} workers. This is a measured snapshot of "
         f"institutional formation under economic pressure, not a causal claim.")
    print("="*60); print("  ACADEMY TRACK I — CORPORATE POLITICAL ECONOMY"); print("="*60)
    print(f"  {hyp}\n")
    results={}
    for name,model in TRIBUNAL.items():
        v=await review(model,hyp,ev)
        results[name]={"model":model,**v}
        print(f"  {name} ({model.split('/')[-1]}): {v.get('verdict','?').upper()} — {v.get('reason','')}")
    verdicts=[r["verdict"] for r in results.values()]
    validated=all(v=="validated" for v in verdicts)
    pkg={"type":"academy_finding","track":"I","title":"Corporate Institutional Formation",
         "hypothesis":hyp,"evidence":ev,"tribunal":results,
         "verdict":"validated" if validated else "not_validated","recorded_at":datetime.now(timezone.utc).isoformat()}
    res=store_blob(pkg,blob_type="academy_finding"); blob=res['blob_id'] if res else None
    conn=db(); cur=conn.cursor()
    cur.execute("""INSERT INTO academy_findings (track,title,hypothesis,evidence,status,tribunal_verdict,blob_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s)""",("I","Corporate Institutional Formation",hyp,
        json.dumps(ev),"validated" if validated else "rejected","validated" if validated else "rejected",blob))
    conn.commit(); cur.close(); conn.close()
    print(f"\n  >>> {'VALIDATED' if validated else 'Recorded as attempted'}")
    if blob: print(f"  Walrus: {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)

if __name__=="__main__": asyncio.run(main())
