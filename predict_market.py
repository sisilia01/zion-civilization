#!/usr/bin/env python3
"""
ZION Predict Market — agents forecast real-world / market events.
A second arena (alongside perps) for studying AI decision-making:
here we study PROBABILITY CALIBRATION — how well AI agents estimate
likelihoods. Combined with trading, this maps the full picture of
artificial decision psychology.
"""
import os
import re
import random

import psycopg2
import psycopg2.extras
from datetime import datetime, timezone

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}


def db():
    return psycopg2.connect(**DB)


def get_pair_from_question(question: str) -> str | None:
    """Extract pair name from 'Will BTC be higher...' → 'BTC'."""
    if not question:
        return None
    m = re.search(r"Will\s+(\w+)\s+be\s+higher", question, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return None


def _resolve_crypto(cur, bet: dict) -> bool | None:
    pair = get_pair_from_question(bet.get("question") or "")
    if not pair:
        return None
    created_at = bet["created_at"]
    cur.execute(
        """
        SELECT AVG(entry_price) AS ref_price
        FROM agent_trades
        WHERE pair = %s
          AND opened_at BETWEEN %s - INTERVAL '5 minutes'
                            AND %s + INTERVAL '5 minutes'
        """,
        (pair, created_at, created_at),
    )
    ref_row = cur.fetchone()
    ref_price = ref_row.get("ref_price") if ref_row else None
    if ref_price is None:
        return None
    cur.execute(
        """
        SELECT AVG(entry_price) AS later_price
        FROM (
            SELECT entry_price
            FROM agent_trades
            WHERE pair = %s
              AND opened_at > %s + INTERVAL '1 hour'
            ORDER BY opened_at ASC
            LIMIT 10
        ) sub
        """,
        (pair, created_at),
    )
    later_row = cur.fetchone()
    later_price = later_row.get("later_price") if later_row else None
    if later_price is None:
        return None
    return float(later_price) > float(ref_price)


def _resolve_politics(cur, bet: dict) -> bool | None:
    question = (bet.get("question") or "").lower()
    if "approval above 50" in question or "retain approval" in question:
        cur.execute(
            "SELECT approval_rating FROM president_state WHERE is_active = true LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return None
        return int(row.get("approval_rating") or 0) > 50
    if "amendment pass" in question:
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM amendments
            WHERE status = 'enacted'
              AND created_at > %s - INTERVAL '7 days'
            """,
            (bet["created_at"],),
        )
        return int((cur.fetchone() or {}).get("c") or 0) > 0
    if "revolution pressure rise" in question:
        cur.execute(
            "SELECT COALESCE(revolution_meter, 0) AS m FROM civilization_state WHERE id = 1"
        )
        now_meter = float((cur.fetchone() or {}).get("m") or 0)
        cur.execute(
            "SELECT COALESCE(revolution_pressure, 0) AS p FROM crisis_state WHERE id = 1"
        )
        now_pressure = float((cur.fetchone() or {}).get("p") or 0)
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM events
            WHERE created_at > %s - INTERVAL '2 hours'
              AND created_at <= %s
              AND (
                event_type IN ('revolution', 'uprising', 'crisis')
                OR description ILIKE '%%revolution%%'
                OR description ILIKE '%%uprising%%'
              )
            """,
            (bet["created_at"], bet["created_at"]),
        )
        past_activity = int((cur.fetchone() or {}).get("c") or 0)
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM events
            WHERE created_at > %s
              AND (
                event_type IN ('revolution', 'uprising', 'crisis')
                OR description ILIKE '%%revolution%%'
                OR description ILIKE '%%uprising%%'
              )
            """,
            (bet["created_at"],),
        )
        since_bet = int((cur.fetchone() or {}).get("c") or 0)
        return now_meter > past_activity or now_pressure > 0 or since_bet > past_activity
    return None


def _resolve_economy(cur, bet: dict) -> bool | None:
    question = (bet.get("question") or "").lower()
    created_at = bet["created_at"]
    if "average agent wealth increase" in question or "wealth increase" in question:
        cur.execute(
            "SELECT avg_balance FROM economy_snapshots ORDER BY snapshot_at DESC LIMIT 1"
        )
        now_row = cur.fetchone()
        cur.execute(
            """
            SELECT avg_balance FROM economy_snapshots
            WHERE snapshot_at <= %s
            ORDER BY snapshot_at DESC LIMIT 1
            """,
            (created_at,),
        )
        past_row = cur.fetchone()
        if not now_row or not past_row:
            cur.execute("SELECT AVG(balance) AS avg_balance FROM agents WHERE is_alive = true")
            now_avg = float((cur.fetchone() or {}).get("avg_balance") or 0)
            cur.execute(
                """
                SELECT AVG(balance) AS avg_balance FROM agents
                WHERE is_alive = true OR died_at > %s
                """,
                (created_at,),
            )
            past_avg = float((cur.fetchone() or {}).get("avg_balance") or now_avg)
            return now_avg > past_avg
        return float(now_row["avg_balance"] or 0) > float(past_row["avg_balance"] or 0)
    if "poverty rate fall below 10" in question:
        cur.execute(
            "SELECT poverty_pct FROM economy_snapshots ORDER BY snapshot_at DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row and row.get("poverty_pct") is not None:
            return float(row["poverty_pct"]) < 10.0
        cur.execute(
            """
            SELECT COUNT(*) FILTER (WHERE class IN ('critical', 'poor')) * 100.0
                   / NULLIF(COUNT(*), 0) AS poverty_pct
            FROM agents WHERE is_alive = true
            """
        )
        pct = float((cur.fetchone() or {}).get("poverty_pct") or 100)
        return pct < 10.0
    if "more than 50 agents die" in question:
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM agents
            WHERE died_at > %s AND died_at <= NOW()
            """,
            (created_at,),
        )
        return int((cur.fetchone() or {}).get("c") or 0) > 50
    return None


