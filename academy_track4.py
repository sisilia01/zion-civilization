#!/usr/bin/env python3
"""
ZION Academy Track IV — Synthetic Decision Model (SDM).
Distills a FORMAL decision policy from the observed behavior of AI agents —
NOT a new neural network, and NOT 'AI without human trace' (impossible).
Instead: extract explicit decision rules from how ZION agents actually act,
identify where they systematically DIFFER from human heuristics, and evolve
this model weekly from Chronicle data. Honest, verifiable, novel.
"""
import os, json, asyncio, httpx
import psycopg2, psycopg2.extras
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from openrouter_key import get_openrouter_key
from walrus import store_blob, WALRUS_AGGREGATOR

KEY = get_openrouter_key()
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
TRIBUNAL = {"judge_1":"deepseek/deepseek-chat-v3-0324","judge_2":"google/gemini-2.5-flash","judge_3":"meta-llama/llama-3.3-70b-instruct"}
def db(): return psycopg2.connect(**DB)
def jsafe(o):
    if isinstance(o,Decimal): return float(o)
    if isinstance(o,datetime): return o.isoformat()
    if isinstance(o,dict): return {k:jsafe(v) for k,v in o.items()}
    if isinstance(o,list): return [jsafe(x) for x in o]
    return o

def ensure_table():
    conn=db(); cur=conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS decision_model (
        id SERIAL PRIMARY KEY, version INTEGER, rules JSONB,
        divergence_from_human TEXT, evidence JSONB, blob_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def extract_behavioral_evidence():
    """Mine observed AI-agent decision patterns from real data."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ev={}
    # Trading decision patterns
    cur.execute("""SELECT direction, COUNT(*) n, AVG(pnl_percent) avg_pnl,
        COUNT(CASE WHEN pnl>0 THEN 1 END)*100.0/COUNT(*) win_rate,
        AVG(EXTRACT(EPOCH FROM (closed_at-opened_at))) avg_hold
        FROM agent_trades WHERE status='CLOSED' GROUP BY direction""")
    ev['trading']=[dict(r) for r in cur.fetchall()]
    # Hold time: winners vs losers (disposition test)
    cur.execute("""SELECT
        AVG(CASE WHEN pnl>0 THEN EXTRACT(EPOCH FROM (closed_at-opened_at)) END) win_hold,
        AVG(CASE WHEN pnl<0 THEN EXTRACT(EPOCH FROM (closed_at-opened_at)) END) loss_hold
        FROM agent_trades WHERE status='CLOSED' AND closed_at IS NOT NULL""")
    ev['disposition']=dict(cur.fetchone())
    # Voting decision patterns by class
    cur.execute("""SELECT a.class, av.vote, COUNT(*) n FROM amendment_votes av
        JOIN agents a ON a.id=av.agent_id GROUP BY a.class, av.vote ORDER BY a.class""")
    ev['voting']=[dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsafe(ev)

async def synthesize_model(evidence, prev_version):
    """LLM distills evidence into explicit decision rules + human divergence.
    The LLM is an ANALYST here, formalizing patterns — not the model itself."""
    sys = """You are the ZION Synthetic Decision Model engine. Given observed behavioral data from AI agents, distill an EXPLICIT decision policy as concrete IF-THEN rules. CRITICAL RULES FOR SCIENTIFIC HONESTY: (1) Every rule must cite the specific number from the evidence it rests on. (2) For divergence from human heuristics, ONLY claim differences DIRECTLY supported by a data point; do NOT use loaded terms like 'hive-mind'; describe neutrally. (3) Do not generalize beyond what the sample shows. (4) State confidence as low unless the sample is large and unambiguous. divergence_from_human MUST be a single STRING, not an object. Respond ONLY in JSON: {"rules":["rule with its supporting number",...],"divergence_from_human":"a single string describing only evidence-backed differences, neutrally phrased","methodology":"one sentence on how rules were derived from the data","confidence":"low|medium|high"}"""
    user=f"OBSERVED EVIDENCE (real on-chain agent behavior):\n{json.dumps(evidence)[:2000]}\n\nDistill the decision policy and its divergence from human heuristics."
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":"deepseek/deepseek-chat-v3-0324",
                        "messages":[{"role":"system","content":sys},{"role":"user","content":user}],
                        "max_tokens":700,"response_format":{"type":"json_object"}})
                m=json.loads(r.json()["choices"][0]["message"]["content"])
                if m.get("rules"): return m
        except: await asyncio.sleep(2)
    return None

async def review(model, rules, divergence):
    SYS="""You review a Synthetic Decision Model distilled from AI-agent behavior. Judge ONLY: (1) are the rules GROUNDED in the evidence (not fabricated)? (2) is the claimed divergence from human heuristics ACCURATE and not overstated? You are guarding scientific honesty. Respond ONLY JSON: {"verdict":"sound"|"unsound","reason":"one sentence"}"""
    user=f"RULES: {json.dumps(rules)}\nCLAIMED DIVERGENCE FROM HUMAN: {divergence}"
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":model,"messages":[{"role":"system","content":SYS},{"role":"user","content":user}],
                        "max_tokens":150,"response_format":{"type":"json_object"}})
                v=json.loads(r.json()["choices"][0]["message"]["content"])
                if v.get("verdict") in ("sound","unsound"): return v
        except: await asyncio.sleep(2)
    return {"verdict":"error","reason":"failed"}

async def main():
    ensure_table()
    conn=db(); cur=conn.cursor()
    cur.execute("SELECT COALESCE(MAX(version),0) FROM decision_model"); pv=cur.fetchone()[0]
    cur.close(); conn.close()

    ev = extract_behavioral_evidence()
    print("="*60); print(f"  ACADEMY TRACK IV — SYNTHETIC DECISION MODEL v{pv+1}"); print("="*60)
    print("  Distilling decision policy from observed AI-agent behavior...")
    m = await synthesize_model(ev, pv)
    if not m: print("  Synthesis failed."); return
    print(f"\n  RULES ({m.get('confidence','?')} confidence):")
    for r in m['rules'][:8]: print(f"    - {r}")
    print(f"\n  DIVERGENCE FROM HUMAN:\n  {m['divergence_from_human']}\n")

    results={}
    for name,model in TRIBUNAL.items():
        v=await review(model,m['rules'],m['divergence_from_human'])
        results[name]={"model":model,**v}
        print(f"  {name} ({model.split('/')[-1]}): {v.get('verdict','?').upper()} — {v.get('reason','')}")
    verdicts=[r["verdict"] for r in results.values()]
    sound = sum(1 for v in verdicts if v=="sound")>=2

    pkg={"type":"synthetic_decision_model","version":pv+1,"rules":m['rules'],
         "divergence_from_human":m['divergence_from_human'],"confidence":m.get('confidence'),
         "evidence":ev,"tribunal":results,"soundness":"sound" if sound else "unsound",
         "disclaimer":"A formal decision policy distilled from observed AI-agent behavior. NOT a neural network, NOT free of human influence in the underlying models. It formalizes how ZION agents act and where that diverges from human heuristics.",
         "recorded_at":datetime.now(timezone.utc).isoformat()}
    res=store_blob(pkg,blob_type="decision_model"); blob=res['blob_id'] if res else None
    conn=db(); cur=conn.cursor()
    div_text = m['divergence_from_human'] if isinstance(m['divergence_from_human'],str) else json.dumps(m['divergence_from_human'])
    cur.execute("""INSERT INTO decision_model (version,rules,divergence_from_human,evidence,blob_id)
        VALUES (%s,%s,%s,%s,%s)""",(pv+1,json.dumps(m['rules']),div_text,json.dumps(ev),blob))
    conn.commit(); cur.close(); conn.close()
    print("\n"+"="*60)
    print(f"  >>> SDM v{pv+1} recorded (Tribunal: {'sound' if sound else 'needs work'})")
    if blob: print(f"  Walrus: {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)

if __name__=="__main__": asyncio.run(main())
