import subprocess
import json
import urllib.request
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
import time

PACKAGE = "0xa72560fc86cb9cbbe3755cf8f0bc69d72ed987dee0ed1a2dccf3b0b90d9d2b78"
ADMIN_CAP = "0x252e23431bbe8252e003e8c179f6dfafd8dcfefc068eb862fe329504f8391892"

MARKET_OBJECTS = {
    "btc_15m":   "0xe919326a4dcc86ec864d02dbb74e03a1fe68a6c75fe63b35614c710ef46fc3e2",
    "btc_1h":    "0x9a4d41099234c2440f9304bf97f9074da134bf717f83ca0bc10b4a739f0c6f0f",
    "btc_24h":   "0xb793080c46a464b6397c09004c2a844f667d373bdea34bf7a606e40201c6459a",
    "btc_7d":    "0x5eb0c489f1fab1b62c6471d69b71476c19385905f52da8c0e6bc6314087002f7",
    "eth_15m":   "0xa13f46cbbc7accd9476faca624a5699f68822e2c1654c6836b37a1a25281b9a2",
    "eth_1h":    "0xafb20c1cb3617c504edb266f7eea49676fd0f48098c8e42cbf6bef53b58c110a",
    "eth_24h":   "0x9646bcba74f372f6a92de1744ad261ca585403be00089eee86ae3e3b489f6af6",
    "sui_15m":   "0xcae3da89b633a4c7f251203490ae9e39de28ec67c31e988f89e399190eea5491",
    "sui_1h":    "0xd7a512b38dbc469b7704434a22275444cb52640c693e02fb5a1a89dac98a004c",
    "sui_24h":   "0xca3d4d349b6a8d0e50edeacf901dd24ba5e69b0ae0ce728f2b8e0d4fa50c38d5",
    "sui_7d":    "0xa9a44c27411fce1e121bf2f9b6ff7a071b6802caf5022b5fcfd13747839b17fb",
    "cetus_24h": "0x8d96356b4e732409c9ddf95d2ca7091ec27093f6f918e0c7d4ad4513545005ca",
    "walrus_24h":"0x3fad377d72b8bd7af81a069455c7278e895210cf1638674be7d3907b3eace2e5",
    "deep_7d":   "0x0cbb00e6f66d93e97b3b32fca6c3d266029525a49a72480986bc2ae5d09dcf0b",
}

CRYPTO_MARKETS = {
    "btc_15m":  {"cg_id": "bitcoin",        "minutes": 15},
    "btc_1h":   {"cg_id": "bitcoin",        "minutes": 60},
    "btc_24h":  {"cg_id": "bitcoin",        "minutes": 1440},
    "btc_7d":   {"cg_id": "bitcoin",        "minutes": 10080},
    "eth_15m":  {"cg_id": "ethereum",       "minutes": 15},
    "eth_1h":   {"cg_id": "ethereum",       "minutes": 60},
    "eth_24h":  {"cg_id": "ethereum",       "minutes": 1440},
    "sui_15m":  {"cg_id": "sui",            "minutes": 15},
    "sui_1h":   {"cg_id": "sui",            "minutes": 60},
    "sui_24h":  {"cg_id": "sui",            "minutes": 1440},
    "sui_7d":   {"cg_id": "sui",            "minutes": 10080},
    "cetus_24h":{"cg_id": "cetus-protocol", "minutes": 1440},
    "walrus_24h":{"cg_id":"walrus-protocol","minutes": 1440},
    "deep_7d":  {"cg_id": "deepbook",       "minutes": 10080},
}

def get_db():
    return psycopg2.connect(
        host="localhost", database="zion_db",
        user="zion_user", password="zion2026"
    )

