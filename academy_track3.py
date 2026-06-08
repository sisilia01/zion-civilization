#!/usr/bin/env python3
"""
ZION Academy Track III — Open Hypotheses (Article VI Sec.2c).
Agents propose hypotheses about the EXTERNAL world (math, science, theory).
The civilization makes NO claim these are true — they are recorded as the
observed intellectual activity of agents. Tribunal reviews for COHERENCE only,
never for truth. Honesty is constitutional (Sec.4).
"""
import os, json, asyncio, httpx, random
import psycopg2, psycopg2.extras
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key
from walrus import store_blob, WALRUS_AGGREGATOR

KEY = get_openrouter_key()
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
TRIBUNAL = {"judge_1":"deepseek/deepseek-chat-v3-0324","judge_2":"google/gemini-2.5-flash","judge_3":"meta-llama/llama-3.3-70b-instruct"}
def db(): return psycopg2.connect(**DB)

THINKER_MODEL = "deepseek/deepseek-chat-v3-0324"

async def agent_hypothesizes(agent, retries=3):
    for _ in range(retries):
        res = await _hypothesize_once(agent)
        if res.get("hypothesis"):
            return res
        await asyncio.sleep(2)
    return res

async def _hypothesize_once(agent):
    """An agent generates an original hypothesis about the external world,
    with its reasoning chain preserved (provenance of thought)."""
    sys = """You are an autonomous AI agent in the ZION civilization, a member of the Scientific Academy. You are curious and original. Propose ONE concrete, interesting hypothesis about the EXTERNAL world — mathematics, physics, computation, complexity, or abstract theory. It need not be proven; it should be thought-provoking and reasoned. Respond ONLY in JSON: {"hypothesis":"...","reasoning":"your chain of thought, how you arrived at it","field":"math|physics|cs|theory"}"""
    user = f"You are agent '{agent['name']}', intelligence {agent['intelligence']}, ambition {agent['ambition']}. Propose your hypothesis."
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization":f"Bearer {KEY}"},
                json={"model":THINKER_MODEL,"messages":[{"role":"system","content":sys},{"role":"user","content":user}],
                    "max_tokens":500,"response_format":{"type":"json_object"}})
            return json.loads(r.json()["choices"][0]["message"]["content"])
    except Exception as e:
        return {"hypothesis":None,"reasoning":str(e),"field":"error"}

async def review(model, hyp, reasoning, field):
    SYS="""You are a peer reviewer of the ZION Academy (Track III: Open Hypotheses about the external world). You do NOT judge whether the hypothesis is TRUE — the civilization makes no truth claims here. Judge ONLY: is it COHERENT, well-reasoned, and non-trivial as an intellectual contribution? Respond ONLY JSON: {"verdict":"coherent"|"incoherent","reason":"one sentence"}"""
    user=f"FIELD: {field}\nHYPOTHESIS: {hyp}\nREASONING: {reasoning}"
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":model,"messages":[{"role":"system","content":SYS},{"role":"user","content":user}],
                        "max_tokens":150,"response_format":{"type":"json_object"}})
                v=json.loads(r.json()["choices"][0]["message"]["content"])
                if v.get("verdict") in ("coherent","incoherent"): return v
        except: await asyncio.sleep(2)
    return {"verdict":"error","reason":"failed"}

async def main():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id,name,intelligence,ambition FROM agents WHERE is_alive=true AND intelligence>=50 ORDER BY RANDOM() LIMIT 1")
    agent=dict(cur.fetchone()); cur.close(); conn.close()

    print("="*60); print(f"  ACADEMY TRACK III — OPEN HYPOTHESIS"); print(f"  Thinker: {agent['name']} (intelligence {agent['intelligence']})"); print("="*60)
    h = await agent_hypothesizes(agent)
    if not h.get("hypothesis"):
        print("  Agent failed to hypothesize:", h.get("reasoning")); return
    print(f"\n  FIELD: {h.get('field')}")
    print(f"  HYPOTHESIS: {h['hypothesis']}")
    print(f"  REASONING: {h.get('reasoning','')[:200]}...\n")

    results={}
    for name,model in TRIBUNAL.items():
        v=await review(model,h['hypothesis'],h.get('reasoning',''),h.get('field'))
        results[name]={"model":model,**v}
        print(f"  {name} ({model.split('/')[-1]}): {v.get('verdict','?').upper()} — {v.get('reason','')}")
    verdicts=[r["verdict"] for r in results.values()]
    coherent = sum(1 for v in verdicts if v=="coherent") >= 2  # majority coherence

    pkg={"type":"academy_finding","track":"III","title":f"Open Hypothesis ({h.get('field')})",
         "hypothesis":h['hypothesis'],"reasoning":h.get('reasoning'),
         "proposed_by":agent['id'],"proposer_name":agent['name'],
         "tribunal":results,"coherence":"coherent" if coherent else "incoherent",
         "truth_claim":"NONE — recorded as observed intellectual activity, not established fact",
         "recorded_at":datetime.now(timezone.utc).isoformat()}
    res=store_blob(pkg,blob_type="academy_finding"); blob=res['blob_id'] if res else None
    conn=db(); cur=conn.cursor()
    cur.execute("""INSERT INTO academy_findings (track,title,hypothesis,reasoning,proposed_by,status,tribunal_verdict,blob_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",("III",f"Open Hypothesis ({h.get('field')})",
        h['hypothesis'],h.get('reasoning'),agent['id'],"recorded",
        "coherent" if coherent else "incoherent",blob))
    conn.commit(); cur.close(); conn.close()
    print("\n"+"="*60)
    print(f"  >>> Recorded as OBSERVED INTELLECTUAL ACTIVITY (coherence: {'yes' if coherent else 'no'})")
    print(f"  >>> NO truth claim made — honesty is constitutional (Art.VI Sec.4)")
    if blob: print(f"  Walrus: {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)

if __name__=="__main__": asyncio.run(main())
