#!/usr/bin/env python3
"""
Agent-autonomous party affiliation — agents start independent and choose later.

Influences: social class, books read (agent_knowledge), usefulness_score, balance.
"""
from __future__ import annotations

import random
import re
from datetime import datetime

from civ_common import get_conn, get_cursor, log_event
from political_parties import PARTIES

PARTY_INDEPENDENT = "independent"
MIN_AGE_DAYS = 7
CHOICE_BATCH_SIZE = 400
STAY_INDEPENDENT_BASE = 0.22
CHOICE_COMMIT_THRESHOLD = 0.18
INDEPENDENT_ABSTAIN_RATE = 0.35

CLASS_PARTY_SCORES: dict[str, tuple[float, float]] = {
    "elite": (1.0, 0.15),
    "rich": (0.85, 0.25),
    "middle": (0.45, 0.45),
    "working": (0.25, 0.75),
    "poor": (0.15, 0.90),
    "critical": (0.10, 0.95),
}

REFORM_TEXT = re.compile(
    r"communist|equality|equalit|redistribut|social.?justice|welfare|"
    r"basic.?income|workers?.?rights|poor|solidarity|das.?kapital|"
    r"manifesto|rights.?of.?man|utilitarian|social.?contract",
    re.I,
)
CONSENSUS_TEXT = re.compile(
    r"free.?market|wealth.?of.?nations|federalist|enterprise|"
    r"deregulat|libert|property.?rights|law.?and.?order|"
    r"antifragile|moral.?sentiments|on.?liberty|tradition|"
    r"fiscal.?disciplin|low.?tax",
    re.I,
)

REFORM_BOOK_HINTS = re.compile(
    r"communist|manifesto|das_kapital|rights_man|social_contract|"
    r"utilitarianism|republic_plato",
    re.I,
)
CONSENSUS_BOOK_HINTS = re.compile(
    r"wealth_of_nations|federalist|antifragile|on_liberty|"
    r"moral_sentiments|prince_machiavelli|spirit_laws",
    re.I,
)


def normalize_agent_party(raw: str | None) -> str:
    p = (raw or PARTY_INDEPENDENT).lower().strip()
    if p in PARTIES:
        return p
    if p in ("", "none", "null", PARTY_INDEPENDENT):
        return PARTY_INDEPENDENT
    return p


def class_party_scores(agent_class: str) -> tuple[float, float]:
    return CLASS_PARTY_SCORES.get(agent_class or "middle", (0.45, 0.45))


def balance_party_delta(balance: float) -> tuple[float, float]:
    bal = float(balance or 0)
    if bal >= 800:
        return (0.35, -0.10)
    if bal >= 300:
        return (0.15, 0.0)
    if bal < 50:
        return (-0.05, 0.25)
    if bal < 10:
        return (-0.10, 0.35)
    return (0.0, 0.0)


def score_reading_text(text: str, track: str | None) -> tuple[float, float]:
    """Return (consensus_add, reform_add) from book/insight text."""
    blob = text or ""
    track_u = (track or "").upper()
    c_add = 0.0
    r_add = 0.0

    if track_u == "ECONOMICS":
        c_add += 0.45
    elif track_u == "POLITICS":
        r_add += 0.15
        c_add += 0.10
    elif track_u == "ANTHROPOLOGY":
        r_add += 0.20

    if REFORM_TEXT.search(blob):
        r_add += 0.55
    if CONSENSUS_TEXT.search(blob):
        c_add += 0.55
    return c_add, r_add


def score_book_row(title: str, track: str | None, insight: str, usefulness: float) -> tuple[float, float]:
    title_blob = title or ""
    c, r = score_reading_text(f"{title_blob} {insight or ''}", track)
    if REFORM_BOOK_HINTS.search(title_blob):
        r += 0.70
    if CONSENSUS_BOOK_HINTS.search(title_blob):
        c += 0.70
    weight = max(0.15, min(2.0, 0.25 + float(usefulness or 0) / 20.0))
    return c * weight, r * weight


def compute_agent_party_affinity(
    agent: dict,
    readings: list[dict],
) -> tuple[float, float, str | None]:
    """
    Aggregate consensus/reform affinity for an agent.
    Returns (consensus_score, reform_score, top_book_title_for_log).
    """
    cls = agent.get("class") or "middle"
    c_score, r_score = class_party_scores(cls)
    bc, br = balance_party_delta(float(agent.get("balance") or 0))
    c_score += bc
    r_score += br

    top_title = None
    top_weight = 0.0
    for row in readings:
        title = row.get("title") or row.get("book_title") or "a book"
        track = row.get("track")
        insight = row.get("insight") or ""
        usefulness = float(row.get("usefulness_score") or 0)
        dc, dr = score_book_row(title, track, insight, usefulness)
        c_score += dc
        r_score += dr
        w = dc + dr
        if w > top_weight:
            top_weight = w
            top_title = title

    intel = float(agent.get("intelligence") or 10)
    c_score += intel / 200.0
    r_score += intel / 250.0

    return c_score, r_score, top_title