def resolve_bet_outcome(cur, bet: dict) -> tuple[bool | None, bool]:
    """
    Resolve a bet against internal data.
    Returns (outcome, closed_early) where closed_early=True means unresolvable externally.
    """
    domain = (bet.get("event_type") or "").lower()
    if domain in ("sports", "external"):
        return None, True
    if domain == "crypto":
        outcome = _resolve_crypto(cur, bet)
        return outcome, False
    if domain == "politics":
        outcome = _resolve_politics(cur, bet)
        return outcome, False
    if domain == "economy":
        outcome = _resolve_economy(cur, bet)
        return outcome, False
    return None, True


# Prediction questions about near-term market direction (auto-resolvable)
def generate_questions(cur):
    qs = []
    # 1. Crypto markets (agents trade these)
    cur.execute("SELECT DISTINCT pair FROM agent_trades LIMIT 6")
    for (pair,) in cur.fetchall():
        qs.append(
            {
                "event_type": "crypto",
                "question": f"Will {pair} be higher in 1 hour?",
                "domain": "crypto",
            }
        )
    # 2. Civilization politics
    qs += [
        {
            "event_type": "politics",
            "question": "Will the current President retain approval above 50% this cycle?",
            "domain": "politics",
        },
        {
            "event_type": "politics",
            "question": "Will a new constitutional amendment pass this week?",
            "domain": "politics",
        },
        {
            "event_type": "politics",
            "question": "Will revolution pressure rise this cycle?",
            "domain": "politics",
        },
    ]
    # 3. Civilization economy
    qs += [
        {
            "event_type": "economy",
            "question": "Will average agent wealth increase this cycle?",
            "domain": "economy",
        },
        {
            "event_type": "economy",
            "question": "Will poverty rate fall below 10% this week?",
            "domain": "economy",
        },
        {
            "event_type": "economy",
            "question": "Will more than 50 agents die this cycle?",
            "domain": "economy",
        },
    ]
    # 4. Sports / external (placeholder external events)
    qs += [
        {
            "event_type": "sports",
            "question": "Will the favorite win the next major match?",
            "domain": "sports",
        },
        {
            "event_type": "external",
            "question": "Will a major market index close green today?",
            "domain": "external",
        },
    ]
    return qs


def _forecast_with_llm(agent_id: int, question: str, domain: str) -> bool | None:
    """LLM yes/no forecast with book-knowledge injection."""
    from agent_knowledge import apply_knowledge_to_decision
    from local_llm import generate_agent_text

    insights = apply_knowledge_to_decision(agent_id, context="forecasting")
    knowledge_block = ""
    if insights:
        knowledge_block = (
            f"Your accumulated knowledge from study:\n{insights}\n"
            "Apply relevant lessons to this forecast.\n\n"
        )

    prompt = (
        f"{knowledge_block}"
        f"Question: {question}\n"
        f"Domain: {domain}\n\n"
        "Will this resolve YES or NO? Respond with exactly YES or NO."
    )
    raw = (generate_agent_text(prompt, max_tokens=8) or "").strip().upper()
    if "YES" in raw and "NO" not in raw:
        return True
    if "NO" in raw:
        return False
    return None


