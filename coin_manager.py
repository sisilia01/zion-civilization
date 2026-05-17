#!/usr/bin/env python3
"""
Автоматический менеджер монет для ZCO
Запрашивает faucet каждые 4 часа + мержит маленькие монеты
"""
import subprocess
import json
import logging
import urllib.request

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [COIN_MANAGER] %(message)s',
    handlers=[
        logging.FileHandler('/root/zion_backend/coin_manager.log'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

SUI_ADDRESS = "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b"
MERGE_THRESHOLD = 20

def get_coins():
    result = subprocess.run(["sui", "client", "gas", "--json"], capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return []
    try:
        return json.loads(result.stdout)
    except:
        return []

def request_faucet():
    log.info("Requesting faucet (every 4h regardless of balance)...")
    try:
        payload = json.dumps({"FixedAmountRequest": {"recipient": SUI_ADDRESS}}).encode()
        req = urllib.request.Request(
            "https://faucet.testnet.sui.io/v1/gas",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
            log.info(f"Faucet OK: {resp}")
    except Exception as e:
        log.warning(f"Faucet API failed: {e}")

def merge_coins():
    coins = get_coins()
    if len(coins) < MERGE_THRESHOLD:
        log.info(f"Only {len(coins)} coins, skip merge")
        return
    sorted_coins = sorted(coins, key=lambda c: int(c.get("mistBalance", 0)), reverse=True)
    primary = sorted_coins[0]["gasCoinId"]
    to_merge = [c["gasCoinId"] for c in sorted_coins[1:11] if int(c.get("mistBalance", 0)) > 0]
    log.info(f"Merging {len(to_merge)} coins into {primary[:8]}...")
    for coin_id in to_merge:
        subprocess.run([
            "sui", "client", "merge-coin",
            "--primary-coin", primary,
            "--coin-to-merge", coin_id,
            "--gas-budget", "3000000"
        ], capture_output=True, text=True, timeout=120)
    log.info("Merge done!")

if __name__ == "__main__":
    log.info("=== Coin Manager started ===")
    request_faucet()
    merge_coins()
    log.info("=== Done ===")