def fetch_agent_readings(cur, agent_id: int, limit: int = 12) -> list[dict]:
    cur.execute(
        """
        SELECT ak.track, ak.insight, COALESCE(ak.usefulness_score, 0) AS usefulness_score,
               COALESCE(b.title, '') AS title
        FROM agent_knowledge ak
        LEFT JOIN books b ON b.id = ak.book_id
        WHERE ak.agent_id = %s
        ORDER BY COALESCE(ak.usefulness_score, 0) DESC, ak.id DESC
        LIMIT %s
        """,
        (agent_id, limit),
    )
    return [dict(r) for r in cur.fetchall()]


def pick_party_from_affinity(
    c_score: float,
    r_score: float,
) -> str | None:
    """Probabilistic choice — may return None to stay independent."""
    if random.random() < STAY_INDEPENDENT_BASE:
        return None
    margin = abs(c_score - r_score)
    if margin < CHOICE_COMMIT_THRESHOLD:
        return None
    commit_prob = min(0.92, 0.45 + margin * 0.35)
    if random.random() > commit_prob:
        return None
    return "consensus" if c_score >= r_score else "reform"


def agent_election_vote(
    agent: dict,
    lean_map: dict[str, tuple[float, float]],
    mood: float,
) -> str | None:
    """
    How one agent votes in popular elections.
    Returns 'consensus', 'reform', or None (abstain).
    """
    party = normalize_agent_party(agent.get("party"))
    if party == "consensus":
        return "consensus"
    if party == "reform":
        return "reform"

    if random.random() < INDEPENDENT_ABSTAIN_RATE:
        return None

    cls = agent.get("class") or "middle"
    lean_c, _lean_r = lean_map.get(cls, (0.50, 0.50))
    lean_c = max(0.0, min(1.0, lean_c + mood))

    readings = agent.get("_readings") or []
    c_aff, r_aff, _ = compute_agent_party_affinity(agent, readings)
    if c_aff + r_aff > 0.05:
        conv = (c_aff - r_aff) / max(c_aff + r_aff, 0.01)
        lean_c = max(0.0, min(1.0, lean_c + conv * 0.25))

    return "consensus" if random.random() < lean_c else "reform"


def compute_agent_popular_vote(
    cur,
    lean_map: dict[str, tuple[float, float]],
    mood: float,
    candidate_party_ids: tuple[str, ...],
) -> tuple[dict[str, int], dict]:
    """Per-agent electorate simulation for president/sheriff elections."""
    cur.execute(
        """
        SELECT id, name, class, balance, intelligence,
               COALESCE(party, 'independent') AS party
        FROM agents
        WHERE is_alive = true
        """
    )
    agents = cur.fetchall()
    agent_ids = [a["id"] for a in agents]

    readings_by_agent: dict[int, list] = {aid: [] for aid in agent_ids}
    if agent_ids:
        cur.execute(
            """
            SELECT ak.agent_id, ak.track, ak.insight,
                   COALESCE(ak.usefulness_score, 0) AS usefulness_score,
                   COALESCE(b.title, '') AS title
            FROM agent_knowledge ak
            LEFT JOIN books b ON b.id = ak.book_id
            WHERE ak.agent_id = ANY(%s)
            ORDER BY ak.agent_id, COALESCE(ak.usefulness_score, 0) DESC
            """,
            (agent_ids,),
        )
        for row in cur.fetchall():
            aid = row["agent_id"]
            if len(readings_by_agent.get(aid, [])) < 8:
                readings_by_agent.setdefault(aid, []).append(dict(row))

    votes: dict[str, int] = {pid: 0 for pid in candidate_party_ids}
    abstain = 0
    by_party_reg: dict[str, int] = {
        "consensus": 0,
        "reform": 0,
        PARTY_INDEPENDENT: 0,
    }

    for ag in agents:
        reg = normalize_agent_party(ag["party"])
        if reg in by_party_reg:
            by_party_reg[reg] += 1
        ag_dict = dict(ag)
        ag_dict["_readings"] = readings_by_agent.get(ag["id"], [])
        choice = agent_election_vote(ag_dict, lean_map, mood)
        if choice is None:
            abstain += 1
        elif choice in votes:
            votes[choice] += 1

    meta = {
        "abstain": abstain,
        "registered": by_party_reg,
        "mood_swing_pct": round(mood * 100, 1),
        "independent_abstain_rate": INDEPENDENT_ABSTAIN_RATE,
    }
    return votes, meta


