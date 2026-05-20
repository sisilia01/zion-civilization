#!/usr/bin/env python3
"""ZION News Wire — dynamic headlines from real DB events and state."""
import hashlib
import random
import re
from datetime import datetime, timedelta

from civ_common import (
    CRISIS_ZRS_MODES,
    ensure_schema,
    get_conn,
    get_cursor,
    get_revolution_meter,
    get_zrs_policy_mode,
    hungry_agent_pct,
    is_uprising_active,
    log_event,
)

TIER_ORDER = {"breaking": 0, "urgent": 1, "normal": 2, "gossip": 3}
TARGET_MIN = 5
TARGET_MAX = 10
LOOKBACK_MINUTES = 35

PROPHECIES = [
    "The ledger of ZION will judge the greedy.",
    "A child born today shall lead the markets tomorrow.",
    "When treasuries swell, the poor must not starve.",
    "Steel and faith together break the gangs.",
]


def headline_hash(text: str) -> str:
    return hashlib.md5(re.sub(r"\d+\.?\d*", "N", text).encode()).hexdigest()[:16]


def fetch_gang_war(cur):
    cur.execute(
        """
        SELECT e.description, e.zion_amount,
               c1.name AS clan1, c.name AS corp_name
        FROM events e
        LEFT JOIN clans c1 ON e.description ILIKE '%%' || c1.name || '%%'
        LEFT JOIN corporations c ON e.description ILIKE '%%' || c.name || '%%'
        WHERE e.created_at > NOW() - INTERVAL '%s minutes'
          AND (e.event_type = 'clan_war' OR e.description ILIKE '%%attacked%%')
        ORDER BY e.created_at DESC LIMIT 1
        """,
        (LOOKBACK_MINUTES,),
    )
    return cur.fetchone()


