#!/usr/bin/env python3
"""
Polymarket Gamma API sync — active + closed markets into polymarket_markets.
Runs every 2 hours via watchdog.
"""
import json
import time
import urllib.request
from datetime import datetime

import psycopg2
import psycopg2.extras

GAMMA_API = "https://gamma-api.polymarket.com"
POLYMARKET_API = GAMMA_API

# Priority order: crypto → politics → sports → economics → geopolitics → culture
CATEGORY_KEYWORDS = [
    (
        "crypto",
        [
            "bitcoin", "btc", "ethereum", "eth", "crypto", "token", "blockchain", "coin",
            "defi", "nft", "web3", "price", "solana", "sui", "bnb", "xrp", "doge", "altcoin",
        ],
    ),
    (
        "politics",
        [
            "election", "president", "presidential", "nomination", "vote", "senate", "congress",
            "republican", "democrat", "democratic", "trump", "biden", "governor", "minister",
            "party", "poll", "candidate", "primary", "ballot", "referendum", "coalition",
            # crime / legal / religion (not culture)
            "crime", "criminal", "murder", "trial", "convicted", "indictment", "prison",
            "felony", "guilty", "verdict", "prosecution", "weinstein", "harvey",
            "jesus", "christ", "messiah", "pope", "church", "religion", "bible", "gospel",
            "catholic", "evangelical", "impeach", "scandal",
        ],
    ),
    (
        "sports",
        [
            "nba", "nfl", "nhl", "mlb", "fifa", "tennis", "f1", "formula", "golf", "ufc", "mma",
            "championship", "league", "cup", "match", "game", "team", "player", "win", "season",
            "tournament", "esports", "gaming", "counter-strike", "dota", "lol", "valorant",
            "worlds", "major", "playoff",
        ],
    ),
    (
        "economics",
        [
            "stock", "gdp", "inflation", "fed", "interest rate", "nasdaq", "s&p", "s&p 500",
            "gold", "silver", "oil", "dollar", "euro", "recession", "economy", "trade",
            "tariff", "budget", "debt", "unemployment", "reserve", "treasury", "yield",
            "cpi", "jobs report", "earnings", "ipo",
            # tech → economics tab
            "tech", "technology", "semiconductor", "nvidia", "apple", "microsoft", "google",
            "meta", "amazon", "openai", "chatgpt", "artificial intelligence", "chip",
        ],
    ),
    (
        "geopolitics",
        [
            "war", "russia", "ukraine", "china", "taiwan", "nato", "military", "sanction",
            "nuclear", "missile", "treaty", "conflict", "invasion", "ceasefire",
            "middle east", "israel", "iran", "north korea", "territory",
        ],
    ),
    (
        "culture",
        [
            "oscar", "grammy", "emmy", "award", "music", "album", "artist", "movie", "film",
            "box office", "netflix", "spotify", "celebrity", "fashion", "viral", "tiktok",
            "youtube", "rihanna", "taylor", "beyonce", "kanye", "drake", "playboi", "rapper",
            "singer", "actor",
        ],
    ),
]

# Force politics before broad keyword passes (crime, religion, Weinstein, etc.)
POLITICS_FORCE = [
    "weinstein", "harvey weinstein", "jesus christ", "second coming", "messiah",
    "criminal case", "sexual assault", "rape charge", "indicted", "convicted of",
]

SKIP_SUBSTRINGS = [
    "set 1", "set 2", "map 1", "map 2", "game 1", "game 2",
    "spread:", "odd/even", "completed match", "1st half", "2nd half",
    "total kills", "total rounds", "exact score",
]


def get_db():
    return psycopg2.connect(
        host="localhost", database="zion_db", user="zion_user", password="zion2026"
    )


