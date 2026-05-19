import json
import urllib.request
import hashlib
import subprocess
import re
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space"
WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space"

OPENROUTER_KEY = "REDACTED_KEY"


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
                "Authorization": f"Bearer {OPENROUTER_KEY}",
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

def store_decision_walrus(payload: dict) -> tuple[str | None, str | None]:
    """Store ZCO decision JSON on Walrus; return (blob_id, explorer_url)."""
    decision_json = json.dumps(payload, sort_keys=True, default=str)

    # Option 1a: Walrus CLI
    try:
        result = subprocess.run(
            ["walrus", "store", "--json", "-"],
            input=decision_json.encode(),
            capture_output=True,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            walrus_data = json.loads(result.stdout)
            blob_id = walrus_data.get("blobId") or walrus_data.get("blob_id")
            if blob_id:
                return blob_id, f"{WALRUS_AGGREGATOR}/v1/blobs/{blob_id}"
    except Exception as e:
        print(f"Walrus CLI store error: {e}")

    # Option 1b: HTTP publisher (same integration as walrus.py)
    try:
        req = urllib.request.Request(
            f"{WALRUS_PUBLISHER}/v1/blobs?epochs=2",
            data=decision_json.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                data = json.loads(resp.read())
                blob_info = data.get("newlyCreated", data.get("alreadyCertified", {}))
                blob_obj = blob_info.get("blobObject", {})
                blob_id = blob_obj.get("blobId") or blob_obj.get("blob_id")
                if blob_id:
                    return blob_id, f"{WALRUS_AGGREGATOR}/v1/blobs/{blob_id}"
    except Exception as e:
        print(f"Walrus HTTP store error: {e}")

    return None, None

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

    proof_payload = {
        "type": "zco_decision",
        "agent": agent_name,
        "agent_class": agent_class,
        "decision": consensus["decision"],
        "consensus": consensus,
        "votes": votes,
        "timestamp": timestamp,
        "consensus_hash": consensus_hash,
    }
    blob_id, explorer_url = store_decision_walrus(proof_payload)

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
        "timestamp": timestamp,
        "powered_by": "ZION Consensus Oracle v1.0 — Walrus proof",
    }
