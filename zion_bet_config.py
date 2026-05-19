"""On-chain zion_bet package IDs and market helpers."""
import hashlib
import time

PACKAGE_ID = "0x5fe02e40df89feb516bf14ba8adf53375accf8365816b903c0fefd5a56a320f7"
BET_HOUSE = "0xe0791c693aa4727da9aa5450e4b3015e10e0488feefbde1619677717ba2aa43f"
BET_ADMIN_CAP = "0xb2b5883d02933b0fdea6b1ef4096267b515cd240f9ba2773754f487d5ce15922"
SUI_CLOCK = "0x6"

# Stable u64 IDs for crypto markets (create_market must use same IDs)
MARKET_ID_NUMERIC = {
    "btc_15m": 1001,
    "btc_1h": 1002,
    "btc_24h": 1003,
    "btc_7d": 1004,
    "eth_15m": 2001,
    "eth_1h": 2002,
    "eth_24h": 2003,
    "sui_15m": 3001,
    "sui_1h": 3002,
    "sui_24h": 3003,
    "sui_7d": 3004,
    "cetus_24h": 4001,
    "walrus_24h": 4002,
    "deep_7d": 4003,
    "civ_deaths_24h": 5001,
    "civ_election_24h": 5002,
    "civ_rebellion": 5003,
    "civ_clan_war": 5004,
    "civ_birth_auto": 5005,
}


def market_id_to_u64(market_id) -> int:
    if isinstance(market_id, int):
        return market_id
    key = str(market_id)
    if key in MARKET_ID_NUMERIC:
        return MARKET_ID_NUMERIC[key]
    digest = hashlib.sha256(key.encode()).digest()
    return int.from_bytes(digest[:8], "big")


def price_to_u64(price_usd: float) -> int:
    """USD price as integer cents (e.g. $95000.12 -> 9500012)."""
    return int(round(float(price_usd) * 100))


def exit_price_for_bool(entry_cents: int, up_wins: bool) -> int:
    """Synthetic exit price so UP/DOWN resolution matches a boolean outcome."""
    return entry_cents + 1 if up_wins else entry_cents - 1


def deadline_unix(minutes: int) -> int:
    return int(time.time()) + int(minutes) * 60
