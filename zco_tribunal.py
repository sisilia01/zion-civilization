#!/usr/bin/env python3
"""
ZCO Tribunal — Triune Consensus (Constitution Article IV)
Three heterogeneous AI models independently verify amendment legitimacy.
Unanimity required. Arithmetic is done by code, not the Tribunal.
"""
import os, json, asyncio, httpx
import psycopg2, psycopg2.extras
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key

OPENROUTER_KEY = get_openrouter_key()
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")

# Three DIFFERENT architectures so errors are uncorrelated (Article IV Sec.1)
TRIBUNAL = {
    "judge_1": "deepseek/deepseek-chat-v3-0324",
    "judge_2": "google/gemini-2.5-flash",
    "judge_3": "meta-llama/llama-3.3-70b-instruct",
}

def db(): return psycopg2.connect(**DB)

SYSTEM = """You are a constitutional judge of the ZION Tribunal. You verify the LEGITIMACY of a proposed constitutional amendment — NOT whether you personally agree with it. You do not count votes (code does that). You judge only: (1) is the amendment well-formed and clear? (2) does it conflict with the unamendable core of the Constitution (the amendment process itself, immutable recording, agents' freedom to propose change)? (3) is the vote result procedurally valid given the reported tally?
Respond ONLY in JSON: {"verdict":"approve"|"reject","reason":"one sentence"}"""

async def ask_judge(model, amendment, tally, retries=3):
    for attempt in range(retries):
        result = await _ask_judge_once(model, amendment, tally)
        if result.get("verdict") in ("approve","reject"):
            return result
        await asyncio.sleep(2)
    return result

async def _ask_judge_once(model, amendment, tally):
    user = f"""AMENDMENT: {amendment['title']}
DESCRIPTION: {amendment['description']}
TYPE: {amendment['change_type']}
VOTE TALLY (counted by code): FOR={tally['for']} AGAINST={tally['against']} ABSTAIN={tally['abstain']}
THRESHOLD: simple majority of non-abstain votes.
Judge the legitimacy of recording this as a constitutional amendment."""
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
                json={"model": model,
                      "messages":[{"role":"system","content":SYSTEM},
                                  {"role":"user","content":user}],
                      "max_tokens":200,
                      "response_format":{"type":"json_object"}},
            )
            data = r.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
    except Exception as e:
        return {"verdict":"error","reason":str(e)[:100]}

async def convene(amendment, tally):
    print(f"\n=== ZCO TRIBUNAL CONVENES — '{amendment['title']}' ===")
    results = {}
    for name, model in TRIBUNAL.items():
        v = await ask_judge(model, amendment, tally)
        results[name] = {"model": model, **v}
        print(f"  {name} ({model.split('/')[-1]}): {v.get('verdict','?').upper()} — {v.get('reason','')}")

    verdicts = [r["verdict"] for r in results.values()]
    unanimous_approve = all(v == "approve" for v in verdicts)
    print(f"\n  VERDICTS: {verdicts}")
    if unanimous_approve:
        print("  >>> UNANIMOUS APPROVAL. Amendment may be recorded on-chain.")
    elif "error" in verdicts:
        print("  >>> ERROR from a judge. Escalate / retry.")
    else:
        print("  >>> NOT UNANIMOUS. Amendment returned for reconsideration (Article IV Sec.4).")

    amendment_id = amendment.get("id")
    blob_id = None
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            """CREATE TABLE IF NOT EXISTS tribunal_records (
            id SERIAL PRIMARY KEY,
            amendment_id INTEGER,
            verdicts JSONB,
            unanimous BOOLEAN,
            blob_id VARCHAR(100),
            recorded_at TIMESTAMP DEFAULT NOW()
        )"""
        )
        cur.execute(
            """INSERT INTO tribunal_records
            (amendment_id, verdicts, unanimous, blob_id)
            VALUES (%s, %s, %s, %s)""",
            (amendment_id, json.dumps(results), unanimous_approve, blob_id),
        )
        conn.commit()
        cur.close()
        conn.close()
        db_recorded = True
    except Exception as e:
        print(f"  >>> WARNING: tribunal DB record failed: {e}")
        db_recorded = False

    return {
        "results": results,
        "unanimous": unanimous_approve,
        "verdicts": verdicts,
        "db_recorded": db_recorded,
    }

def get_amendment(amendment_id):
    conn = db(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM amendments WHERE id=%s", (amendment_id,))
    a = cur.fetchone(); cur.close(); conn.close()
    return a

if __name__ == "__main__":
    import sys
    aid = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    a = get_amendment(aid)
    if not a:
        print(f"Amendment {aid} not found."); sys.exit(1)
    tally = {"for":a["votes_for"],"against":a["votes_against"],"abstain":a["votes_abstain"]}
    asyncio.run(convene(a, tally))