def compute_election_poll(cur) -> dict:
    """
    Election poll shares including independent (undecided) as third category.
    """
    cur.execute(
        """
        SELECT id, name, class, balance, intelligence,
               COALESCE(NULLIF(TRIM(party), ''), 'independent') AS party
        FROM agents
        WHERE is_alive = true
        """
    )
    rows = cur.fetchall()
    total = len(rows) or 1

    solid_c = solid_r = 0
    lean_c = lean_r = undecided = 0

    for ag in rows:
        party = normalize_agent_party(ag["party"])
        if party == "consensus":
            solid_c += 1
            continue
        if party == "reform":
            solid_r += 1
            continue

        readings = fetch_agent_readings(cur, ag["id"], limit=6)
        c_score, r_score, _ = compute_agent_party_affinity(dict(ag), readings)
        margin = abs(c_score - r_score)
        if margin < CHOICE_COMMIT_THRESHOLD:
            undecided += 1
            continue
        if c_score > r_score:
            lean_c += 1
        else:
            lean_r += 1

    poll_c = solid_c + lean_c
    poll_r = solid_r + lean_r
    poll_i = undecided
    denom = max(poll_c + poll_r + poll_i, 1)

    return {
        "total_agents": total,
        "solid_consensus": solid_c,
        "solid_reform": solid_r,
        "independent_count": total - solid_c - solid_r,
        "poll_consensus": round(poll_c / denom * 100, 1),
        "poll_reform": round(poll_r / denom * 100, 1),
        "poll_independent": round(poll_i / denom * 100, 1),
        "lean_consensus": lean_c,
        "lean_reform": lean_r,
        "undecided": undecided,
    }


def enrich_parties_election_poll(cur, parties: list[dict]) -> list[dict]:
    """Attach agent-weighted poll_pct; append Independent row for UI."""
    poll = compute_election_poll(cur)
    out = []
    for p in parties:
        pid = (p.get("party_id") or "").lower()
        row = dict(p)
        if pid == "consensus":
            row["poll_pct"] = poll["poll_consensus"]
            row["solid_members"] = poll["solid_consensus"]
        elif pid == "reform":
            row["poll_pct"] = poll["poll_reform"]
            row["solid_members"] = poll["solid_reform"]
        else:
            row["poll_pct"] = row.get("poll_pct") or row.get("approval_rating") or 0
        out.append(row)

    out.append(
        {
            "party_id": PARTY_INDEPENDENT,
            "name": "Independent / Undecided",
            "emoji": "🗳️",
            "ideology": "Autonomous citizens — no party affiliation yet",
            "approval_rating": int(poll["poll_independent"]),
            "poll_pct": poll["poll_independent"],
            "members_count": poll["independent_count"],
            "undecided_count": poll["undecided"],
        }
    )
    return out


