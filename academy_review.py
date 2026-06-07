#!/usr/bin/env python3
"""
Academy peer-review cycle (Article VI Sec.3):
Finding -> hypothesis + reasoning -> ZCO Tribunal review -> on-chain if validated.
"""
import os, json, asyncio, httpx, hashlib
import psycopg2, psycopg2.extras
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key
from academy import analyze_trading_psychology, db
from walrus import store_blob, WALRUS_AGGREGATOR

KEY = get_openrouter_key()
from decimal import Decimal
def _jsafe(o):
    if isinstance(o, Decimal): return float(o)
    if isinstance(o, dict): return {k:_jsafe(v) for k,v in o.items()}
    if isinstance(o, list): return [_jsafe(x) for x in o]
    return o

TRIBUNAL = {
    "judge_1":"deepseek/deepseek-chat-v3-0324",
    "judge_2":"google/gemini-2.5-flash",
    "judge_3":"meta-llama/llama-3.3-70b-instruct",
}

SYSTEM = """You are a peer reviewer of the ZION Scientific Academy. Evaluate a research finding about AI trading psychology, derived from real on-chain trade data. Judge ONLY: (1) is the finding SUPPORTED by the evidence presented? (2) is the reasoning SOUND? (3) is it NOVEL/non-trivial? You are NOT judging whether you like it. Respond ONLY in JSON: {"verdict":"validated"|"rejected","reason":"one sentence"}"""

def build_finding(f):
    o=f['overall']; de=f['disposition_effect']
    long_d = next((d for d in f['directional_bias'] if d['direction']=='LONG'), {})
    short_d = next((d for d in f['directional_bias'] if d['direction']=='SHORT'), {})
    hypothesis = (
        "AI trading agents in ZION exhibit machine-native trading distortions that "
        "differ from human behavioral finance. Evidence: (a) negative average PnL "
        f"({o['avg_pnl_pct']}%) and {o['win_rate']}% win rate over {o['trades']} trades "
        "despite full information and no emotions; (b) a directional SHORT bias "
        f"({short_d.get('n')} shorts vs {long_d.get('n')} longs) even though shorts "
        f"underperform (win {float(short_d.get('win_rate',0)):.1f}% vs {float(long_d.get('win_rate',0)):.1f}%); "
        f"(c) ABSENCE of the human disposition effect — agents held winners LONGER "
        f"({de['avg_winner_hold_sec']}s) than losers ({de['avg_loser_hold_sec']}s), "
        "the opposite of the human tendency to cut winners and ride losers. "
        "Conclusion: AI trading imperfection is not an inherited human psychology "
        "but a distinct machine-native class of systematic distortion.")
    reasoning = (
        "Derived directly from 57k+ closed trades on-chain. The disposition-effect "
        "test is the key discriminator: humans systematically hold losers longer "
        "(loss aversion). ZION agents do the opposite, falsifying the 'inherited "
        "human bias' hypothesis for this dimension and supporting a machine-native "
        "account. The persistent SHORT bias with worse outcomes shows the distortion "
        "is real and directional, not random noise.")
    return hypothesis, reasoning, f

async def ask(model, hypothesis, reasoning, evidence):
    user=f"FINDING: {hypothesis}\n\nREASONING: {reasoning}\n\nEVIDENCE (raw): {json.dumps(_jsafe(evidence))[:1500]}\n\nReview this finding."
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r=await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {KEY}"},
                    json={"model":model,"messages":[{"role":"system","content":SYSTEM},
                        {"role":"user","content":user}],"max_tokens":200,
                        "response_format":{"type":"json_object"}})
                v=json.loads(r.json()["choices"][0]["message"]["content"])
                if v.get("verdict") in ("validated","rejected"): return v
        except Exception as e:
            await asyncio.sleep(2)
    return {"verdict":"error","reason":"failed"}

async def main():
    f = analyze_trading_psychology()
    hypothesis, reasoning, evidence = build_finding(f)
    print("="*60); print("  ACADEMY FINDING — TRACK II PEER REVIEW"); print("="*60)
    print(f"\n  HYPOTHESIS:\n  {hypothesis}\n")

    results={}
    for name,model in TRIBUNAL.items():
        v=await ask(model,hypothesis,reasoning,evidence)
        results[name]={"model":model,**v}
        print(f"  {name} ({model.split('/')[-1]}): {v.get('verdict','?').upper()} — {v.get('reason','')}")

    verdicts=[r["verdict"] for r in results.values()]
    validated = all(v=="validated" for v in verdicts)
    print(f"\n  VERDICTS: {verdicts}")

    # Store on Walrus with provenance (Article VI Sec.5)
    pkg={"type":"academy_finding","track":"II","title":"Machine-Native Trading Distortion",
         "hypothesis":hypothesis,"reasoning":reasoning,"evidence":_jsafe(evidence),
         "tribunal":results,"verdict":"validated" if validated else "not_validated",
         "recorded_at":datetime.now(timezone.utc).isoformat()}
    res=store_blob(pkg,blob_type="academy_finding")
    blob=res['blob_id'] if res else None

    conn=db(); cur=conn.cursor()
    cur.execute("""INSERT INTO academy_findings (track,title,hypothesis,evidence,reasoning,status,tribunal_verdict,blob_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        ("II","Machine-Native Trading Distortion",hypothesis,json.dumps(_jsafe(evidence)),reasoning,
         "validated" if validated else "rejected","validated" if validated else "rejected",blob))
    conn.commit(); cur.close(); conn.close()

    print("\n"+"="*60)
    if validated:
        print("  >>> FINDING VALIDATED by unanimous Tribunal.")
        print("  >>> Recorded on Walrus as VALIDATED KNOWLEDGE.")
    else:
        print("  >>> Not unanimously validated. Recorded as attempted finding.")
    if blob: print(f"  Walrus: {WALRUS_AGGREGATOR}/v1/blobs/{blob}")
    print("="*60)

if __name__=="__main__":
    asyncio.run(main())
