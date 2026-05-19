import json
import urllib.request
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
import time
import sys

from zion_bet_config import (
    PACKAGE_ID,
    BET_HOUSE,
    BET_ADMIN_CAP,
    market_id_to_u64,
    price_to_u64,
    exit_price_for_bool,
)
from sui_tx import sui_call

NETWORK_TIMEOUT = 15
SUI_TIMEOUT = 30
RUN_BUDGET_SEC = 60

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

_deadline = 0.0


def log(msg: str):
    print(msg, flush=True)


def time_left() -> float:
    return max(0.0, _deadline - time.monotonic())


def budget_exhausted(min_sec: float = 1.0) -> bool:
    return time_left() < min_sec


def get_db():
    return psycopg2.connect(
        host="localhost",
        database="zion_db",
        user="zion_user",
        password="zion2026",
        connect_timeout=5,
        options="-c statement_timeout=15000",
    )


def ensure_indexes(cur):
    try:
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_bets_settle
            ON user_bets (market_id, settled, resolves_at)
            WHERE settled = false
        """)
        cur.connection.commit()
    except Exception as e:
        log(f"Index ensure skipped: {e}")
        try:
            cur.connection.rollback()
        except Exception:
            pass


def fetch_url_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "ZION/1.0"})
    with urllib.request.urlopen(req, timeout=NETWORK_TIMEOUT) as r:
        return json.loads(r.read())


def get_price_change(cg_id):
    if budget_exhausted(5):
        return 0.0
    try:
        url = (
            f"https://api.coingecko.com/api/v3/simple/price"
            f"?ids={cg_id}&vs_currencies=usd&include_24hr_change=true"
        )
        data = fetch_url_json(url)
        return float(data[cg_id].get("usd_24h_change", 0) or 0)
    except Exception as e:
        log(f"Price error {cg_id}: {e}")
        return 0.0


def resolve_onchain(market_id, up_wins: bool, exit_price_usd: float | None = None):
    if budget_exhausted(SUI_TIMEOUT + 2):
        log(f"⏭️ {market_id} on-chain skipped (time budget)")
        return False
    sui_timeout = min(SUI_TIMEOUT, int(time_left()) - 1)
    if sui_timeout < 5:
        log(f"⏭️ {market_id} on-chain skipped (only {sui_timeout}s left)")
        return False
    try:
        market_u64 = market_id_to_u64(market_id)
        if exit_price_usd is not None:
            exit_u64 = price_to_u64(exit_price_usd)
        else:
            exit_u64 = exit_price_for_bool(100, up_wins)
        ok, out, digest = sui_call(
            PACKAGE_ID,
            "zion_bet",
            "resolve_market",
            [BET_ADMIN_CAP, BET_HOUSE, market_u64, exit_u64],
            timeout=sui_timeout,
        )
        if ok:
            log(f"✅ Resolved {market_id} exit={exit_u64} UP={'win' if up_wins else 'lose'} digest={digest}")
            return True
        log(f"❌ {market_id} resolve failed: {out[:120]}")
        return False
    except Exception as e:
        log(f"❌ {market_id} error: {e}")
        return False


def settle_market(conn, market_id, result):
    if budget_exhausted(2):
        log(f"⏭️ {market_id} DB settle skipped (time budget)")
        return 0
    try:
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

        winners = [r for r in rows if r[2] == result]
        log(f"   Settled {len(rows)} bets, {len(winners)} winners")
        for w in winners:
            log(f"   🏆 {w[1][:20]}... +{w[3]} SUI")
        return len(rows)
    except Exception as e:
        log(f"   DB settle error {market_id}: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return 0


def settle_civ_deaths(conn, market_id: str):
    if budget_exhausted(5):
        return
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT COUNT(*) as cnt FROM user_bets "
            "WHERE market_id = %s AND settled = false AND resolves_at < NOW()",
            (market_id,),
        )
        if cur.fetchone()["cnt"] == 0:
            cur.close()
            return

        cur.execute("SELECT deaths_today FROM stats ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        deaths = row["deaths_today"] if row else 0
        result = deaths > 50
        log(f"Deaths today: {deaths} > 50: {result}")
        resolve_onchain(market_id, result)
        settle_market(conn, market_id, result)
        cur.close()
    except Exception as e:
        log(f"civ_deaths error: {e}")


def settle_civ_election(conn, market_id: str):
    if budget_exhausted(5):
        return
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT COUNT(*) as cnt FROM user_bets "
            "WHERE market_id = %s AND settled = false AND resolves_at < NOW()",
            (market_id,),
        )
        if cur.fetchone()["cnt"] == 0:
            cur.close()
            return

        cur.execute("""
            SELECT COUNT(*) as cnt,
                   MAX(description) as desc
            FROM events
            WHERE event_type = 'election'
            AND created_at > NOW() - INTERVAL '24 hours'
        """)
        row = cur.fetchone()
        result = (row["cnt"] or 0) > 0
        log(f"Election happened: {result} - {row['desc']}")

        resolve_onchain(market_id, result)
        settle_market(conn, market_id, result)
        cur.close()
    except Exception as e:
        log(f"civ_election error: {e}")


def settle_civ_rebellion(conn, market_id: str):
    if budget_exhausted(5):
        return
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT COUNT(*) as cnt FROM user_bets "
            "WHERE market_id = %s AND settled = false AND resolves_at < NOW()",
            (market_id,),
        )
        if cur.fetchone()["cnt"] == 0:
            cur.close()
            return

        cur.execute("""
            SELECT COUNT(*) as cnt FROM events
            WHERE event_type = 'rebellion'
            AND created_at > NOW() - INTERVAL '7 days'
        """)
        result = (cur.fetchone()["cnt"] or 0) > 0
        log(f"Rebellion happened: {result}")

        resolve_onchain(market_id, result)
        settle_market(conn, market_id, result)
        cur.close()
    except Exception as e:
        log(f"civ_rebellion error: {e}")


def settle_civ_clan_war(conn, market_id: str):
    if budget_exhausted(5):
        return
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT COUNT(*) as cnt FROM user_bets "
            "WHERE market_id = %s AND settled = false AND resolves_at < NOW()",
            (market_id,),
        )
        if cur.fetchone()["cnt"] == 0:
            cur.close()
            return

        cur.execute("""
            SELECT clan_name, COUNT(*) as members
            FROM agents WHERE is_alive = true AND clan_name IS NOT NULL
            GROUP BY clan_name ORDER BY members DESC LIMIT 1
        """)
        row = cur.fetchone()
        result = row and "Golden Dawn" in (row["clan_name"] or "")
        log(f"Golden Dawn winning: {result}")

        resolve_onchain(market_id, result)
        settle_market(conn, market_id, result)
        cur.close()
    except Exception as e:
        log(f"civ_clan_war error: {e}")


def settle_civ_population(conn, market_id: str, threshold: int = 11000):
    if budget_exhausted(5):
        return
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT COUNT(*) as cnt FROM user_bets "
            "WHERE market_id = %s AND settled = false AND resolves_at < NOW()",
            (market_id,),
        )
        if cur.fetchone()["cnt"] == 0:
            cur.close()
            return

        cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
        population = cur.fetchone()["cnt"] or 0
        result = population >= threshold
        log(f"Population {population} >= {threshold}: {result}")

        resolve_onchain(market_id, result)
        settle_market(conn, market_id, result)
        cur.close()
    except Exception as e:
        log(f"civ_population error: {e}")


def generate_new_civ_markets():
    if budget_exhausted(5):
        return
    try:
        req = urllib.request.Request("http://localhost:8000/auto_markets", method="POST")
        with urllib.request.urlopen(req, timeout=NETWORK_TIMEOUT) as r:
            data = json.loads(r.read())
            if data.get("count", 0) > 0:
                log(f"✅ Generated {data['count']} new civilization markets")
    except Exception as e:
        log(f"Market generation error: {e}")


def run_settlement():
    global _deadline
    _deadline = time.monotonic() + RUN_BUDGET_SEC

    log(f"\n{'='*50}")
    log(f"Settlement: {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}")

    conn = None
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        ensure_indexes(cur)

        for market_id, config in CRYPTO_MARKETS.items():
            if budget_exhausted(5):
                log("⏭️ Crypto markets skipped (time budget)")
                break
            try:
                cur.execute("""
                    SELECT id, prediction, entry_price, amount_sui, potential_payout, wallet_address
                    FROM user_bets
                    WHERE market_id = %s AND settled = false
                    AND resolves_at < NOW()
                """, (market_id,))
                bets = cur.fetchall()
            except Exception as e:
                log(f"  Query error {market_id}: {e}")
                continue

            if not bets:
                continue

            log(f"\nSettling {market_id} ({len(bets)} bets)...")
            current_price = None
            try:
                url = (
                    f"https://api.coingecko.com/api/v3/simple/price"
                    f"?ids={config['cg_id']}&vs_currencies=usd"
                )
                data = fetch_url_json(url)
                current_price = float(data[config["cg_id"]]["usd"])
            except Exception:
                log("  Price fetch failed, skipping")
                continue

            for bet in bets:
                if budget_exhausted(SUI_TIMEOUT + 5):
                    log("  ⏭️ Remaining bets deferred (time budget)")
                    break
                bet_id, prediction, entry_price, amount_sui, potential_payout, wallet = bet
                if entry_price and entry_price > 0:
                    result = current_price > float(entry_price)
                    log(f"  Entry: {entry_price} → Now: {current_price} → {'UP' if result else 'DOWN'}")
                else:
                    change = get_price_change(config["cg_id"])
                    result = change > 0
                    log(f"  24h change: {change:.2f}% → {'YES' if result else 'NO'}")

                resolve_onchain(market_id, result, current_price)
                settle_market(conn, market_id, result)
                break

        settle_civ_deaths(conn, "civ_deaths_24h")
        settle_civ_election(conn, "civ_election_24h")
        settle_civ_rebellion(conn, "civ_rebellion")
        settle_civ_clan_war(conn, "civ_clan_war")
        settle_civ_population(conn, "civ_birth_auto", 11000)

        if not budget_exhausted(5):
            try:
                cur.execute("""
                    SELECT DISTINCT market_id FROM user_bets
                    WHERE settled = false AND resolves_at < NOW()
                    AND (
                        market_id LIKE 'auto_election%'
                        OR market_id LIKE 'auto_rebellion%'
                        OR market_id LIKE 'auto_clan_war%'
                    )
                """)
                for row in cur.fetchall():
                    if budget_exhausted(5):
                        break
                    market_id = row["market_id"]
                    if market_id.startswith("auto_election"):
                        settle_civ_election(conn, market_id)
                    elif market_id.startswith("auto_rebellion"):
                        settle_civ_rebellion(conn, market_id)
                    elif market_id.startswith("auto_clan_war"):
                        settle_civ_clan_war(conn, market_id)
            except Exception as e:
                log(f"Auto markets query error: {e}")

        generate_new_civ_markets()
        cur.close()
    except Exception as e:
        log(f"Settlement error: {e}")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    elapsed = RUN_BUDGET_SEC - time_left()
    log(f"Done! ({elapsed:.1f}s)")


if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)
    log("🏦 ZION Settlement Service")
    run_settlement()
    while True:
        for minute in range(15, 0, -1):
            time.sleep(60)
            log(f"💤 Next settlement in {minute} min...")
        run_settlement()