def get_price_change(cg_id):
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd&include_24hr_change=true"
        req = urllib.request.Request(url, headers={"User-Agent": "ZION/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            return float(data[cg_id].get("usd_24h_change", 0) or 0)
    except Exception as e:
        print(f"Price error {cg_id}: {e}")
        return 0.0

def resolve_onchain(market_id, result):
    obj_id = MARKET_OBJECTS.get(market_id)
    if not obj_id:
        return False
    try:
        r = subprocess.run([
            "sui", "client", "call",
            "--package", PACKAGE,
            "--module", "zion_bet",
            "--function", "resolve_market",
            "--args", ADMIN_CAP, obj_id, "true" if result else "false",
            "--gas-budget", "10000000"
        ], capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            print(f"✅ Resolved {market_id} → {'YES' if result else 'NO'} on-chain")
            return True
        else:
            print(f"❌ {market_id} resolve failed: {r.stderr[:80]}")
            return False
    except Exception as e:
        print(f"❌ {market_id} error: {e}")
        return False

def settle_market(market_id, result):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE user_bets SET
            settled = true,
            outcome = %s,
            settled_at = NOW(),
            status = CASE WHEN prediction = %s THEN 'won' ELSE 'lost' END,
            payout = CASE WHEN prediction = %s THEN potential_payout ELSE 0 END
        WHERE market_id = %s AND settled = false
        RETURNING id, wallet_address, prediction, potential_payout
    """, (result, result, result, market_id))
    rows = cur.fetchall()
    conn.commit()
    cur.close()
    conn.close()
    
    winners = [r for r in rows if r[2] == result]
    print(f"   Settled {len(rows)} bets, {len(winners)} winners")
    for w in winners:
        print(f"   🏆 {w[1][:20]}... +{w[3]} SUI")
    return len(rows)

def run_settlement():
    print(f"\n{'='*50}")
    print(f"Settlement: {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}")
    
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    for market_id, config in CRYPTO_MARKETS.items():
        cur.execute("""
            SELECT id, prediction, entry_price, amount_sui, potential_payout, wallet_address
            FROM user_bets
            WHERE market_id = %s AND settled = false
            AND resolves_at < NOW()
        """, (market_id,))
        bets = cur.fetchall()
        
        if bets:
            print(f"\nSettling {market_id} ({len(bets)} bets)...")
            # Получаем текущую цену
            try:
                url = f"https://api.coingecko.com/api/v3/simple/price?ids={config['cg_id']}&vs_currencies=usd"
                req = urllib.request.Request(url, headers={"User-Agent": "ZION/1.0"})
                with urllib.request.urlopen(req, timeout=10) as r:
                    current_price = float(json.loads(r.read())[config["cg_id"]]["usd"])
            except:
                print(f"  Price fetch failed, skipping")
                continue
            
            for bet in bets:
                bet_id, prediction, entry_price, amount_sui, potential_payout, wallet = bet
                if entry_price and entry_price > 0:
                    # Сравниваем с ценой в момент ставки
                    result = current_price > float(entry_price)
                    print(f"  Entry: {entry_price} → Now: {current_price} → {'UP' if result else 'DOWN'}")
                else:
                    # Нет entry price — используем 24h change
                    change = get_price_change(config["cg_id"])
                    result = change > 0
                    print(f"  24h change: {change:.2f}% → {'YES' if result else 'NO'}")
                
                resolve_onchain(market_id, result)
                settle_market(market_id, result)
                break  # Один resolve на весь рынок
    
    # Цивилизационные
    cur.execute("""
        SELECT COUNT(*) FROM user_bets
        WHERE market_id = 'civ_deaths_24h' AND settled = false
        AND created_at < NOW() - INTERVAL '24 hours'
    """)
    if cur.fetchone()[0] > 0:
        cur.execute("SELECT deaths_today FROM stats ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        deaths = row["deaths_today"] if row else 0
        result = deaths > 50
        print(f"\nSettling civ_deaths_24h: {deaths} deaths → {'YES' if result else 'NO'}")
        resolve_onchain("civ_deaths_24h", result)
        settle_market("civ_deaths_24h", result)
    
    cur.close()
    conn.close()
    print("Done!")

if __name__ == "__main__":
    print("🏦 ZION Settlement Service")
    run_settlement()
    while True:
        time.sleep(900)  # каждые 15 минут
        run_settlement()
