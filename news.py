#!/usr/bin/env python3
"""ZION News Wire — curate 5-10 headlines from recent events with priority tiers."""
import hashlib
import re
from datetime import datetime, timedelta

from civ_common import ensure_schema, get_conn, get_cursor, log_event

TIER_ORDER = {"breaking": 0, "urgent": 1, "normal": 2, "gossip": 3}
TARGET_MIN = 5
TARGET_MAX = 10
LOOKBACK_MINUTES = 35


def classify_tier(event_type: str, description: str, priority: str) -> str:
    if priority in TIER_ORDER:
        return priority
    desc = (description or "").lower()
    et = (event_type or "").lower()
    if any(
        w in desc
        for w in ("coup", "revolution", "bankrupt", "starvation", "mega qe", "crisis qe")
    ):
        return "breaking"
    if et in ("clan_war", "police", "president") or "attack" in desc or "raid" in desc:
        return "urgent"
    if et in ("gossip", "lottery"):
        return "gossip"
    return "normal"


def headline_hash(text: str) -> str:
    return hashlib.md5(re.sub(r"\d+\.?\d*", "N", text).encode()).hexdigest()[:16]


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n📰 ZION News Wire — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    since = datetime.now() - timedelta(minutes=LOOKBACK_MINUTES)
    cur.execute(
        """
        SELECT id, agent_id, event_type, description, zion_amount,
               COALESCE(priority, 'normal') AS priority, created_at
        FROM events
        WHERE created_at >= %s
          AND event_type NOT IN ('news', 'neo_prophecy')
        ORDER BY created_at DESC
        LIMIT 200
        """,
        (since,),
    )
    rows = cur.fetchall()

    seen = set()
    candidates = []
    for row in rows:
        tier = classify_tier(row["event_type"], row["description"], row["priority"])
        h = headline_hash(row["description"] or "")
        if h in seen:
            continue
        seen.add(h)
        candidates.append({**dict(row), "tier": tier, "sort": TIER_ORDER.get(tier, 2)})

    candidates.sort(key=lambda x: (x["sort"], -(float(x["zion_amount"] or 0))))

    published = 0
    for item in candidates[:TARGET_MAX]:
        if published >= TARGET_MAX:
            break
        impact = f"{item['event_type']}: {float(item['zion_amount'] or 0):.0f} ZION impact"
        tier = item["tier"]
        prefix = {"breaking": "🔴", "urgent": "🟠", "normal": "🟢", "gossip": "⚪"}.get(tier, "🟢")
        headline = f"{prefix} {item['description']}"

        log_event(
            cur,
            item["agent_id"],
            "news",
            headline,
            item["zion_amount"] or 0,
            priority=tier,
        )
        published += 1

    while published < TARGET_MIN and candidates:
        item = candidates[published % len(candidates)]
        log_event(
            cur,
            item["agent_id"],
            "news",
            f"🟢 {item['description']}",
            item["zion_amount"] or 0,
            priority="normal",
        )
        published += 1

    conn.commit()
    print(f"Published {published} news items (from {len(rows)} raw events)")
    print("✅ News cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