def fetch_revolution(cur):
    cur.execute(
        """
        SELECT agent_name, approval_rating FROM president_state WHERE is_active = true LIMIT 1
        """
    )
    pres = cur.fetchone()
    if not pres:
        return None
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND balance < 10
        """
    )
    rebels = int(cur.fetchone()["c"] or 0)
    cur.execute(
        "SELECT COALESCE(police_count, 0) AS p FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    police = int((cur.fetchone() or {}).get("p") or 0)
    if rebels > police * 2:
        return {
            "president_name": pres["agent_name"],
            "rebel_count": rebels,
            "police_count": police,
        }
    return None


def fetch_zrs_alert(cur):
    cur.execute(
        """
        SELECT state, action_taken, amount, news_headline
        FROM zrs_policy ORDER BY id DESC LIMIT 1
        """
    )
    return cur.fetchone()


def fetch_recent_events(cur):
    since = datetime.now() - timedelta(minutes=LOOKBACK_MINUTES)
    cur.execute(
        """
        SELECT id, agent_id, event_type, description, zion_amount,
               COALESCE(priority, 'normal') AS priority, created_at
        FROM events
        WHERE created_at >= %s AND event_type NOT IN ('news', 'neo_prophecy')
        ORDER BY created_at DESC
        LIMIT 200
        """,
        (since,),
    )
    return cur.fetchall()


def fetch_uprising(cur):
    if not is_uprising_active(cur):
        return None
    cur.execute(
        "SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND balance < 50"
    )
    rebels = int((cur.fetchone() or {}).get("c") or 0)
    return {"meter": get_revolution_meter(cur), "rebel_count": rebels}


def build_dynamic_headlines(cur) -> list[dict]:
    headlines = []

    up = fetch_uprising(cur)
    if up:
        headlines.append({
            "tier": "breaking",
            "text": (
                f"BREAKING: UPRISING BEGINS! {up['rebel_count']} citizens take to streets! "
                f"Revolution meter: {up['meter']}%"
            ),
            "agent_id": None,
            "amount": up["meter"],
        })
        headlines.append({
            "tier": "urgent",
            "text": "URGENT: Police divisions stretched thin — uprising drains SWAT and ANTI-TAX!",
            "agent_id": None,
            "amount": 0,
        })
        headlines.append({
            "tier": "urgent",
            "text": "URGENT: Corruption surges as ANTI-CORR officers reassigned to riot duty!",
            "agent_id": None,
            "amount": 0,
        })

    cur.execute(
        """
        SELECT description FROM events
        WHERE event_type = 'revolution' AND created_at > NOW() - INTERVAL '2 hours'
        ORDER BY created_at DESC LIMIT 3
        """
    )
    for ev in cur.fetchall():
        desc = ev["description"] or ""
        tier = "breaking" if "BREAKING" in desc else "urgent"
        headlines.append({"tier": tier, "text": desc, "agent_id": None, "amount": 0})

    rev = fetch_revolution(cur)
    if rev:
        headlines.append({
            "tier": "breaking",
            "text": (
                f"BREAKING: REVOLUTION: Citizens storm {rev['president_name']}'s palace! "
                f"{rev['rebel_count']} rebels vs {rev['police_count']} police!"
            ),
            "agent_id": None,
            "amount": 0,
        })

    hunger_pct = hungry_agent_pct(cur)
    if hunger_pct >= 10:
        headlines.append({
            "tier": "breaking",
            "text": f"BREAKING: ECONOMIC COLLAPSE: {hunger_pct:.0f}% agents cannot afford food!",
            "agent_id": None,
            "amount": hunger_pct,
        })
    elif hunger_pct >= 3:
        headlines.append({
            "tier": "normal",
            "text": f"NORMAL: Hunger spreading: {hunger_pct:.1f}% agents skipped meals today",
            "agent_id": None,
            "amount": 0,
        })

    zrs_mode = get_zrs_policy_mode(cur)
    if zrs_mode in CRISIS_ZRS_MODES:
        headlines.append({
            "tier": "urgent",
            "text": f"URGENT: Street crime surges as ZRS enters {zrs_mode} mode",
            "agent_id": None,
            "amount": 0,
        })

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND infected = true
        """
    )
    infected = int((cur.fetchone() or {}).get("c") or 0)
    if infected >= 5:
        headlines.append({
            "tier": "breaking",
            "text": f"BREAKING: EPIDEMIC spreading! {infected} agents infected!",
            "agent_id": None,
            "amount": infected,
        })

    cur.execute(
        """
        SELECT description FROM events
        WHERE event_type IN ('street_crime', 'catastrophe', 'zrs', 'corporation')
          AND created_at > NOW() - INTERVAL '2 hours'
        ORDER BY created_at DESC LIMIT 8
        """
    )
    for ev in cur.fetchall():
        desc = ev["description"] or ""
        if not desc:
            continue
        tier = "breaking" if "BREAKING" in desc else "urgent" if "URGENT" in desc else "normal"
        headlines.append({"tier": tier, "text": desc, "agent_id": None, "amount": 0})

    zrs = fetch_zrs_alert(cur)
    if zrs and zrs.get("state"):
        if zrs.get("action_taken") == "MEGA_INJECT":
            headlines.append({
                "tier": "breaking",
                "text": (
                    f"BREAKING: ZRS MEGA QE: {float(zrs.get('amount') or 0):,.0f} ZION injected — "
                    f"civilization saved!"
                ),
                "agent_id": None,
                "amount": float(zrs.get("amount") or 0),
            })
        headlines.append({
            "tier": "urgent",
            "text": (
                f"URGENT: ZRS ALERT: Economy enters {zrs['state']} mode. "
                f"{zrs.get('action_taken', 'Policy')}: {float(zrs.get('amount') or 0):,.0f} ZION!"
            ),
            "agent_id": None,
            "amount": float(zrs.get("amount") or 0),
        })

    cur.execute(
        """
        SELECT c.name AS corp_name,
               (SELECT COUNT(*) FROM agents a WHERE a.employer_corp_id = c.id AND a.is_alive = true) AS emp
        FROM corporations c
        WHERE c.is_active = false
        ORDER BY c.id DESC LIMIT 2
        """
    )
    for corp in cur.fetchall():
        headlines.append({
            "tier": "breaking",
            "text": (
                f"URGENT: Corp {corp['corp_name']} BANKRUPT! "
                f"{int(corp['emp'] or 0)} workers unemployed!"
            ),
            "agent_id": None,
            "amount": 0,
        })

    cur.execute(
        """
        SELECT s.agent_name AS sheriff_name, cl.name AS clan_name
        FROM events e
        JOIN sheriff_state s ON s.is_active = true
        JOIN clans cl ON e.description ILIKE '%%' || cl.name || '%%'
        WHERE e.event_type = 'police' AND e.created_at > NOW() - INTERVAL '1 hour'
        ORDER BY e.created_at DESC LIMIT 1
        """
    )
    raid = cur.fetchone()
    if raid:
        headlines.append({
            "tier": "urgent",
            "text": (
                f"URGENT: Sheriff {raid['sheriff_name']} raided {raid['clan_name']} hideout!"
            ),
            "agent_id": None,
            "amount": 0,
        })

    cur.execute(
        """
        SELECT a.name, a.balance, p.name AS parent_name
        FROM agents a
        LEFT JOIN agents p ON a.parent_id = p.id
        JOIN events e ON e.agent_id = a.id AND e.event_type = 'birth'
        WHERE e.created_at > NOW() - INTERVAL '%s minutes'
        ORDER BY e.created_at DESC LIMIT 3
        """,
        (LOOKBACK_MINUTES,),
    )
    for birth in cur.fetchall():
        headlines.append({
            "tier": "normal",
            "text": (
                f"New citizen {birth['name']} born to {birth['parent_name'] or 'unknown'} "
                f"with {float(birth['balance'] or 0):.0f} ZION"
            ),
            "agent_id": None,
            "amount": float(birth["balance"] or 0),
        })

    cur.execute(
        """
        SELECT name FROM agents
        WHERE is_alive = true AND education_status = 'graduated'
        ORDER BY id DESC LIMIT 2
        """
    )
    for grad in cur.fetchall():
        path = "university"
        cur.execute(
            "SELECT education_path FROM agents WHERE name = %s LIMIT 1",
            (grad["name"],),
        )
        row = cur.fetchone()
        if row and row.get("education_path") == "academy":
            path = "academy"
        role = "manager" if path == "university" else "police officer"
        headlines.append({
            "tier": "normal",
            "text": f"Agent {grad['name']} graduated {path} — now eligible for {role}",
            "agent_id": None,
            "amount": 0,
        })

    cur.execute(
        """
        SELECT a.name AS agent_name, c.name AS clan_name
        FROM agents a
        JOIN clans c ON a.clan_id = c.id
        WHERE a.is_alive = true AND a.clan_id IS NOT NULL
        ORDER BY RANDOM() LIMIT 2
        """
    )
    for g in cur.fetchall():
        headlines.append({
            "tier": "gossip",
            "text": (
                f"{g['agent_name']} joined {g['clan_name']}. "
                f"Aggression rising in the district."
            ),
            "agent_id": None,
            "amount": 0,
        })

    cur.execute(
        """
        SELECT name, faith, charisma FROM agents
        WHERE is_alive = true ORDER BY faith DESC LIMIT 1
        """
    )
    prophet = cur.fetchone()
    if prophet and int(prophet.get("charisma") or 0) > 5:
        headlines.append({
            "tier": "normal",
            "text": (
                f"Prophet {prophet['name']} speaks: "
                f"'{random.choice(PROPHECIES)}'"
            ),
            "agent_id": None,
            "amount": 0,
        })

    return headlines


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n📰 ZION News Wire — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    seen = set()
    published = 0
    candidates = []

    for item in build_dynamic_headlines(cur):
        h = headline_hash(item["text"])
        if h in seen:
            continue
        seen.add(h)
        candidates.append({**item, "sort": TIER_ORDER.get(item["tier"], 2)})

    for row in fetch_recent_events(cur):
        desc = row["description"] or ""
        tier = row["priority"] if row["priority"] in TIER_ORDER else "normal"
        if "BANKRUPT" in desc.upper():
            tier = "breaking"
        elif "ZRS" in desc.upper() or "REVOLUTION" in desc.upper():
            tier = "urgent"
        h = headline_hash(desc)
        if h in seen:
            continue
        seen.add(h)
        prefix = {"breaking": "BREAKING", "urgent": "URGENT", "normal": "NORMAL", "gossip": "GOSSIP"}.get(
            tier, "NORMAL"
        )
        candidates.append({
            "tier": tier,
            "text": f"{prefix}: {desc}",
            "agent_id": row["agent_id"],
            "amount": float(row["zion_amount"] or 0),
            "sort": TIER_ORDER.get(tier, 2),
        })

    candidates.sort(key=lambda x: (x["sort"], -x.get("amount", 0)))

    for item in candidates[:TARGET_MAX]:
        prefix_icon = {"breaking": "🔴", "urgent": "🟠", "normal": "🟢", "gossip": "⚪"}.get(
            item["tier"], "🟢"
        )
        log_event(
            cur,
            item.get("agent_id"),
            "news",
            f"{prefix_icon} {item['text']}",
            item.get("amount", 0),
            priority=item["tier"],
        )
        published += 1

    while published < TARGET_MIN and candidates:
        item = candidates[published % len(candidates)]
        log_event(
            cur,
            item.get("agent_id"),
            "news",
            f"🟢 {item['text']}",
            item.get("amount", 0),
            priority="normal",
        )
        published += 1

    conn.commit()
    print(f"Published {published} headlines")
    print("✅ News cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
