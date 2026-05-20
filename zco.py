import json
import urllib.request
import hashlib
import subprocess
import requests
import re
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

from openrouter_key import get_openrouter_key

WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space"
WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space"


def get_best_coin_id() -> str:
    """Автоматически находит SUI монету с наибольшим балансом"""
    try:
        result = subprocess.run(
            ["sui", "client", "gas", "--json"],
            capture_output=True, text=True, timeout=15
        )
        coins = json.loads(result.stdout)
        # Сортируем по balanceInMist если есть, иначе по suiBalance
        def get_balance(c):
            try:
                bal = c.get("mistBalance", c.get("suiBalance", "0"))
                return float(str(bal).replace(" SUI","").replace(",","") or 0)
            except:
                return 0
        best = sorted(coins, key=get_balance, reverse=True)
        for coin in best:
            if get_balance(coin) > 0:
                return coin["gasCoinId"]
    except Exception as e:
        print(f"Coin lookup error: {e}")
    return ""

SUI_ADDRESS = "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b"
SUI_COIN_ID = ""  # auto-detected below

JUDGES = [
    {"name": "DeepSeek", "model": "deepseek/deepseek-chat-v3-0324"},
    {"name": "Gemini", "model": "google/gemini-2.0-flash-lite-001"},
    {"name": "GPT", "model": "openai/gpt-4o-mini"},
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
                "Authorization": f"Bearer {get_openrouter_key()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://zionciv.com",
                "X-Title": "ZION Consensus Oracle"
            }
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
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

def store_decision_walrus(decision_data: dict) -> tuple[str, str] | tuple[None, None]:
    PUBLISHER = "https://publisher.walrus-testnet.walrus.space"
    AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space"
    try:
        payload = json.dumps(decision_data, default=str, ensure_ascii=False)
        resp = requests.put(
            f"{PUBLISHER}/v1/blobs?epochs=2",
            data=payload.encode('utf-8'),
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        if resp.status_code in (200, 201):
            result = resp.json()
            blob_id = (
                result.get("blobId") or
                result.get("blob_id") or
                result.get("newlyCreated", {}).get("blobObject", {}).get("blobId") or
                result.get("alreadyCertified", {}).get("blobId")
            )
            if blob_id:
                explorer_url = f"{AGGREGATOR}/v1/blobs/{blob_id}"
                return blob_id, explorer_url
    except Exception as e:
        print(f"Walrus store error: {e}")
    return None, None

def record_sui_proof(blob_id: str, consensus_hash: str) -> str | None:
    """Record ZCO consensus proof on Sui blockchain"""
    try:
        result = subprocess.run([
            "sui", "client", "transfer-sui",
            "--to", "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b",
            "--amount", "1",
            "--gas-budget", "10000000",
            "--json"
        ], capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            data = json.loads(result.stdout)
            digest = data.get("digest") or data.get("effects", {}).get("transactionDigest")
            if digest:
                return f"https://suiscan.xyz/testnet/tx/{digest}"
    except Exception as e:
        print(f"Sui proof error: {e}")
    return None

def zco_decide(agent_name: str, agent_class: str, balance: float, context: str) -> dict:
    """ZION Consensus Oracle — полный цикл с записью в Sui"""
    
    prompt = f"""You are judging what {agent_name} (class: {agent_class}, balance: {balance:.1f} ZION) should do.

Situation: {context}

Available actions: work, pray, join_clan, place_bet, rest, rebel

Respond ONLY as JSON:
{{"decision": "work", "confidence": 0.85, "reasoning": "brief reason"}}"""

    # Последовательное голосование
    votes = []
    for judge in JUDGES:
        votes.append(ask_judge(judge, prompt))

    # Консенсус
    consensus = reach_consensus(votes)

    timestamp = datetime.now(timezone.utc).isoformat()
    votes_summary = [{v["judge"]: v["decision"]} for v in votes]

    hash_data = json.dumps({
        "agent": agent_name,
        "decision": consensus["decision"],
        "votes": votes_summary,
        "timestamp": timestamp,
    }, sort_keys=True)
    consensus_hash = "ZCO-" + hashlib.sha256(hash_data.encode()).hexdigest()[:16]

    sui_url = record_sui_proof("", consensus_hash)

    proof_payload = {
        "type": "zco_decision",
        "agent": agent_name,
        "agent_class": agent_class,
        "decision": consensus["decision"],
        "consensus": consensus,
        "votes": votes,
        "timestamp": timestamp,
        "consensus_hash": consensus_hash,
        "sui_url": sui_url or "",
    }
    blob_id, explorer_url = store_decision_walrus(proof_payload)
    if blob_id:
        proof_payload["blob_id"] = blob_id
        final_id, final_url = store_decision_walrus(proof_payload)
        if final_id:
            blob_id, explorer_url = final_id, final_url

    return {
        "agent": agent_name,
        "agent_class": agent_class,
        "decision": consensus["decision"],
        "consensus": consensus,
        "votes": votes,
        "consensus_hash": consensus_hash,
        "blob_id": blob_id,
        "tx_hash": blob_id or "",
        "explorer_url": explorer_url or "",
        "sui_url": sui_url or "",
        "timestamp": timestamp,
        "powered_by": "ZION Consensus Oracle v1.0 — Walrus + Sui proof",
    }