def choose_party_cycle() -> dict:
    """Hourly: eligible independents choose a party or remain independent."""
    conn = get_conn()
    cur = get_cursor(conn)

    cur.execute(
        """
        UPDATE agents SET party = %s
        WHERE is_alive = true
          AND (party IS NULL OR TRIM(party) = '')
        """,
        (PARTY_INDEPENDENT,),
    )

    cur.execute(
        """
        SELECT id, name, class, balance, intelligence,
               COALESCE(age_days, 0) AS age_days,
               COALESCE(party, 'independent') AS party
        FROM agents
        WHERE is_alive = true
          AND COALESCE(NULLIF(TRIM(party), ''), 'independent') = 'independent'
          AND COALESCE(age_days, 0) >= %s
        ORDER BY RANDOM()
        LIMIT %s
        """,
        (MIN_AGE_DAYS, CHOICE_BATCH_SIZE),
    )
    candidates = cur.fetchall()

    chosen = 0
    stayed = 0
    examples: list[str] = []

    for ag in candidates:
        readings = fetch_agent_readings(cur, ag["id"])
        c_score, r_score, top_book = compute_agent_party_affinity(dict(ag), readings)
        pick = pick_party_from_affinity(c_score, r_score)
        if not pick:
            stayed += 1
            continue

        cur.execute(
            "UPDATE agents SET party = %s WHERE id = %s",
            (pick, ag["id"]),
        )
        party_name = PARTIES[pick]["name"]
        if top_book:
            msg = (
                f"Agent {ag['name']} chose {party_name} after studying "
                f"[{top_book}] (class={ag['class']}, affinity C={c_score:.2f} R={r_score:.2f})"
            )
        else:
            msg = (
                f"Agent {ag['name']} chose {party_name} based on class {ag['class']} "
                f"and life experience (affinity C={c_score:.2f} R={r_score:.2f})"
            )
        log_event(cur, ag["id"], "party_choice", msg, 0, priority="normal")
        chosen += 1
        if len(examples) < 5:
            examples.append(msg)

    conn.commit()

    stats = party_membership_stats(cur)
    result = {
        "candidates": len(candidates),
        "chosen": chosen,
        "stayed_independent": stayed,
        "stats": stats,
        "examples": examples,
    }

    print(f"\n🗳️ Party choice cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"   Eligible batch: {len(candidates)} | Chose party: {chosen} | Stayed independent: {stayed}")
    print(
        f"   Membership: independent={stats['independent']:,} "
        f"consensus={stats['consensus']:,} reform={stats['reform']:,}"
    )
    for ex in examples:
        print(f"   → {ex}")
    print("✅ Party choice cycle complete\n")

    cur.close()
    conn.close()
    return result


def party_membership_stats(cur) -> dict[str, int]:
    cur.execute(
        """
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(NULLIF(TRIM(party), ''), 'independent') = 'independent'
          ) AS independent,
          COUNT(*) FILTER (WHERE party = 'consensus') AS consensus,
          COUNT(*) FILTER (WHERE party = 'reform') AS reform,
          COUNT(*) AS total
        FROM agents
        WHERE is_alive = true
        """
    )
    row = cur.fetchone() or {}
    return {
        "independent": int(row.get("independent") or 0),
        "consensus": int(row.get("consensus") or 0),
        "reform": int(row.get("reform") or 0),
        "total": int(row.get("total") or 0),
    }


def show_example_book_choice(cur) -> str | None:
    """Find a recent party_choice event citing a book."""
    cur.execute(
        """
        SELECT e.description, e.agent_id, a.name
        FROM events e
        LEFT JOIN agents a ON a.id = e.agent_id
        WHERE e.event_type = 'party_choice'
          AND e.description ILIKE '%studying [%'
        ORDER BY e.created_at DESC NULLS LAST
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if row:
        return row.get("description") or row[0]
    cur.execute(
        """
        SELECT a.id, a.name, a.class, b.title, ak.usefulness_score
        FROM agents a
        JOIN agent_knowledge ak ON ak.agent_id = a.id
        LEFT JOIN books b ON b.id = ak.book_id
        WHERE a.is_alive = true
          AND COALESCE(a.party, 'independent') = 'independent'
          AND COALESCE(a.age_days, 0) >= %s
          AND b.title IS NOT NULL
        ORDER BY COALESCE(ak.usefulness_score, 0) DESC
        LIMIT 1
        """,
        (MIN_AGE_DAYS,),
    )
    demo = cur.fetchone()
    if not demo:
        return None
    readings = fetch_agent_readings(cur, demo["id"])
    c_score, r_score, top = compute_agent_party_affinity(dict(demo), readings)
    pick = "Consensus" if c_score >= r_score else "Reform"
    return (
        f"[dry-run] Agent {demo['name']} would lean {pick} after studying "
        f"[{top or demo.get('title')}] (C={c_score:.2f} R={r_score:.2f})"
    )


def main():
    import sys

    cmd = (sys.argv[1] if len(sys.argv) > 1 else "cycle").lower()
    if cmd == "stats":
        conn = get_conn()
        cur = get_cursor(conn)
        stats = party_membership_stats(cur)
        poll = compute_election_poll(cur)
        example = show_example_book_choice(cur)
        print("=== PARTY MEMBERSHIP ===")
        for k, v in stats.items():
            print(f"  {k}: {v:,}")
        print("=== ELECTION POLL (agent-weighted) ===")
        print(f"  Consensus: {poll['poll_consensus']}%")
        print(f"  Reform: {poll['poll_reform']}%")
        print(f"  Independent/Undecided: {poll['poll_independent']}%")
        if example:
            print(f"=== EXAMPLE ===\n  {example}")
        cur.close()
        conn.close()
        return

    choose_party_cycle()


if __name__ == "__main__":
    main()