def ensure_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS polymarket_markets (
            market_id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'culture',
            yes_price INTEGER NOT NULL DEFAULT 50,
            no_price INTEGER NOT NULL DEFAULT 50,
            volume DOUBLE PRECISION NOT NULL DEFAULT 0,
            end_date TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT true,
            closed BOOLEAN NOT NULL DEFAULT false,
            winner TEXT,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("ALTER TABLE polymarket_markets ADD COLUMN IF NOT EXISTS closed BOOLEAN NOT NULL DEFAULT false")
    cur.execute("ALTER TABLE polymarket_markets ADD COLUMN IF NOT EXISTS winner TEXT")
    cur.execute("ALTER TABLE polymarket_markets ADD COLUMN IF NOT EXISTS image_url TEXT")


def categorize(question: str) -> str:
    q = (question or "").lower()
    if any(kw in q for kw in POLITICS_FORCE):
        return "politics"
    for cat, keywords in CATEGORY_KEYWORDS:
        if any(kw in q for kw in keywords):
            return cat
    return "geopolitics"


def fetch_markets(active: bool, limit: int) -> list:
    closed = "false" if active else "true"
    url = (
        f"{GAMMA_API}/markets?active={'true' if active else 'false'}"
        f"&limit={limit}&closed={closed}"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ZionBet/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"  Fetch error ({'active' if active else 'closed'}): {e}")
        return []


def parse_prices(m: dict) -> tuple[int, int]:
    try:
        raw = m.get("outcomePrices") or "[0.5,0.5]"
        prices = json.loads(raw) if isinstance(raw, str) else raw
        yes = round(float(prices[0]) * 100)
        yes = max(1, min(99, yes))
        return yes, 100 - yes
    except Exception:
        return 50, 50


def parse_end_date(m: dict):
    for field in ("endDate", "end_date_iso", "endDateIso"):
        val = m.get(field)
        if not val:
            continue
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except Exception:
            pass
    return None


def parse_winner(m: dict) -> str | None:
    if not m.get("closed"):
        return None
    idx = m.get("winnerIndex")
    if idx is None:
        return None
    try:
        i = int(idx)
        if i == 0:
            return "YES"
        if i == 1:
            return "NO"
    except (TypeError, ValueError):
        pass
    return None


def parse_image_url(m: dict) -> str | None:
    """Gamma API: image, icon, or featuredImage on market or nested event."""
    url = m.get("image") or m.get("icon") or m.get("featuredImage")
    if not url:
        events = m.get("events")
        if isinstance(events, list) and events and isinstance(events[0], dict):
            ev = events[0]
            url = ev.get("image") or ev.get("icon") or ev.get("featuredImage")
    if not url:
        return None
    url = str(url).strip()
    if url.startswith(("http://", "https://")):
        return url
    return None


def build_question(m: dict) -> str:
    q = (m.get("question") or "").strip()
    sub = (m.get("groupItemTitle") or "").strip()
    if sub and sub.lower() not in q.lower():
        return f"{q} — {sub}"
    return q or sub or "Unknown market"


def is_usable(m: dict, active: bool) -> bool:
    q = build_question(m).lower()
    if len(q) < 12:
        return False
    if any(s in q for s in SKIP_SUBSTRINGS):
        return False
    if active:
        yes, _ = parse_prices(m)
        if yes >= 97 or yes <= 3:
            return False
    return True


def upsert_market(cur, m: dict, active_batch: bool):
    raw_id = str(m.get("id", "")).strip()
    if not raw_id:
        return False
    market_id = f"poly-{raw_id}"
    question = build_question(m)
    yes, no = parse_prices(m)
    vol = float(m.get("volume") or 0)
    end_date = parse_end_date(m)
    closed = bool(m.get("closed"))
    winner = parse_winner(m)
    category = categorize(question)
    is_active = active_batch and not closed
    image_url = parse_image_url(m)

    cur.execute(
        """
        INSERT INTO polymarket_markets (
            market_id, question, category, yes_price, no_price, volume,
            end_date, is_active, closed, winner, image_url, synced_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (market_id) DO UPDATE SET
            question = EXCLUDED.question,
            category = EXCLUDED.category,
            yes_price = EXCLUDED.yes_price,
            no_price = EXCLUDED.no_price,
            volume = EXCLUDED.volume,
            end_date = EXCLUDED.end_date,
            image_url = COALESCE(EXCLUDED.image_url, polymarket_markets.image_url),
            is_active = EXCLUDED.is_active,
            closed = EXCLUDED.closed,
            winner = EXCLUDED.winner,
            synced_at = NOW()
        """,
        (market_id, question, category, yes, no, vol, end_date, is_active, closed, winner, image_url),
    )
    return True


def backfill_image_url(cur, m: dict) -> bool:
    """Update image_url for any existing row when Gamma returns an image."""
    raw_id = str(m.get("id", "")).strip()
    if not raw_id:
        return False
    image_url = parse_image_url(m)
    if not image_url:
        return False
    market_id = f"poly-{raw_id}"
    cur.execute(
        """
        UPDATE polymarket_markets
        SET image_url = %s, synced_at = NOW()
        WHERE market_id = %s
        """,
        (image_url, market_id),
    )
    return cur.rowcount > 0


def backfill_missing_images(cur, conn):
    """Fetch image_url for markets that don't have one yet."""
    cur.execute(
        """
        SELECT market_id FROM polymarket_markets
        WHERE image_url IS NULL AND is_active = true
        LIMIT 200
        """
    )
    rows = cur.fetchall()
    if not rows:
        return

    updated = 0
    for row in rows:
        market_id = row["market_id"]
        numeric_id = market_id.replace("poly-", "")
        try:
            url = f"{POLYMARKET_API}/markets/{numeric_id}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                m = json.loads(resp.read())
                image = parse_image_url(m)
                if image:
                    cur.execute(
                        "UPDATE polymarket_markets SET image_url = %s WHERE market_id = %s",
                        (image, market_id),
                    )
                    updated += 1
            time.sleep(0.1)
        except Exception:
            continue

    conn.commit()
    print(f"  Backfilled images: {updated}/{len(rows)}")


def sync():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_table(cur)
    conn.commit()

    cur.execute(
        "UPDATE polymarket_markets SET is_active = false WHERE synced_at < NOW() - INTERVAL '6 hours'"
    )
    cur.execute(
        "UPDATE polymarket_markets SET category = 'economics' WHERE category IN ('finance', 'tech')"
    )
    cur.execute("SELECT market_id, question FROM polymarket_markets WHERE category = 'events'")
    events_remapped = 0
    for row in cur.fetchall():
        new_cat = categorize(row["question"])
        cur.execute(
            "UPDATE polymarket_markets SET category = %s WHERE market_id = %s",
            (new_cat, row["market_id"]),
        )
        events_remapped += 1
    if events_remapped:
        print(f"  Re-categorized {events_remapped} legacy events rows (keyword logic)")

    active_markets = fetch_markets(active=True, limit=500)
    closed_markets = fetch_markets(active=False, limit=50)
    print(f"  Fetched {len(active_markets)} active, {len(closed_markets)} closed")

    synced = 0
    images_backfilled = 0
    for m in active_markets:
        if is_usable(m, active=True) and upsert_market(cur, m, active_batch=True):
            synced += 1
        if backfill_image_url(cur, m):
            images_backfilled += 1

    settled = 0
    for m in closed_markets:
        if upsert_market(cur, m, active_batch=False):
            settled += 1
        if backfill_image_url(cur, m):
            images_backfilled += 1

    if images_backfilled:
        print(f"  Backfilled/updated image_url on {images_backfilled} rows")

    cur.execute("""
        UPDATE polymarket_markets SET category = CASE
          WHEN question ILIKE ANY(ARRAY['%bitcoin%','%btc%','%ethereum%','%eth%','%solana%','%monero%','%crypto%','%token%','%coin%','%defi%','%fdv%','%airdrop%','%silver%','%gold%']) THEN 'economics'
          WHEN question ILIKE ANY(ARRAY['%premier league%','%epl%','%nba%','%nfl%','%tennis%','%f1%','%cup%','%relegated%']) THEN 'sports'
          WHEN question ILIKE ANY(ARRAY['%strike%','%iran%','%irgc%','%colombia%','%terrorist%','%nato%','%war%','%military%']) THEN 'geopolitics'
          WHEN question ILIKE ANY(ARRAY['%acquired%','%ipo%','%startup%','%company%','%lovable%']) THEN 'economics'
          ELSE 'geopolitics'
        END
        WHERE category = 'events'
    """)
    events_sql = cur.rowcount
    if events_sql:
        print(f"  SQL re-categorized {events_sql} remaining events rows")

    cur.execute(
        "SELECT market_id, question, category FROM polymarket_markets WHERE is_active = true"
    )
    recategorized = 0
    for row in cur.fetchall():
        new_cat = categorize(row["question"])
        if new_cat != row["category"]:
            cur.execute(
                "UPDATE polymarket_markets SET category = %s WHERE market_id = %s",
                (new_cat, row["market_id"]),
            )
            recategorized += 1
    if recategorized:
        print(f"  Re-categorized {recategorized} active markets (keyword priority)")

    conn.commit()
    print(f"\n✅ Synced {synced} active markets, {settled} closed/settled rows")

    cur.execute("""
        SELECT category, COUNT(*) AS cnt
        FROM polymarket_markets
        WHERE is_active = true AND closed = false
        GROUP BY category ORDER BY cnt DESC
    """)
    total = 0
    for row in cur.fetchall():
        print(f"  {row['category']:15} {row['cnt']}")
        total += row["cnt"]
    print(f"  {'TOTAL active':15} {total}")

    backfill_missing_images(cur, conn)

    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '') AS with_image,
            COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') AS without_image
        FROM polymarket_markets
        WHERE is_active = true AND closed = false
    """)
    img_row = cur.fetchone()
    if img_row:
        print(f"\n  Images: {img_row['with_image']} with image_url, {img_row['without_image']} without")

    cur.close()
    conn.close()


if __name__ == "__main__":
    print(f"🔄 Polymarket sync — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    sync()