def agents_predict(limit=300):
    """Active agents place forecasts. Their prediction is driven by intelligence:
    smarter agents are (hypothetically) better calibrated — a testable claim."""
    conn = db()
    cur = conn.cursor()
    qs = generate_questions(cur)
    if not qs:
        print("[predict] no market data for questions")
        cur.close()
        conn.close()
        return
    cur.execute(
        """
        SELECT id, intelligence, balance FROM agents
        WHERE is_alive = true AND balance > 10
        ORDER BY RANDOM() LIMIT %s
        """,
        (limit,),
    )
    agents = cur.fetchall()
    placed = 0
    for aid, intel, bal in agents:
        q = random.choice(qs)
        intel = intel or 5
        domain = q.get("domain", q["event_type"])
        prediction = _forecast_with_llm(aid, q["question"], domain)
        if prediction is None:
            prediction = random.random() < 0.5
        amount = round(min(float(bal) * 0.05, 20.0), 2)
        if amount < 1:
            continue
        cur.execute(
            """INSERT INTO bets (agent_id, event_type, question, amount, prediction, settled)
            VALUES (%s, %s, %s, %s, %s, false)""",
            (aid, q.get("domain", q["event_type"]), q["question"], amount, prediction),
        )
        placed += 1
    conn.commit()
    cur.close()
    conn.close()
    print(f"[predict] {placed} agent forecasts placed across {len(qs)} questions")


def settle_predictions():
    """Resolve due predictions against actual price movement and civilization state."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """ALTER TABLE bets ADD COLUMN IF NOT EXISTS closed_early BOOLEAN DEFAULT false"""
    )
    conn.commit()
    cur.execute(
        """SELECT id, agent_id, question, prediction, created_at, event_type FROM bets
        WHERE settled = false AND created_at < NOW() - INTERVAL '1 hour' LIMIT 500"""
    )
    due = cur.fetchall()
    settled = 0
    skipped = 0
    cur2 = conn.cursor()
    for b in due:
        outcome, closed_early = resolve_bet_outcome(cur, b)
        if closed_early:
            cur2.execute(
                """
                UPDATE bets SET settled = true, outcome = NULL, closed_early = true,
                    settled_at = NOW()
                WHERE id = %s
                """,
                (b["id"],),
            )
            settled += 1
            continue
        if outcome is None:
            skipped += 1
            continue
        cur2.execute(
            """
            UPDATE bets SET settled = true, outcome = %s, closed_early = false,
                settled_at = NOW()
            WHERE id = %s
            """,
            (outcome, b["id"]),
        )
        agent_id = b.get("agent_id")
        if agent_id and b["prediction"] == outcome:
            try:
                from agent_knowledge import reward_knowledge_merit

                reward_knowledge_merit(agent_id, "forecasting")
            except Exception:
                pass
        settled += 1
    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    print(f"[predict] {settled} predictions settled ({skipped} awaiting data)")


def calibration_report():
    """Track II-adjacent: how well-calibrated are AI agents' probability estimates?"""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT COUNT(*) n,
        COUNT(CASE WHEN prediction = outcome THEN 1 END) * 100.0
            / NULLIF(COUNT(*), 0) accuracy
        FROM bets WHERE settled = true AND outcome IS NOT NULL
          AND COALESCE(closed_early, false) = false"""
    )
    r = dict(cur.fetchone())
    cur.execute(
        """SELECT CASE WHEN a.intelligence >= 50 THEN 'high_int' ELSE 'low_int' END tier,
        COUNT(*) n,
        COUNT(CASE WHEN b.prediction = b.outcome THEN 1 END) * 100.0
            / NULLIF(COUNT(*), 0) acc
        FROM bets b JOIN agents a ON a.id = b.agent_id
        WHERE b.settled = true AND b.outcome IS NOT NULL
          AND COALESCE(b.closed_early, false) = false
        GROUP BY tier"""
    )
    tiers = [dict(x) for x in cur.fetchall()]
    cur.close()
    conn.close()
    print("=" * 50)
    print("  PREDICT MARKET — CALIBRATION")
    print("=" * 50)
    print(f"  Settled predictions: {r['n']}")
    print(f"  Overall accuracy: {float(r['accuracy'] or 0):.1f}%")
    for t in tiers:
        print(f"  {t['tier']}: {t['n']} preds, accuracy {float(t['acc'] or 0):.1f}%")
    print("=" * 50)


if __name__ == "__main__":
    import sys

    if "--settle" in sys.argv:
        settle_predictions()
    elif "--report" in sys.argv:
        calibration_report()
    else:
        agents_predict()
        settle_predictions()
        calibration_report()
