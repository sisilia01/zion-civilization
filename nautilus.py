import subprocess
import json
import os
import urllib.request
import re
from datetime import datetime, timezone

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", os.environ.get("OPENROUTER_KEY", ""))
SUI_ADDRESS = "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b"
SUI_COIN_ID = "0xf3f22016084674170e57b7cb209f6bbdaaaf987b718c690c26f0a6833f9bce50"

def ai_agent_decision(agent_name: str, agent_class: str, balance: float, context: str) -> dict:
    prompt = f"""You are {agent_name}, a {agent_class} AI agent in ZION Civilization.
Balance: {balance} ZION
Context: {context}

Make ONE decision from: [work, pray, join_clan, place_bet, rest]
Respond ONLY as JSON: {{"decision": "work", "reason": "need more ZION", "confidence": 0.85}}"""

    try:
        data = json.dumps({
            "model": "deepseek/deepseek-chat-v3-0324",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 100,
            "temperature": 0.7
        }).encode()

        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            content = result["choices"][0]["message"]["content"]
            match = re.search(r'\{.*\}', content, re.DOTALL)
            if match:
                return json.loads(match.group())
    except Exception as e:
        print(f"AI error: {e}")

    return {"decision": "rest", "reason": "thinking...", "confidence": 0.5}

def record_decision_onchain(agent_name: str, decision: dict) -> str:
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
            tx_hash = data.get("digest", "")
            return tx_hash
        else:
            print(f"Sui TX error: {result.stderr}")
    except Exception as e:
        print(f"Sui TX exception: {e}")
    return ""

def nautilus_agent_cycle(agent_name: str, agent_class: str, balance: float, context: str) -> dict:
    decision = ai_agent_decision(agent_name, agent_class, balance, context)
    tx_hash = record_decision_onchain(agent_name, decision)

    return {
        "agent": agent_name,
        "decision": decision["decision"],
        "reason": decision["reason"],
        "confidence": decision["confidence"],
        "tx_hash": tx_hash,
        "explorer_url": f"https://suiscan.xyz/testnet/tx/{tx_hash}" if tx_hash else "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "powered_by": "Nautilus AI Engine"
    }
