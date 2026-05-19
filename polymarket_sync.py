#!/usr/bin/env python3
"""
Polymarket Gamma API sync — active + closed markets into polymarket_markets.
Fetches by Polymarket tag_id (official categories), not keyword matching.
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

# DB category -> Gamma tag slug (see GET /tags/slug/{slug})
CATEGORY_TAG_SLUGS = [
    ("geopolitics", "geopolitics"),
    ("politics", "politics"),
    ("sports", "sports"),
    ("crypto", "crypto"),
    ("economics", "economics"),
    ("culture", "pop-culture"),  # Polymarket slug is pop-culture, label "Culture"
]

ACTIVE_LIMIT_PER_TAG = 100
CLOSED_LIMIT_PER_TAG = 15

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


def gamma_get(path: str, timeout: int = 120) -> dict | list | None:
    url = f"{GAMMA_API}{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ZionBet/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  Gamma GET {path}: {e}")
        return None


def resolve_tag_ids() -> dict[str, int]:
    """Map DB category names to Gamma tag_id integers."""
    out: dict[str, int] = {}
    for category, slug in CATEGORY_TAG_SLUGS:
        data = gamma_get(f"/tags/slug/{slug}", timeout=30)
        if isinstance(data, dict) and data.get("id") is not None:
            out[category] = int(data["id"])
            print(f"  tag {slug:15} -> id {data['id']} ({category})")
        else:
            print(f"  WARNING: could not resolve tag slug {slug!r} for {category}")
    return out


def fetch_markets_by_tag(tag_id: int, active: bool, limit: int) -> list:
    closed = "false" if active else "true"
    path = (
        f"/markets?active={'true' if active else 'false'}"
        f"&closed={closed}&limit={limit}&tag_id={tag_id}"
    )
    data = gamma_get(path)
    return data if isinstance(data, list) else []


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


def upsert_market(cur, m: dict, category: str, active_batch: bool):
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

    print("  Resolving Polymarket tag IDs...")
    tag_ids = resolve_tag_ids()
    if not tag_ids:
        print("  ERROR: no tags resolved, aborting sync")
        cur.close()
        conn.close()
        return

    synced = 0
    settled = 0
    images_backfilled = 0
    seen_active: set[str] = set()

    for category, _slug in CATEGORY_TAG_SLUGS:
        tag_id = tag_ids.get(category)
        if tag_id is None:
            continue
        active_markets = fetch_markets_by_tag(tag_id, active=True, limit=ACTIVE_LIMIT_PER_TAG)
        closed_markets = fetch_markets_by_tag(tag_id, active=False, limit=CLOSED_LIMIT_PER_TAG)
        print(f"  {category:15} tag_id={tag_id}: {len(active_markets)} active, {len(closed_markets)} closed")

        for m in active_markets:
            raw_id = str(m.get("id", "")).strip()
            if not raw_id or raw_id in seen_active:
                continue
            if is_usable(m, active=True) and upsert_market(cur, m, category, active_batch=True):
                seen_active.add(raw_id)
                synced += 1
            if backfill_image_url(cur, m):
                images_backfilled += 1

        for m in closed_markets:
            if upsert_market(cur, m, category, active_batch=False):
                settled += 1
            if backfill_image_url(cur, m):
                images_backfilled += 1

        time.sleep(0.2)

    if images_backfilled:
        print(f"  Backfilled/updated image_url on {images_backfilled} rows")

    conn.commit()
    print(f"\n✅ Synced {synced} active markets ({len(seen_active)} unique), {settled} closed/settled rows")

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
