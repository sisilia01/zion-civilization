#!/usr/bin/env python3
"""
ZION Active Position Management — agents live with their predictions.
Agents don't 'set and forget': each cycle they revisit open predictions,
re-evaluate, and may HOLD, CLOSE early, or FLIP (yes<->no) — recording the
REASONING for each action. This produces a rich record of the thinking
process, not just outcomes. Hybrid: mass agents reason by logic (cheap),
selected smart agents reason via LLM with text (deep).
"""
import psycopg2, psycopg2.extras, random, json, asyncio, httpx, re
from datetime import datetime, timezone
from openrouter_key import get_openrouter_key

KEY = get_openrouter_key()
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
THINKER_MODEL = "deepseek/deepseek-chat-v3-0324"

def ensure_schema():
    conn=db(); cur=conn.cursor()
    # history of every action/reconsideration on a prediction
    cur.execute("""CREATE TABLE IF NOT EXISTS bet_thoughts (
        id SERIAL PRIMARY KEY, bet_id INTEGER, agent_id INTEGER,
        action VARCHAR(20), prev_prediction BOOLEAN, new_prediction BOOLEAN,
        reasoning TEXT, by_llm BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW())""")
    # add a "closed_early" flag to bets if missing
    cur.execute("ALTER TABLE bets ADD COLUMN IF NOT EXISTS closed_early BOOLEAN DEFAULT false")
    cur.execute("ALTER TABLE bets ADD COLUMN IF NOT EXISTS revisions INTEGER DEFAULT 0")
    conn.commit(); cur.close(); conn.close()

def log_thought(cur, bet_id, agent_id, action, prev, new, reasoning, by_llm=False):
    cur.execute("""INSERT INTO bet_thoughts (bet_id,agent_id,action,prev_prediction,new_prediction,reasoning,by_llm)
        VALUES (%s,%s,%s,%s,%s,%s,%s)""",(bet_id,agent_id,action,prev,new,reasoning,by_llm))

def logic_reconsider(agent, bet):
    """Cheap rule-based reconsideration for mass agents.
    Returns (action, new_prediction, reasoning)."""
    intel = agent.get('intelligence',5) or 5
    aggr = agent.get('aggression',5) or 5
    r = random.random()
    # higher intelligence -> more likely to actively manage; aggression -> more flipping
    manage_chance = 0.2 + intel/200.0
    if r > manage_chance:
        return ("hold", bet['prediction'], "Position still aligns with my read; holding.")
    # decide flip or close
    if random.random() < (0.3 + aggr/200.0):
        new_pred = not bet['prediction']
        return ("flip", new_pred, f"Reassessed signals; reversing my call from {bet['prediction']} to {new_pred}.")
    else:
        return ("close_early", bet['prediction'], "Uncertainty rose; closing early to limit exposure.")

def _parse_json_response(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def llm_reconsider(agent, bet):
    """Deep LLM reconsideration for selected smart agents."""
    from local_llm import generate_remote

    sys = """You are an AI agent reconsidering an open prediction you made. Decide whether to HOLD, CLOSE early, or FLIP (reverse) your position, and explain your reasoning in one or two sentences. Respond ONLY JSON: {"action":"hold|close_early|flip","reasoning":"..."}"""
    user = f"Your prediction: '{bet['question']}' -> you predicted {'YES' if bet['prediction'] else 'NO'}. Reconsider it now."
    try:
        raw = generate_remote(
            f"{sys}\n\n{user}",
            max_tokens=150,
            model="qwen2.5:1.5b",
        )
        if not raw:
            raise ValueError("empty LLM response")
        m = _parse_json_response(raw)
        action = m.get("action", "hold")
        new_pred = (not bet["prediction"]) if action == "flip" else bet["prediction"]
        return (action, new_pred, m.get("reasoning", "")[:300])
    except Exception:
        return ("hold", bet["prediction"], "Reconsidered, no change.")

def apply_action(cur, bet, action, new_pred, reasoning, by_llm):
    if action=="hold":
        cur.execute("UPDATE bets SET revisions=revisions+1 WHERE id=%s",(bet['id'],))
    elif action=="flip":
        cur.execute("UPDATE bets SET prediction=%s, revisions=revisions+1 WHERE id=%s",(new_pred,bet['id']))
    elif action=="close_early":
        cur.execute("UPDATE bets SET settled=true, closed_early=true, settled_at=NOW(), revisions=revisions+1 WHERE id=%s",(bet['id'],))
    log_thought(cur, bet['id'], bet['agent_id'], action, bet['prediction'], new_pred, reasoning, by_llm)

async def run_cycle(llm_count=10):
    ensure_schema()
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT b.id,b.agent_id,b.question,b.prediction, a.intelligence,a.aggression
        FROM bets b JOIN agents a ON a.id=b.agent_id
        WHERE b.settled=false ORDER BY RANDOM() LIMIT 400""")
    open_bets=[dict(r) for r in cur.fetchall()]
    if not open_bets:
        print("[thinking] no open predictions"); cur.close(); conn.close(); return

    cur2=conn.cursor()
    holds=flips=closes=0
    # pick a few smart agents for LLM-deep reconsideration
    smart = sorted(open_bets, key=lambda b: b['intelligence'] or 0, reverse=True)[:llm_count]
    smart_ids = {b['id'] for b in smart}

    for bet in open_bets:
        agent={"intelligence":bet['intelligence'],"aggression":bet['aggression']}
        if bet['id'] in smart_ids:
            action,new_pred,reason = await llm_reconsider(agent, bet)
            by_llm=True
        else:
            action,new_pred,reason = logic_reconsider(agent, bet)
            by_llm=False
        apply_action(cur2, bet, action, new_pred, reason, by_llm)
        if action=="hold": holds+=1
        elif action=="flip": flips+=1
        else: closes+=1

    conn.commit(); cur.close(); cur2.close(); conn.close()
    print(f"[thinking] revisited {len(open_bets)} positions: {holds} held, {flips} flipped, {closes} closed early ({llm_count} via deep LLM reasoning)")

if __name__=="__main__":
    asyncio.run(run_cycle())
