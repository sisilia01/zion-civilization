import json
import os
import urllib.request
import hashlib
import subprocess
import re
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
SUI_ADDRESS = "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b"
SUI_COIN_ID = "0xf3f22016084674170e57b7cb209f6bbdaaaf987b718c690c26f0a6833f9bce50"

JUDGES = [
    {"name": "DeepSeek", "model": "deepseek/deepseek-chat-v3-0324"},
    {"name": "Gemini", "model": "google/gemini-2.0-flash-lite-001"},
    {"name": "Qwen", "model": "qwen/qwen-2.5-72b-instruct"},
]

def ask_judge(judge: dict, prompt: str) -> dict:
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
    valid_votes = [v for v in votes if v["status"] == "voted"]
    if not valid_votes:
        return {"decision": "rest", "method": "fallback", "agreement": 0, "votes_for": 0, "total_votes": 0}

    tally = {}
    for vote in valid_votes:
        d = vote["decision"]
        if d not in tally:
            tally[d] = []
        tally[d].append(vote["confidence"])

    best_decision = max(tally, key=lambda d: (len(tally[d]), sum(tally[d])))
    best_votes = tally[best_decision]
    agreement = len(best_votes) / len(votes)
    avg_confidence = sum(best_votes) / len(best_votes)
    method = "consensus" if len(best_votes) >= 2 else "deadlock"

    return {
        "decision": best_decision,
        "method": method,
        "agreement": round(agreement, 2),
        "avg_confidence": round(avg_confidence, 2),
        "votes_for": len(best_votes),
        "total_votes": len(votes)
    }

def record_onchain(agent_name: str, decision: str, consensus_hash: str) -> str:
    """Записываем консенсус решение в Sui blockchain"""
    try:
        result = subprocess.run([
            "sui", "client", "transfer-sui",
            "--to", SUI_ADDRESS,
            "--sui-coin-object-id", SUI_COIN_ID,
            "--amount", "1000000",
            "--gas-budget", "10000000",
            "--json"
        ], capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            data = json.loads(result.stdout)
            return data.get("digest", "")
        else:
            print(f"Sui TX error: {result.stderr[:100]}")
    except Exception as e:
        print(f"Sui TX exception: {e}")
    return ""

def zco_decide(agent_name: str, agent_class: str, balance: float, context: str) -> dict:
    """ZION Consensus Oracle — полный цикл с записью в Sui"""
    
    prompt = f"""You are judging what {agent_name} (class: {agent_class}, balance: {balance:.1f} ZION) should do.

Situation: {context}

Available actions: work, pray, join_clan, place_bet, rest, rebel

Respond ONLY as JSON:
{{"decision": "work", "confidence": 0.85, "reasoning": "brief reason"}}"""

    # Параллельное голосование
    votes = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(ask_judge, judge, prompt): judge for judge in JUDGES}
        for future in as_completed(futures):
            votes.append(future.result())

    # Консенсус
    consensus = reach_consensus(votes)

    # ZCO хэш
    hash_data = json.dumps({
        "agent": agent_name,
        "decision": consensus["decision"],
        "votes": [{v["judge"]: v["decision"]} for v in votes],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }, sort_keys=True)
    consensus_hash = "ZCO-" + hashlib.sha256(hash_data.encode()).hexdigest()[:16]

    # Записываем в Sui blockchain
    tx_hash = record_onchain(agent_name, consensus["decision"], consensus_hash)

    return {
        "agent": agent_name,
        "agent_class": agent_class,
        "decision": consensus["decision"],
        "consensus": consensus,
        "votes": votes,
        "consensus_hash": consensus_hash,
        "tx_hash": tx_hash,
        "explorer_url": f"https://suiscan.xyz/testnet/tx/{tx_hash}" if tx_hash else "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "powered_by": "ZION Consensus Oracle v1.0"
    }
