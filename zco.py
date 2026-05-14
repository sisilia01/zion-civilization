import json
import os
import urllib.request
import hashlib
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

JUDGES = [
    {"name": "DeepSeek", "model": "deepseek/deepseek-chat-v3-0324"},
    {"name": "Gemini", "model": "google/gemini-2.0-flash-lite-001"},
    {"name": "Qwen", "model": "qwen/qwen-2.5-72b-instruct"},
]

def ask_judge(judge: dict, prompt: str) -> dict:
    """Один судья принимает решение"""
    try:
        data = json.dumps({
            "model": judge["model"],
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 150,
            "temperature": 0.7
        }).encode()

        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://zionciv.com",
                "X-Title": "ZION Consensus Oracle"
            }
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            content = result["choices"][0]["message"]["content"]
            
            import re
            match = re.search(r'\{.*?\}', content, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
                return {
                    "judge": judge["name"],
                    "decision": parsed.get("decision", "rest"),
                    "confidence": float(parsed.get("confidence", 0.5)),
                    "reasoning": parsed.get("reasoning", "")[:100],
                    "status": "voted"
                }
    except Exception as e:
        print(f"Judge {judge['name']} error: {e}")
    
    return {
        "judge": judge["name"],
        "decision": "rest",
        "confidence": 0.0,
        "reasoning": "timeout",
        "status": "failed"
    }

def reach_consensus(votes: list) -> dict:
    """Считаем консенсус из голосов судей"""
    valid_votes = [v for v in votes if v["status"] == "voted"]
    
    if not valid_votes:
        return {"decision": "rest", "method": "fallback", "agreement": 0}
    
    # Считаем голоса по решениям
    tally = {}
    for vote in valid_votes:
        d = vote["decision"]
        if d not in tally:
            tally[d] = []
        tally[d].append(vote["confidence"])
    
    # Находим победителя
    best_decision = max(tally, key=lambda d: (len(tally[d]), sum(tally[d])))
    best_votes = tally[best_decision]
    
    agreement = len(best_votes) / len(valid_votes)
    avg_confidence = sum(best_votes) / len(best_votes)
    
    method = "consensus" if len(best_votes) >= 2 else "highest_confidence"
    
    return {
        "decision": best_decision,
        "method": method,
        "agreement": round(agreement, 2),
        "avg_confidence": round(avg_confidence, 2),
        "votes_for": len(best_votes),
        "total_votes": len(valid_votes)
    }

def generate_consensus_hash(agent_name: str, consensus: dict, votes: list) -> str:
    """Генерируем хэш консенсуса для верификации"""
    data = json.dumps({
        "agent": agent_name,
        "decision": consensus["decision"],
        "votes": [{v["judge"]: v["decision"]} for v in votes],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }, sort_keys=True)
    return hashlib.sha256(data.encode()).hexdigest()[:16]

def zco_agent_decision(agent_name: str, agent_class: str, balance: float, context: str) -> dict:
    """
    ZION CONSENSUS ORACLE — три судьи голосуют параллельно
    """
    prompt = f"""You are judging what {agent_name} (class: {agent_class}, balance: {balance:.1f} ZION) should do.

Situation: {context}

Available actions: work, pray, join_clan, place_bet, rest, rebel

Respond ONLY as JSON (no other text):
{{"decision": "work", "confidence": 0.85, "reasoning": "brief reason"}}"""

    # Запускаем всех судей ПАРАЛЛЕЛЬНО
    votes = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(ask_judge, judge, prompt): judge for judge in JUDGES}
        for future in as_completed(futures):
            votes.append(future.result())

    # Считаем консенсус
    consensus = reach_consensus(votes)
    
    # Генерируем хэш для верификации
    consensus_hash = generate_consensus_hash(agent_name, consensus, votes)

    return {
        "agent": agent_name,
        "decision": consensus["decision"],
        "consensus": consensus,
        "votes": votes,
        "consensus_hash": f"ZCO-{consensus_hash}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "powered_by": "ZION Consensus Oracle v1.0"
    }
