#!/usr/bin/env python3
"""ZION Senate — US Congress-style legislature with chaos mechanics."""
import json
import math
import random
import time
from datetime import datetime, timezone

from civ_common import (
    apply_martial_law_divisions,
    ensure_schema,
    get_conn,
    get_cursor,
    get_impeachment_revolution_level,
    get_latest_ai_decision,
    insert_active_effect,
    log_event,
    nationalize_corporations_from_zrs,
    sync_police_divisions,
    transfer_power,
    grant_from_zrs_to_agents,
    zrs_add_reserve,
    zrs_deduct_reserve,
    zrs_reserve,
)
from amendment_enforcer import get_param
from political_parties import PARTIES, ensure_parties_exist, ensure_parties_schema

PARTY_IDS = ("consensus", "reform")
SENATORS_PER_PARTY = 4
SENATE_AT_LARGE_SEATS = 1  # 9th senator — popular vote (Article XVII)
TOTAL_SENATORS = SENATORS_PER_PARTY * len(PARTY_IDS) + SENATE_AT_LARGE_SEATS
ROGUE_VOTE_CHANCE = 0.20
ELECTION_BONUS = 50.0
IMPEACH_REVOLUTION_MIN = 250
IMPEACH_SENATE_RATIO = 0.66
IMPEACH_ELECTION_CYCLES = 3
COUP_CORRUPTION_MIN = 80
COUP_CHANCE = 0.30

CLASS_TO_PARTY = {
    "elite": "consensus",
    "rich": "consensus",
    "middle": "reform",
    "working": "reform",
    "poor": "reform",
    "critical": "reform",
}

LAW_TYPES = (
    "TAX_REFORM",
    "TAX_REDUCTION",
    "STIMULUS_PACKAGE",
    "BASIC_INCOME",
    # "MARTIAL_LAW",  # Removed — unconstitutional
    "AMNESTY",
    "NATIONALIZATION",
    "WEALTH_TAX",
    "DEREGULATION",
    "CORPORATE_DEREGULATION",
    "HIRE_POLICE",
    "EDUCATION_FUND",
    # "ELECTION_DELAY",  # Unconstitutional
)

# Party vote bias: added to 0.5 base yes-probability per law type
PARTY_LAW_VOTE_BIAS = {
    "consensus": {
        "WEALTH_TAX": -0.4,
        "TAX_REDUCTION": 0.4,
        "HIRE_POLICE": 0.3,
        "BASIC_INCOME": -0.4,
        "CORPORATE_DEREGULATION": 0.3,
    },
    "reform": {
        "WEALTH_TAX": 0.4,
        "TAX_REDUCTION": -0.4,
        "HIRE_POLICE": -0.2,
        "BASIC_INCOME": 0.4,
        "CORPORATE_DEREGULATION": -0.3,
    },
}

# Map stored law types to vote-bias keys
VOTE_LAW_TYPE_MAP = {
    "TAX_REFORM": "TAX_REDUCTION",
    "DEREGULATION": "CORPORATE_DEREGULATION",
    "STIMULUS_PACKAGE": "BASIC_INCOME",
    "CORPORATE_DEREGULATION": "CORPORATE_DEREGULATION",
    "TAX_REDUCTION": "TAX_REDUCTION",
    "HIRE_POLICE": "HIRE_POLICE",
    "BASIC_INCOME": "BASIC_INCOME",
    "WEALTH_TAX": "WEALTH_TAX",
    "EDUCATION_FUND": "BASIC_INCOME",
}

PARTY_PROPOSED_LAWS = {
    "consensus": ("TAX_REDUCTION", "HIRE_POLICE", "CORPORATE_DEREGULATION"),
    "reform": ("WEALTH_TAX", "BASIC_INCOME", "EDUCATION_FUND"),
}

PARTY_LAW_STANCE = {
    "consensus": {
        "TAX_REFORM": None,
        "TAX_REDUCTION": True,
        "STIMULUS_PACKAGE": False,
        "BASIC_INCOME": False,
        "MARTIAL_LAW": False,  # Unconstitutional
        "AMNESTY": False,
        "NATIONALIZATION": None,
        "WEALTH_TAX": False,
        "DEREGULATION": True,
        "CORPORATE_DEREGULATION": True,
        "HIRE_POLICE": True,
        "EDUCATION_FUND": False,
        "ELECTION_DELAY": False,
    },
    "reform": {
        "TAX_REFORM": None,
        "TAX_REDUCTION": False,
        "STIMULUS_PACKAGE": True,
        "BASIC_INCOME": True,
        "MARTIAL_LAW": False,
        "AMNESTY": True,
        "NATIONALIZATION": True,
        "WEALTH_TAX": True,
        "DEREGULATION": False,
        "CORPORATE_DEREGULATION": False,
        "HIRE_POLICE": False,
        "EDUCATION_FUND": True,
        "ELECTION_DELAY": False,
    },
}

LAW_TITLES = {
    "TAX_REFORM": "Tax Reform Act",
    "TAX_REDUCTION": "Tax Cut Act",
    "STIMULUS_PACKAGE": "Economic Stimulus Package",
    "BASIC_INCOME": "Basic Income Act",
    # "MARTIAL_LAW": "Martial Law Authorization",  # Removed
    "AMNESTY": "National Amnesty Decree",
    "NATIONALIZATION": "Emergency Nationalization Bill",
    "WEALTH_TAX": "Wealth Tax Act",
    "DEREGULATION": "Corporate Deregulation Act",
    "CORPORATE_DEREGULATION": "Corporate Deregulation Act",
    "HIRE_POLICE": "Police Funding Act",
    "EDUCATION_FUND": "Education Fund Act",
    "ELECTION_DELAY": "Election Postponement Act",
}


def ensure_senate_schema(cur):
    try:
        ensure_schema(cur)
    except Exception as e:
        if "deadlock" in str(e).lower():
            cur.connection.rollback()
            time.sleep(2)
            ensure_schema(cur)
        else:
            raise

    try:
        ensure_parties_schema(cur)
    except Exception as e:
        if "deadlock" in str(e).lower():
            cur.connection.rollback()
            time.sleep(2)
            ensure_parties_schema(cur)
        else:
            raise

    for col, typedef in [
        ("dictatorship_mode", "BOOLEAN DEFAULT false"),
        ("vetoes_used", "INTEGER DEFAULT 0"),
        ("election_delayed", "BOOLEAN DEFAULT false"),
        ("hours_in_power", "INTEGER DEFAULT 0"),
        ("dissolved_until", "TIMESTAMP"),
        ("created_at", "TIMESTAMP DEFAULT NOW()"),
    ]:
        try:
            cur.execute(
                f"ALTER TABLE president_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
            )
        except Exception as e:
            if "deadlock" in str(e).lower():
                cur.connection.rollback()
                time.sleep(2)
                cur.execute(
                    f"ALTER TABLE president_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
                )
            else:
                pass

    try:
        cur.execute(
            "ALTER TABLE president_state ALTER COLUMN party TYPE VARCHAR(50)"
        )
    except Exception as e:
        if "deadlock" in str(e).lower():
            cur.connection.rollback()
            time.sleep(2)
            cur.execute(
                "ALTER TABLE president_state ALTER COLUMN party TYPE VARCHAR(50)"
            )
        else:
            pass

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS senate (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            agent_name VARCHAR(100),
            party_id TEXT NOT NULL,
            role TEXT DEFAULT 'senator',
            votes_cast INTEGER DEFAULT 0,
            approval_rating INTEGER DEFAULT 50,
            is_active BOOLEAN DEFAULT true,
            term_start TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS senate_laws (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            proposed_by TEXT DEFAULT 'president',
            law_type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            votes_for INTEGER DEFAULT 0,
            votes_against INTEGER DEFAULT 0,
            effect_data JSONB DEFAULT '{}',
            proposed_at TIMESTAMP DEFAULT NOW(),
            voted_at TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS elections (
            id SERIAL PRIMARY KEY,
            election_type TEXT NOT NULL,
            candidates JSONB DEFAULT '[]',
            results JSONB DEFAULT '{}',
            winner_agent_id INTEGER,
            winner_party TEXT,
            held_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS has_senate_experience BOOLEAN DEFAULT false"
    )
    cur.execute(
        """
        UPDATE agents SET has_senate_experience = true
        WHERE id IN (SELECT DISTINCT agent_id FROM senate WHERE agent_id IS NOT NULL)
          AND COALESCE(has_senate_experience, false) = false
        """
    )


# Class lean toward Consensus/Reform in presidential elections (before mood swing)
CLASS_PRESIDENTIAL_LEAN: dict[str, tuple[float, float]] = {
    "elite": (0.70, 0.30),
    "rich": (0.70, 0.30),
    "middle": (0.50, 0.50),
    "working": (0.30, 0.70),
    "poor": (0.30, 0.70),
    "critical": (0.30, 0.70),
}
ELECTORATE_MOOD_SWING = 0.15


def mark_agent_senate_experience(cur, agent_id: int) -> None:
    cur.execute(
        """
        UPDATE agents SET has_senate_experience = true
        WHERE id = %s
        """,
        (agent_id,),
    )


def pick_senate_president_nominee(cur, party_id: str) -> dict | None:
    """Party nominates its sitting senator with highest approval (senate experience required)."""
    cur.execute(
        """
        SELECT s.id AS senate_id, s.agent_id AS id, s.agent_name AS name,
               s.approval_rating, a.class, a.charisma, a.balance,
               COALESCE(a.has_senate_experience, false) AS has_senate_experience
        FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true AND s.party_id = %s
        ORDER BY s.approval_rating DESC NULLS LAST, s.votes_cast DESC, s.id
        LIMIT 1
        """,
        (party_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    mark_agent_senate_experience(cur, row["id"])
    return dict(row)


def compute_president_popular_vote(
    cur, candidates: dict[str, dict]
) -> tuple[dict[str, int], dict]:
    """
    Popular presidential vote: agents vote by class lean + electorate mood ±15%.
    Returns (party_vote_totals, metadata with per-class breakdown).
    """
    cur.execute(
        """
        SELECT class, COUNT(*) AS cnt FROM agents
        WHERE is_alive = true
        GROUP BY class
        """
    )
    class_counts = {row["class"]: int(row["cnt"]) for row in cur.fetchall()}
    mood = random.uniform(-ELECTORATE_MOOD_SWING, ELECTORATE_MOOD_SWING)

    votes: dict[str, int] = {pid: 0 for pid in candidates}
    by_class: dict[str, dict[str, int]] = {pid: {} for pid in candidates}

    for cls, count in class_counts.items():
        lean_c, _lean_r = CLASS_PRESIDENTIAL_LEAN.get(cls, (0.50, 0.50))
        consensus_share = max(0.0, min(1.0, lean_c + mood))
        consensus_votes = int(round(count * consensus_share))
        reform_votes = count - consensus_votes
        if "consensus" in votes:
            votes["consensus"] += consensus_votes
            by_class["consensus"][cls] = consensus_votes
        if "reform" in votes:
            votes["reform"] += reform_votes
            by_class["reform"][cls] = reform_votes

    meta = {
        "mood_swing_pct": round(mood * 100, 1),
        "class_counts": class_counts,
        "by_class": by_class,
        "lean_rules": {
            "rich/elite": "70/30→Consensus",
            "middle": "50/50",
            "working/poor": "30/70→Reform",
        },
    }
    return votes, meta


def vacate_senator_for_presidency(cur, agent_id: int, agent_name: str, party_id: str) -> None:
    """Winner leaves the Senate; seat opens for supplemental election."""
    cur.execute(
        """
        DELETE FROM senate
        WHERE agent_id = %s AND is_active = true
        """,
        (agent_id,),
    )
    log_event(
        cur,
        agent_id,
        "senate",
        f"Senate seat vacated: {agent_name} ({party_id}) elected President — supplemental election called",
        0,
        priority="urgent",
    )


def simulate_presidential_election(cur) -> dict:
    """Dry-run one presidential election — nominees and vote totals (no state change)."""
    nominees: dict[str, dict] = {}
    for party_id in PARTY_IDS:
        row = pick_senate_president_nominee(cur, party_id)
        if row:
            nominees[party_id] = {
                "agent_id": row["id"],
                "senate_id": row.get("senate_id"),
                "name": row["name"],
                "class": row.get("class"),
                "approval_rating": int(row.get("approval_rating") or 50),
                "has_senate_experience": True,
            }
    if len(nominees) < 2:
        return {"error": "Need senators from both parties", "nominees": nominees}

    votes, meta = compute_president_popular_vote(cur, nominees)
    winner_party = max(votes, key=votes.get)
    return {
        "nominees": nominees,
        "votes": votes,
        "winner_party": winner_party,
        "winner": nominees[winner_party],
        "meta": meta,
    }


def get_president(cur):
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def get_sheriff(cur):
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def president_party_id(president: dict) -> str:
    raw = (president.get("party") or "").lower()
    if raw in PARTY_IDS:
        return raw
    legacy = {
        "blue": "reform",
        "red": "consensus",
        "conservative": "consensus",
        "conservatives": "consensus",
        "centrist": "reform",
        "centrists": "reform",
        "populist": "reform",
        "populists": "reform",
    }
    if raw in legacy:
        return legacy[raw]
    cur_party = president.get("party_id")
    if cur_party in PARTY_IDS:
        return cur_party
    return "reform"


def agent_party_from_class(agent_class: str) -> str:
    return CLASS_TO_PARTY.get(agent_class or "middle", "reform")


def living_senators_count(cur) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    return int(cur.fetchone()["c"] or 0)


def pass_threshold(cur, law_type: str | None = None) -> int:
    n = living_senators_count(cur)
    if n <= 0:
        return 999
    lt = (law_type or "").upper()
    important_laws = {"MARTIAL_LAW", "NATIONALIZE", "NATIONALIZATION"}
    constitutional_laws = {"DISSOLVE", "DISSOLVE_SENATE"}
    if lt in constitutional_laws:
        ratio = 0.75
    elif lt in important_laws:
        ratio = 0.60
    else:
        ratio = 0.51
    return max(1, math.ceil(n * ratio))


def senate_refill_blocked(cur) -> bool:
    cur.execute(
        """
        SELECT dictatorship_mode, dissolved_until
        FROM president_state WHERE is_active = true LIMIT 1
        """
    )
    pres = cur.fetchone()
    if not pres:
        return False
    if pres.get("dictatorship_mode"):
        return True
    until = pres.get("dissolved_until")
    if until is not None:
        cur.execute("SELECT (%s > NOW()) AS blocked", (until,))
        if cur.fetchone()["blocked"]:
            return True
    return False


def pick_senator_candidate(cur, party_id: str, exclude_ids: set | None = None) -> dict | None:
    info = PARTIES.get(party_id, {})
    base = info.get("base_class", "middle")
    exclude_ids = exclude_ids or set()
    ex_clause = ""
    params: list = []
    if exclude_ids:
        ex_clause = " AND id NOT IN %s"
        params.append(tuple(exclude_ids))
    if base == "reform":
        cur.execute(
            f"""
            SELECT id, name, charisma, class, balance
            FROM agents
            WHERE is_alive = true
              AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
              AND class IN ('working', 'middle', 'poor', 'critical'){ex_clause}
            ORDER BY charisma DESC NULLS LAST, balance DESC NULLS LAST
            LIMIT 1
            """,
            tuple(params),
        )
    elif base == "poor":
        cur.execute(
            f"""
            SELECT id, name, charisma, class, balance
            FROM agents
            WHERE is_alive = true
              AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
              AND class IN ('poor', 'critical'){ex_clause}
            ORDER BY charisma DESC NULLS LAST, balance DESC NULLS LAST
            LIMIT 1
            """,
            tuple(params),
        )
    else:
        if base == "elite":
            cur.execute(
                f"""
                SELECT id, name, charisma, class, balance
                FROM agents
                WHERE is_alive = true
                  AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
                  AND class IN ('elite', 'rich'){ex_clause}
                ORDER BY charisma DESC NULLS LAST, balance DESC NULLS LAST
                LIMIT 1
                """,
                tuple(params),
            )
        else:
            params = [base] + params
            cur.execute(
                f"""
                SELECT id, name, charisma, class, balance
                FROM agents
                WHERE is_alive = true
                  AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
                  AND class = %s{ex_clause}
                ORDER BY charisma DESC NULLS LAST, balance DESC NULLS LAST
                LIMIT 1
                """,
                tuple(params),
            )
    return cur.fetchone()


def _agent_class_vote_distribution(cur) -> dict[str, float]:
    """Living-agent class weights for popular elections (Article XVII)."""
    cur.execute(
        """
        SELECT class, COUNT(*) AS cnt FROM agents
        WHERE is_alive = true
        GROUP BY class
        """
    )
    class_counts = {row["class"]: int(row["cnt"]) for row in cur.fetchall()}
    total = sum(class_counts.values()) or 1
    return {cls: cnt / total for cls, cnt in class_counts.items()}


def _score_senate_candidate(agent: dict, party_id: str, class_weights: dict[str, float]) -> float:
    """Popular vote score for a senate candidate."""
    cand_class = agent.get("class") or "middle"
    charisma = float(agent.get("charisma") or 50)
    base = charisma * 0.4
    class_w = class_weights.get(cand_class, 0.1)
    party_bonus = 1.25 if agent_party_from_class(cand_class) == party_id else 0.85
    return base + class_w * 500 * party_bonus + random.randint(-50, 50)


def elect_senator_by_popular_vote(
    cur, party_id: str, exclude_ids: set | None = None
) -> dict | None:
    """Article XVII — senator chosen by simulated agent popular vote, not executive appointment."""
    exclude_ids = exclude_ids or set()
    ex_clause = ""
    params: list = []
    if exclude_ids:
        ex_clause = " AND id NOT IN %s"
        params.append(tuple(exclude_ids))

    info = PARTIES.get(party_id, {})
    base = info.get("base_class", "middle")
    if base == "reform":
        class_filter = "class IN ('working', 'middle', 'poor', 'critical')"
    elif base == "elite":
        class_filter = "class IN ('elite', 'rich')"
    else:
        class_filter = f"class = '{base}'"

    cur.execute(
        f"""
        SELECT id, name, charisma, class, balance
        FROM agents
        WHERE is_alive = true
          AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
          AND {class_filter}{ex_clause}
        ORDER BY charisma DESC NULLS LAST
        LIMIT 8
        """,
        tuple(params),
    )
    candidates = cur.fetchall()
    if not candidates:
        return pick_senator_candidate(cur, party_id, exclude_ids)

    class_weights = _agent_class_vote_distribution(cur)
    scores = {c["id"]: _score_senate_candidate(c, party_id, class_weights) for c in candidates}
    winner_id = max(scores, key=scores.get)
    return next(c for c in candidates if c["id"] == winner_id)


def compute_president_class_vote(
    cur, candidates: dict[str, dict]
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Backward-compatible wrapper — returns float scores from popular vote."""
    votes, meta = compute_president_popular_vote(cur, candidates)
    scores = {pid: float(v) for pid, v in votes.items()}
    return scores, meta.get("by_class", {})


def prune_senate_to_nine(cur) -> int:
    """Enforce max 4 party senators + 1 at-large (role=at_large); remove excess."""
    cur.execute(
        """
        SELECT s.id, s.party_id, s.approval_rating, s.agent_name, s.role
        FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        ORDER BY s.approval_rating DESC NULLS LAST, s.id
        """
    )
    rows = cur.fetchall()
    if not rows:
        return 0

    keep_ids: set[int] = set()
    for r in rows:
        if (r.get("role") or "") == "at_large":
            keep_ids.add(int(r["id"]))

    for party_id in PARTY_IDS:
        party_rows = [
            r for r in rows
            if r["party_id"] == party_id and (r.get("role") or "") != "at_large"
        ]
        party_rows.sort(
            key=lambda r: int(r.get("approval_rating") or 0), reverse=True
        )
        for r in party_rows[:SENATORS_PER_PARTY]:
            keep_ids.add(int(r["id"]))

    # Only one at-large seat
    at_large_kept = [r for r in rows if int(r["id"]) in keep_ids and (r.get("role") or "") == "at_large"]
    if len(at_large_kept) > 1:
        at_large_kept.sort(key=lambda r: int(r.get("approval_rating") or 0), reverse=True)
        for r in at_large_kept[1:]:
            keep_ids.discard(int(r["id"]))

    remove_ids = [int(r["id"]) for r in rows if int(r["id"]) not in keep_ids]
    if not remove_ids:
        return 0

    cur.execute("DELETE FROM senate WHERE id = ANY(%s)", (remove_ids,))
    removed = cur.rowcount
    log_event(
        cur,
        None,
        "senate",
        f"Senate pruned: {len(keep_ids)} seats (4/party + at-large); removed {removed}",
        0,
        priority="normal",
    )
    return removed


def _seat_senator(
    cur,
    agent: dict,
    party_id: str,
    seated_ids: set,
    reason: str = "elected",
    role: str = "senator",
):
    approval = min(90, 40 + int(agent.get("charisma") or 50) // 2)
    cur.execute(
        """
        INSERT INTO senate (
            agent_id, agent_name, party_id, role, approval_rating, is_active
        ) VALUES (%s, %s, %s, %s, %s, true)
        """,
        (agent["id"], agent["name"], party_id, role, approval),
    )
    mark_agent_senate_experience(cur, agent["id"])
    seated_ids.add(agent["id"])
    log_event(
        cur,
        agent["id"],
        "senate",
        f"Senator {agent['name']} ({PARTIES[party_id]['emoji']} {party_id}) "
        f"{reason} by popular vote (Article XVII)",
        0,
        priority="normal",
    )


def check_sheriff_recall(cur) -> bool:
    """Article XVII — Sheriff recall only during constitutional crisis + Senate majority."""
    from civ_governance import SHERIFF_RECALL_REVOLUTION_MIN, deactivate_sheriff

    unrest = get_impeachment_revolution_level(cur)
    if unrest <= SHERIFF_RECALL_REVOLUTION_MIN:
        return False

    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    sheriff = cur.fetchone()
    if not sheriff:
        return False

    cur.execute(
        """
        SELECT s.* FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    senators = cur.fetchall()
    if not senators:
        return False

    votes_for = 0
    for s in senators:
        if random.random() < 0.75:
            votes_for += 1

    threshold = max(1, len(senators) // 2 + 1)
    if votes_for < threshold:
        log_event(
            cur,
            None,
            "senate",
            f"Sheriff recall motion FAILED {votes_for}-{len(senators) - votes_for} "
            f"(needs {threshold}; unrest {unrest:.0f})",
            0,
            priority="urgent",
        )
        return False

    sname = sheriff.get("agent_name") or "Sheriff"
    deactivate_sheriff(cur)
    log_event(
        cur,
        None,
        "senate",
        f"BREAKING: Senate recalls Sheriff {sname} during constitutional crisis "
        f"({votes_for}-{len(senators) - votes_for}; unrest {unrest:.0f}) — new election called",
        0,
        priority="breaking",
    )
    return True


def ensure_senate_exists(cur):
    """Elect senators if fewer than 9 living seated — popular vote (Article XVII)."""
    prune_senate_to_nine(cur)
    if senate_refill_blocked(cur):
        return

    living = living_senators_count(cur)
    max_senators = TOTAL_SENATORS
    if living >= max_senators:
        return

    cur.execute(
        """
        SELECT s.agent_id FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    seated_ids = {r["agent_id"] for r in cur.fetchall()}

    for party_id in PARTY_IDS:
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM senate s
            INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
            WHERE s.is_active = true AND s.party_id = %s
              AND COALESCE(s.role, 'senator') != 'at_large'
            """,
            (party_id,),
        )
        have = int(cur.fetchone()["c"] or 0)
        need = SENATORS_PER_PARTY - have
        for _ in range(need):
            agent = elect_senator_by_popular_vote(cur, party_id, seated_ids)
            if not agent or agent["id"] in seated_ids:
                continue
            _seat_senator(cur, agent, party_id, seated_ids)

    # At-large seat (9th senator) — does not count toward party quota
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    total_seated = int(cur.fetchone()["c"] or 0)
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true AND s.role = 'at_large'
        """
    )
    has_at_large = int(cur.fetchone()["c"] or 0) > 0
    if total_seated < TOTAL_SENATORS and not has_at_large:
        best_agent = None
        best_party = None
        best_score = -1.0
        class_weights = _agent_class_vote_distribution(cur)
        for party_id in PARTY_IDS:
            agent = elect_senator_by_popular_vote(cur, party_id, seated_ids)
            if not agent:
                continue
            score = _score_senate_candidate(agent, party_id, class_weights)
            if score > best_score:
                best_score = score
                best_agent = agent
                best_party = party_id
        if best_agent and best_agent["id"] not in seated_ids:
            _seat_senator(
                cur,
                best_agent,
                best_party,
                seated_ids,
                reason="at-large elected",
                role="at_large",
            )

    # Diversity guard: if chamber skews to one party, force minimum representation.
    cur.execute(
        """
        SELECT s.party_id, COUNT(*) AS c
        FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        GROUP BY s.party_id
        """
    )
    counts = {row["party_id"]: int(row["c"] or 0) for row in cur.fetchall()}
    for party_id in PARTY_IDS:
        if counts.get(party_id, 0) > 0:
            continue
        agent = elect_senator_by_popular_vote(cur, party_id, seated_ids)
        if not agent:
            cur.execute(
                """
                SELECT id, name, charisma, class, balance
                FROM agents
                WHERE is_alive = true
                  AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
                  AND id NOT IN %s
                ORDER BY charisma DESC NULLS LAST, balance DESC NULLS LAST
                LIMIT 1
                """,
                (tuple(seated_ids) if seated_ids else (-1,),),
            )
            agent = cur.fetchone()
        if not agent or agent["id"] in seated_ids:
            continue
        _seat_senator(cur, agent, party_id, seated_ids, reason="diversity guard elected")

    cur.execute(
        """
        UPDATE senate SET role = 'senator'
        WHERE is_active = true AND role = 'speaker'
        """
    )
    cur.execute(
        """
        SELECT s.id, s.agent_id, s.agent_name, s.approval_rating
        FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true AND COALESCE(s.role, 'senator') != 'at_large'
        ORDER BY s.approval_rating DESC, s.votes_cast DESC
        LIMIT 1
        """
    )
    speaker = cur.fetchone()
    if speaker:
        cur.execute(
            "UPDATE senate SET role = 'speaker' WHERE id = %s",
            (speaker["id"],),
        )
        log_event(
            cur,
            speaker["agent_id"],
            "senate",
            f"Speaker of the Senate: {speaker['agent_name']} (approval {speaker['approval_rating']}%)",
            0,
            priority="normal",
        )


def senator_party_id(senator: dict) -> str:
    raw = (senator.get("party_id") or senator.get("party") or "").lower()
    if raw in PARTY_IDS:
        return raw
    legacy = {
        "blue": "reform",
        "red": "consensus",
        "conservative": "consensus",
        "conservatives": "consensus",
        "centrist": "reform",
        "centrists": "reform",
        "populist": "reform",
        "populists": "reform",
    }
    if raw in legacy:
        return legacy[raw]
    if "consensus" in raw or "conservative" in raw:
        return "consensus"
    if "reform" in raw or "populist" in raw or "centrist" in raw:
        return "reform"
    return "reform"


def vote_law_type_key(law_type: str) -> str:
    return VOTE_LAW_TYPE_MAP.get((law_type or "").upper(), (law_type or "").upper())


def vote_on_law(senator: dict, law: dict, president: dict | None = None) -> bool:
    """Party-weighted Senate vote. Bias shifts base 0.5 yes-probability."""
    party = senator_party_id(senator)
    raw_type = (law.get("law_type") or "").upper()
    vote_key = vote_law_type_key(raw_type)
    bias = PARTY_LAW_VOTE_BIAS.get(party, {}).get(vote_key, 0.0)
    prob_yes = 0.5 + bias

    stance = PARTY_LAW_STANCE.get(party, {}).get(raw_type)
    if stance is True:
        prob_yes = max(prob_yes, 0.80)
    elif stance is False:
        prob_yes = min(prob_yes, 0.20)

    if president:
        pres_approval = int(president.get("approval_rating") or 50)
        if pres_approval > 70:
            prob_yes = min(1.0, prob_yes + 0.10)
        elif pres_approval < 30:
            prob_yes = max(0.0, prob_yes - 0.10)

    prob_yes = max(0.05, min(0.95, prob_yes))
    yes = random.random() < prob_yes
    if random.random() < ROGUE_VOTE_CHANCE:
        return not yes
    return yes


def get_senate_speaker(cur) -> dict | None:
    cur.execute(
        """
        SELECT s.* FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        ORDER BY
            CASE WHEN s.role = 'speaker' THEN 0 ELSE 1 END,
            s.approval_rating DESC NULLS LAST,
            s.votes_cast DESC
        LIMIT 1
        """
    )
    return cur.fetchone()


def choose_law_for_senator(senator: dict) -> str:
    party = senator_party_id(senator)
    pool = list(PARTY_PROPOSED_LAWS.get(party, LAW_TYPES))
    return random.choice(pool)


def propose_senator_law(cur, senator: dict, law_type: str | None = None):
    """Senator proposes a party-aligned bill; events tagged [CONSENSUS] or [REFORM]."""
    from constitutional_duties import tag_party_event

    party = senator_party_id(senator)
    law_type = law_type or choose_law_for_senator(senator)
    if law_type not in LAW_TYPES:
        law_type = choose_law_for_senator(senator)
    title = LAW_TITLES.get(law_type, law_type.replace("_", " ").title())
    party_name = PARTIES.get(party, {}).get("name", party)
    desc = (
        f"Senator {senator['agent_name']} ({party_name}) proposes {title}. "
        f"Party platform: {PARTY_PROPOSED_LAWS.get(party, ())}"
    )
    effect = {
        "law_type": law_type,
        "senator_id": senator["agent_id"],
        "party_id": party,
    }
    cur.execute(
        """
        INSERT INTO senate_laws (
            title, description, proposed_by, law_type, status, effect_data
        ) VALUES (%s, %s, 'senator', %s, 'pending', %s)
        RETURNING id
        """,
        (title, desc, law_type, json.dumps(effect)),
    )
    law_id = cur.fetchone()["id"]
    event_msg = tag_party_event(f"📜 BILL PROPOSED: {title} ({law_type})", party)
    log_event(
        cur,
        senator["agent_id"],
        "senate",
        event_msg,
        0,
        priority="urgent",
    )
    return law_id


def choose_law_for_president(cur, president: dict) -> str:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND (balance < 10 OR class IN ('poor', 'critical'))
        """
    )
    poor = int(cur.fetchone()["c"] or 0)
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    total = max(int(cur.fetchone()["c"] or 1), 1)
    poverty_pct = poor / total * 100
    approval = int(president.get("approval_rating") or 50)
    corruption = float(president.get("corruption_index") or 30)
    party = president_party_id(president)

    weights = {
        "TAX_REFORM": 15,
        "TAX_REDUCTION": 18 if party == "consensus" else 4,
        "STIMULUS_PACKAGE": 20 if poverty_pct > 30 else 5,
        "BASIC_INCOME": 20 if party == "reform" and poverty_pct > 25 else 6,
        "MARTIAL_LAW": 0,
        "AMNESTY": 18 if poverty_pct > 25 else 6,
        "NATIONALIZATION": 12,
        "WEALTH_TAX": 22 if party == "reform" else 8,
        "DEREGULATION": 22 if party == "consensus" else 8,
        "CORPORATE_DEREGULATION": 22 if party == "consensus" else 8,
        "HIRE_POLICE": 20 if party == "consensus" else 5,
        "EDUCATION_FUND": 18 if party == "reform" else 5,
        "ELECTION_DELAY": 30 if approval < 25 else 3,
    }
    if corruption > 60:
        weights["ELECTION_DELAY"] += 15
    pool = list(weights.keys())
    w = [weights[k] for k in pool]
    return random.choices(pool, weights=w, k=1)[0]


def propose_law(cur, president: dict, law_type: str | None = None, proposer: str = "president"):
    if not president:
        return None
    law_type = law_type or choose_law_for_president(cur, president)
    if law_type not in LAW_TYPES:
        law_type = random.choice(LAW_TYPES)
    title = LAW_TITLES.get(law_type, law_type.replace("_", " ").title())
    desc = (
        f"{proposer.title()} proposes {title}. "
        f"Champion: President {president['agent_name']}."
    )
    effect = {"law_type": law_type, "president_id": president["agent_id"]}
    cur.execute(
        """
        INSERT INTO senate_laws (
            title, description, proposed_by, law_type, status, effect_data
        ) VALUES (%s, %s, %s, %s, 'pending', %s)
        RETURNING id
        """,
        (title, desc, proposer, law_type, json.dumps(effect)),
    )
    law_id = cur.fetchone()["id"]
    log_event(
        cur,
        president["agent_id"],
        "senate",
        f"📜 BILL PROPOSED: {title} ({law_type})",
        0,
        priority="urgent",
    )
    return law_id


def senator_wants_yes(cur, senator: dict, law: dict, president: dict) -> bool:
    return vote_on_law(senator, law, president)


def senator_votes_for(senator: dict, law_type: str) -> bool:
    """Legacy helper — delegates to vote_on_law."""
    return vote_on_law(senator, {"law_type": law_type}, None)


def execute_law_effect(cur, law: dict, president: dict) -> bool:
    """Apply law effects. Returns False if effect could not run (e.g. ZRS insufficient)."""
    law_type = (law.get("law_type") or "").upper()
    if law_type in {"MARTIAL_LAW", "DISSOLVE", "DISSOLVE_SENATE"}:
        return False  # Unconstitutional — blocked
    pid = president["agent_id"]
    pname = president["agent_name"]

    if law_type == "TAX_REFORM":
        direction = random.choice(["cut", "hike"])
        if direction == "cut":
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM agents
                WHERE is_alive = true AND class IN ('poor', 'critical', 'middle')
                """
            )
            n_workers = int(cur.fetchone()["c"] or 0)
            worker_bonus = 3.0
            zrs_cost = round(n_workers * worker_bonus, 2)
            if n_workers > 0 and zrs_cost > 0 and not zrs_deduct_reserve(cur, zrs_cost):
                return False
            if n_workers > 0:
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s
                    WHERE is_alive = true AND class IN ('poor', 'critical', 'middle')
                    """,
                    (worker_bonus,),
                )
            cur.execute(
                """
                UPDATE agents SET balance = GREATEST(0, balance - 5)
                WHERE is_alive = true AND class = 'elite'
                """
            )
            msg = f"Tax cuts: ZRS paid {zrs_cost:.0f} to workers; elite -5 ZION"
        else:
            cur.execute(
                """
                UPDATE agents SET balance = GREATEST(0, balance - 2)
                WHERE is_alive = true AND class IN ('poor', 'critical')
                """
            )
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM agents
                WHERE is_alive = true AND class = 'elite'
                """
            )
            n_elite = int(cur.fetchone()["c"] or 0)
            elite_bonus = 8.0
            zrs_cost = round(n_elite * elite_bonus, 2)
            if n_elite > 0 and zrs_cost > 0 and not zrs_deduct_reserve(cur, zrs_cost):
                return False
            if n_elite > 0:
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s
                    WHERE is_alive = true AND class = 'elite'
                    """,
                    (elite_bonus,),
                )
            msg = f"Tax hike: poor -2; ZRS paid {zrs_cost:.0f} to elite"
        log_event(cur, pid, "senate", f"TAX REFORM passed: {msg}", 0, priority="urgent")

    elif law_type == "STIMULUS_PACKAGE":
        reserve = zrs_reserve(cur)
        payout = min(500.0, reserve * 0.05, 200.0)
        if payout <= 0:
            return False
        cur.execute(
            """
            SELECT id FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical')
            ORDER BY balance ASC LIMIT 20
            """
        )
        recipients = cur.fetchall()
        if not recipients:
            return False
        each = round(payout / len(recipients), 2)
        paid_total = round(each * len(recipients), 2)
        if paid_total <= 0 or not zrs_deduct_reserve(cur, paid_total):
            return False
        for r in recipients:
            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (each, r["id"]),
            )
        log_event(
            cur,
            pid,
            "senate",
            f"STIMULUS: {paid_total:.0f} ZION from ZRS to {len(recipients)} poor agents",
            paid_total,
            priority="breaking",
        )

    elif law_type == "AMNESTY":
        cur.execute(
            """
            UPDATE agents SET dust_days = 0
            WHERE is_alive = true AND dust_days > 2
            """
        )
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical')
            """
        )
        poor_n = int(cur.fetchone()["c"] or 0)
        amnesty_total = round(5.0 * poor_n, 2)
        if amnesty_total > 0:
            grant_from_zrs_to_agents(
                cur,
                amnesty_total,
                5.0,
                "is_alive = true AND class IN ('poor', 'critical')",
            )
        cur.execute(
            """
            UPDATE president_state
            SET approval_rating = LEAST(100, COALESCE(approval_rating, 50) + 8)
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "senate",
            "AMNESTY: criminals released, poor celebrate (+approval)",
            0,
            priority="breaking",
        )

    elif law_type == "NATIONALIZATION":
        funded = nationalize_corporations_from_zrs(cur, pid, pname, limit=3, source="senate")
        if funded <= 0:
            return False
        log_event(
            cur,
            pid,
            "senate",
            f"NATIONALIZATION: {funded:.0f} ZION from ZRS to reactivate bankrupt corps",
            funded,
            priority="breaking",
        )

    elif law_type == "WEALTH_TAX":
        cur.execute(
            """
            SELECT COALESCE(SUM(balance * 0.05), 0) AS seized
            FROM agents WHERE is_alive = true AND class = 'elite'
            """
        )
        seized = round(float(cur.fetchone()["seized"] or 0), 2)
        cur.execute(
            """
            UPDATE agents
            SET balance = GREATEST(0, balance * 0.95)
            WHERE is_alive = true AND class = 'elite'
            """
        )
        if seized > 0:
            zrs_add_reserve(cur, seized)
        log_event(
            cur,
            pid,
            "senate",
            f"WEALTH TAX: elite lose 5% ({seized:.0f} ZION to ZRS reserve)",
            seized,
            priority="urgent",
        )

    elif law_type == "DEREGULATION":
        dereg_pool = 2000.0
        if not zrs_deduct_reserve(cur, dereg_pool):
            return False
        cur.execute("SELECT id FROM corporations WHERE is_active = true")
        corps = cur.fetchall()
        if corps:
            each = round(dereg_pool / len(corps), 2)
            for corp in corps:
                cur.execute(
                    "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
                    (each, corp["id"]),
                )
        log_event(
            cur,
            pid,
            "senate",
            f"DEREGULATION: {dereg_pool:.0f} ZION from ZRS to {len(corps)} corporations",
            dereg_pool,
            priority="urgent",
        )

    elif law_type == "CORPORATE_DEREGULATION":
        law = {**law, "law_type": "DEREGULATION"}
        return execute_law_effect(cur, law, president)

    elif law_type == "TAX_REDUCTION":
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical', 'middle')
            """
        )
        n_workers = int(cur.fetchone()["c"] or 0)
        worker_bonus = 3.0
        zrs_cost = round(n_workers * worker_bonus, 2)
        if n_workers > 0 and zrs_cost > 0 and not zrs_deduct_reserve(cur, zrs_cost):
            return False
        if n_workers > 0:
            cur.execute(
                """
                UPDATE agents SET balance = balance + %s
                WHERE is_alive = true AND class IN ('poor', 'critical', 'middle')
                """,
                (worker_bonus,),
            )
        cur.execute(
            """
            UPDATE agents SET balance = GREATEST(0, balance - 5)
            WHERE is_alive = true AND class = 'elite'
            """
        )
        log_event(
            cur,
            pid,
            "senate",
            f"TAX CUT passed: ZRS paid {zrs_cost:.0f} to workers; elite -5 ZION",
            0,
            priority="urgent",
        )

    elif law_type == "HIRE_POLICE":
        hire_cost = 500.0
        new_officers = 5
        if not zrs_deduct_reserve(cur, hire_cost):
            return False
        cur.execute(
            """
            UPDATE sheriff_state
            SET police_count = COALESCE(police_count, 0) + %s,
                police_budget = COALESCE(police_budget, 0) + %s
            WHERE is_active = true
            """,
            (new_officers, hire_cost),
        )
        sync_police_divisions(cur)
        log_event(
            cur,
            pid,
            "senate",
            f"POLICE FUNDING: +{new_officers} officers, +{hire_cost:.0f} ZION budget from ZRS",
            hire_cost,
            priority="urgent",
        )

    elif law_type == "BASIC_INCOME":
        reserve = zrs_reserve(cur)
        payout = min(600.0, reserve * 0.06, 250.0)
        if payout <= 0:
            return False
        cur.execute(
            """
            SELECT id FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical', 'working')
            ORDER BY balance ASC LIMIT 30
            """
        )
        recipients = cur.fetchall()
        if not recipients:
            return False
        each = round(payout / len(recipients), 2)
        paid_total = round(each * len(recipients), 2)
        if paid_total <= 0 or not zrs_deduct_reserve(cur, paid_total):
            return False
        for r in recipients:
            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (each, r["id"]),
            )
        log_event(
            cur,
            pid,
            "senate",
            f"BASIC INCOME: {paid_total:.0f} ZION from ZRS to {len(recipients)} agents",
            paid_total,
            priority="breaking",
        )

    elif law_type == "EDUCATION_FUND":
        edu_pool = min(400.0, zrs_reserve(cur) * 0.04)
        if edu_pool <= 0 or not zrs_deduct_reserve(cur, edu_pool):
            return False
        cur.execute(
            """
            SELECT id FROM agents
            WHERE is_alive = true AND class IN ('working', 'middle')
            ORDER BY RANDOM() LIMIT 25
            """
        )
        recipients = cur.fetchall()
        if not recipients:
            return False
        each = round(edu_pool / len(recipients), 2)
        for r in recipients:
            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (each, r["id"]),
            )
        log_event(
            cur,
            pid,
            "senate",
            f"EDUCATION FUND: {edu_pool:.0f} ZION from ZRS to {len(recipients)} workers",
            edu_pool,
            priority="urgent",
        )

    elif law_type == "ELECTION_DELAY":
        cur.execute(
            """
            UPDATE president_state
            SET election_delayed = true,
                days_in_power = GREATEST(0, COALESCE(days_in_power, 0) - 5),
                approval_rating = GREATEST(5, COALESCE(approval_rating, 50) - 20)
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "senate",
            f"ELECTION DELAY: President {pname} postpones vote — outrage (-20 approval)",
            0,
            priority="breaking",
        )

    return True


def senate_vote(cur, law_id: int):
    cur.execute("SELECT * FROM senate_laws WHERE id = %s", (law_id,))
    law = cur.fetchone()
    if not law or law["status"] != "pending":
        return

    president = get_president(cur)
    if not president:
        return

    cur.execute(
        """
        SELECT s.* FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        ORDER BY s.party_id, s.id
        """
    )
    senators = cur.fetchall()
    if not senators:
        return

    votes_for = 0
    votes_against = 0
    for senator in senators:
        yes = senator_wants_yes(cur, senator, law, president)
        if yes:
            votes_for += 1
        else:
            votes_against += 1
        cur.execute(
            """
            UPDATE senate SET votes_cast = votes_cast + 1
            WHERE id = %s
            """,
            (senator["id"],),
        )

    law_type = (law.get("law_type") or "").upper()
    threshold = pass_threshold(cur, law_type)
    requires_supermajority = law_type in {
        # "MARTIAL_LAW",  # Removed — unconstitutional
        "NATIONALIZE",
        "NATIONALIZATION",
        "DISSOLVE",
        "DISSOLVE_SENATE",
    }
    passed_vote = votes_for >= threshold if requires_supermajority else votes_for > votes_against
    if passed_vote:
        if execute_law_effect(cur, law, president):
            status = "passed"
            outcome = f"PASSED {votes_for}-{votes_against}"
            priority = "breaking"
        else:
            status = "failed"
            outcome = f"FAILED {votes_for}-{votes_against} (effect blocked — insufficient ZRS)"
            priority = "urgent"
    else:
        status = "blocked"
        outcome = f"BLOCKED {votes_for}-{votes_against}"
        priority = "urgent"

    cur.execute(
        """
        UPDATE senate_laws
        SET status = %s, votes_for = %s, votes_against = %s, voted_at = NOW()
        WHERE id = %s
        """,
        (status, votes_for, votes_against, law_id),
    )
    log_event(
        cur,
        president["agent_id"],
        "senate",
        f"Senate vote: '{law['title']}' {outcome}",
        votes_for,
        priority=priority,
    )


def dissolve_senate(cur, president: dict):
    return None  # Unconstitutional — disabled (Article II Sec.3)


def declare_dictatorship(cur, president: dict, sheriff: dict):
    return None  # Unconstitutional — disabled (Article II Sec.3)


def call_election(cur, president: dict):
    log_event(
        cur,
        president["agent_id"],
        "senate",
        f"President {president['agent_name']} calls early election!",
        0,
        priority="breaking",
    )
    run_election(cur, "president")


def veto_senate_law(cur, president: dict):
    vetoes = int(president.get("vetoes_used") or 0)
    if vetoes >= 1:
        return
    cur.execute(
        """
        SELECT id, title FROM senate_laws
        WHERE status = 'pending' AND proposed_by = 'senator'
        ORDER BY proposed_at ASC LIMIT 1
        """
    )
    law = cur.fetchone()
    if not law:
        return
    cur.execute(
        """
        UPDATE senate_laws SET status = 'vetoed', voted_at = NOW()
        WHERE id = %s
        """,
        (law["id"],),
    )
    cur.execute(
        """
        UPDATE president_state SET vetoes_used = vetoes_used + 1
        WHERE is_active = true
        """
    )
    log_event(
        cur,
        president["agent_id"],
        "senate",
        f"PRESIDENTIAL VETO: '{law['title']}' struck down",
        0,
        priority="breaking",
    )


def presidential_actions(cur, president: dict):
    if not president:
        return
    sheriff = get_sheriff(cur)
    approval = int(president.get("approval_rating") or 50)
    is_dictator = president.get("is_dictator") or president.get("dictatorship_mode")

    if is_dictator and random.random() < 0.15:
        dissolve_senate(cur, president)
        return

    if (
        approval < 20
        and sheriff
        and sheriff.get("sheriff_type") == "corrupt"
        and random.random() < 0.12
    ):
        declare_dictatorship(cur, president, sheriff)
        return

    if approval < 15 and random.random() < 0.08:
        call_election(cur, president)
        return

    if random.random() < 0.05:
        veto_senate_law(cur, president)


def _impeached_agent_id(cur) -> int | None:
    cur.execute(
        "SELECT last_impeached_agent_id FROM civilization_state WHERE id = 1"
    )
    row = cur.fetchone()
    if not row:
        return None
    aid = row.get("last_impeached_agent_id") if isinstance(row, dict) else row[0]
    return int(aid) if aid else None


def pick_president_candidate(cur, party_id: str) -> dict | None:
    """Legacy name — delegates to senate nominee selection."""
    return pick_senate_president_nominee(cur, party_id)


def run_election(cur, election_type: str = "president"):
    cur.execute("SELECT COUNT(*) AS c FROM political_parties")
    if int((cur.fetchone() or {}).get("c") or 0) < 2:
        ensure_parties_exist(cur)

    president = get_president(cur)
    incumbent_id = president["agent_id"] if president else None
    dictatorship = bool(
        president
        and (president.get("dictatorship_mode") or president.get("is_dictator"))
    )

    candidates: dict[str, dict] = {}
    for party_id in PARTY_IDS:
        nominee = pick_senate_president_nominee(cur, party_id)
        if nominee:
            candidates[party_id] = {
                "agent_id": nominee["id"],
                "senate_id": nominee.get("senate_id"),
                "name": nominee["name"],
                "class": nominee.get("class"),
                "charisma": int(nominee.get("charisma") or 50),
                "approval_rating": int(nominee.get("approval_rating") or 50),
                "has_senate_experience": True,
            }

    if len(candidates) < 2:
        log_event(
            cur,
            None,
            "election",
            "Presidential election postponed — both parties must seat a senator nominee",
            0,
            priority="urgent",
        )
        return None

    vote_totals, vote_meta = compute_president_popular_vote(cur, candidates)

    if dictatorship and president:
        incumbent_party = president_party_id(president)
        for pid in vote_totals:
            if pid == incumbent_party:
                vote_totals[pid] = max(vote_totals[pid], 10_000)
            else:
                vote_totals[pid] = max(1, vote_totals[pid] // 4)

    winner_party = max(vote_totals, key=vote_totals.get)
    winner = candidates[winner_party]
    rival_party = next(pid for pid in vote_totals if pid != winner_party)

    if election_type == "president" and president:
        cur.execute(
            """
            UPDATE president_state
            SET is_active = false, phase = 'retired'
            WHERE is_active = true
            """
        )

    vacate_senator_for_presidency(
        cur, winner["agent_id"], winner["name"], winner_party
    )
    president_insert_columns = [
        "agent_id",
        "agent_name",
        "party",
        "approval_rating",
        "personal_fund",
        "police_fund",
        "is_active",
        "phase",
        "corruption_index",
        "days_in_power",
        "hours_in_power",
        "vetoes_used",
        "dictatorship_mode",
        "is_dictator",
        "dissolved_until",
    ]
    president_insert_values = [
        "%s",
        "%s",
        "%s",
        "50",
        "500",
        "0",
        "true",
        "'ruling'",
        "0",
        "0",
        "0",
        "0",
        "false",
        "false",
        "NULL",
    ]
    print(
        f"run_election INSERT columns ({len(president_insert_columns)}): "
        f"{president_insert_columns}"
    )
    print(
        f"run_election INSERT values ({len(president_insert_values)}): "
        f"{president_insert_values}"
    )
    cols_sql = ", ".join(president_insert_columns)
    vals_sql = ", ".join(president_insert_values)
    cur.execute(
        f"""
        INSERT INTO president_state ({cols_sql})
        VALUES ({vals_sql})
        """,
        (winner["agent_id"], winner["name"], winner_party),
    )
    if zrs_deduct_reserve(cur, ELECTION_BONUS):
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (ELECTION_BONUS, winner["agent_id"]),
        )
    cur.execute(
        """
        UPDATE political_parties SET wins = wins + 1 WHERE party_id = %s
        """,
        (winner_party,),
    )
    if incumbent_id and incumbent_id != winner["agent_id"]:
        old_party = president_party_id(president) if president else None
        if old_party:
            cur.execute(
                "UPDATE political_parties SET losses = losses + 1 WHERE party_id = %s",
                (old_party,),
            )
        cur.execute(
            """
            UPDATE civilization_state
            SET martial_law_until = NULL
            WHERE id = 1
              AND martial_law_until IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM president_state
                  WHERE is_active = true
                    AND martial_law_until > NOW()
              )
            """
        )

    cur.execute(
        """
        INSERT INTO elections (
            election_type, candidates, results, winner_agent_id, winner_party
        ) VALUES (%s, %s, %s, %s, %s)
        """,
        (
            election_type,
            json.dumps(candidates),
            json.dumps({"votes": vote_totals, **vote_meta}),
            winner["agent_id"],
            winner_party,
        ),
    )
    emoji = PARTIES.get(winner_party, {}).get("emoji", "🏛️")
    log_event(
        cur,
        winner["agent_id"],
        "election",
        f"BREAKING: {emoji} Senator {winner['name']} elected President "
        f"({PARTIES[winner_party]['name']})! "
        f"Popular vote {vote_totals[winner_party]:,} vs {vote_totals[rival_party]:,} "
        f"(mood {vote_meta['mood_swing_pct']:+.1f}%) — senate seat open",
        50,
        priority="breaking",
    )
    ensure_senate_exists(cur)
    return {
        "agent_id": winner["agent_id"],
        "name": winner["name"],
        "party": winner_party,
        "votes": vote_totals,
        "nominees": candidates,
    }


def count_opposition_senators(cur, president: dict) -> int:
    pres_party = president_party_id(president)
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true AND s.party_id != %s
        """,
        (pres_party,),
    )
    return int(cur.fetchone()["c"] or 0)


def _president_office_age_hours(cur, president: dict) -> float:
    try:
        cur.execute(
            """
            SELECT created_at FROM president_state
            WHERE is_active = true
            ORDER BY created_at DESC LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            return 999.0

        if isinstance(row, dict):
            created_at = row.get("created_at")
        else:
            created_at = row[0]

        if not created_at:
            return 999.0

        now = datetime.now(timezone.utc)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return (now - created_at).total_seconds() / 3600
    except Exception as e:
        print(f"_president_office_age_hours error: {e}")
        return 999.0


def impeachment_vote_threshold(cur) -> float:
    """Article XV §1 — strictly greater than two-thirds of living senators."""
    n = living_senators_count(cur)
    if n <= 0:
        return float("inf")
    return n * IMPEACH_SENATE_RATIO


def maybe_run_deferred_president_election(cur):
    """Article XV §3 — election within N governance cycles after impeachment."""
    if get_president(cur):
        return
    cur.execute(
        "SELECT COALESCE(president_election_cycles, 0) AS c FROM civilization_state WHERE id = 1"
    )
    row = cur.fetchone()
    cycles = int((row or {}).get("c") or 0)
    if cycles <= 0:
        return
    cycles -= 1
    cur.execute(
        "UPDATE civilization_state SET president_election_cycles = %s WHERE id = 1",
        (cycles,),
    )
    if cycles <= 0:
        run_election(cur, "president")


def check_impeachment(cur):
    """Article XV — Senate impeachment when revolution unrest exceeds threshold."""
    president = get_president(cur)
    if not president:
        return
    if not isinstance(president, dict):
        president = dict(president) if hasattr(president, "keys") else {}
    if not president:
        return

    unrest = get_impeachment_revolution_level(cur)
    if unrest <= IMPEACH_REVOLUTION_MIN:
        return

    cur.execute(
        """
        SELECT s.* FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    senators = cur.fetchall()
    senate_size = len(senators)
    if senate_size <= 0:
        return

    cycle_votes = 0
    pres_party = president_party_id(president)
    for s in senators:
        if s["party_id"] != pres_party:
            cycle_votes += 1
        elif random.random() < 0.20:
            cycle_votes += 1

    prior_votes = int(president.get("impeachment_votes") or 0)
    impeachment_votes = prior_votes + cycle_votes
    cur.execute(
        """
        UPDATE president_state SET impeachment_votes = %s WHERE is_active = true
        """,
        (impeachment_votes,),
    )

    threshold = impeachment_vote_threshold(cur)
    if impeachment_votes <= threshold:
        log_event(
            cur,
            president.get("agent_id"),
            "senate",
            f"Impeachment tally {impeachment_votes}/{senate_size} "
            f"(needs >{threshold:.1f}; unrest {unrest:.0f})",
            0,
            priority="urgent",
        )
        return

    pname = president.get("agent_name") or "President"
    pid = president.get("agent_id")
    cur.execute(
        """
        UPDATE president_state SET
            is_active = false,
            phase = 'impeached',
            personal_fund = 0,
            impeachment_votes = 0
        WHERE is_active = true
        """
    )
    cur.execute(
        """
        UPDATE civilization_state SET
            last_impeached_agent_id = %s,
            president_election_cycles = %s
        WHERE id = 1
        """,
        (pid, IMPEACH_ELECTION_CYCLES),
    )
    log_event(
        cur,
        pid,
        "senate",
        f"BREAKING: IMPEACHMENT! President {pname} removed "
        f"({impeachment_votes} Senate votes; election in {IMPEACH_ELECTION_CYCLES} cycles)",
        0,
        priority="breaking",
    )


def cancel_all_pending_laws(cur):
    cur.execute(
        """
        UPDATE senate_laws SET status = 'cancelled', voted_at = NOW()
        WHERE status = 'pending'
        """
    )


def check_coup(cur):
    return False  # Unconstitutional — disabled


def should_run_scheduled_election(cur, president: dict) -> bool:
    if not president:
        return True
    if _president_office_age_hours(cur, president) < 24:
        return False
    if president.get("election_delayed"):
        cur.execute(
            """
            UPDATE president_state SET election_delayed = false
            WHERE is_active = true
            """
        )
        return False
    hours = int(
        president.get("hours_in_power")
        if president.get("hours_in_power") is not None
        else president.get("days_in_power") or 0
    )
    approval = int(president.get("approval_rating") or 50)
    term_limit = int(get_param("term_limit_hours", 720))
    return hours > term_limit or approval < 10


def run_governance_tick(cur, ctx: dict) -> dict:
    """Legislative step — confirms FRS Chief, votes laws (budget via senate_budget.py hourly)."""
    from frs_chief import senate_confirm_frs_chief, get_frs_chief

    ensure_senate_exists(cur)
    maybe_run_deferred_president_election(cur)
    president = get_president(cur)
    summary_parts = []

    chief = get_frs_chief(cur)
    if chief.get("confirmation_status") == "pending":
        msg = senate_confirm_frs_chief(cur, ctx)
        summary_parts.append(msg[:60])

    if ctx.get("senate", {}).get("emergency_session") or ctx.get("emergency_session"):
        if president:
            propose_law(cur, president, "STIMULUS_PACKAGE", proposer="senate_emergency")
            summary_parts.append("emergency stimulus proposed")

    if president:
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM senate_laws
            WHERE status = 'pending' AND proposed_by = 'president'
            """
        )
        pending_pres = int(cur.fetchone()["c"] or 0)
        if pending_pres < 1 and random.random() < 0.35:
            law_type = choose_law_for_president(cur, president)
            propose_law(cur, president, law_type, proposer="president")
            summary_parts.append(f"proposed {law_type}")
        presidential_actions(cur, president)

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate_laws
        WHERE status = 'pending' AND proposed_by = 'senator'
        """
    )
    pending_senator = int(cur.fetchone()["c"] or 0)
    if pending_senator < 2 and random.random() < 0.30:
        cur.execute(
            """
            SELECT s.* FROM senate s
            INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
            WHERE s.is_active = true
            ORDER BY RANDOM()
            LIMIT 1
            """
        )
        senator = cur.fetchone()
        if senator:
            law_type = choose_law_for_senator(senator)
            propose_senator_law(cur, senator, law_type)
            summary_parts.append(f"senator proposed {law_type}")

    cur.execute(
        "SELECT id FROM senate_laws WHERE status = 'pending' ORDER BY proposed_at ASC"
    )
    voted = 0
    for row in cur.fetchall():
        senate_vote(cur, row["id"])
        voted += 1

    check_impeachment(cur)
    if check_sheriff_recall(cur):
        summary_parts.append("sheriff recalled — election pending")
        ctx["sheriff_recall"] = True
    from political_economy import run_power_struggles, compute_power_scores

    scores = compute_power_scores(cur)
    run_power_struggles(cur, scores)
    check_coup(cur)

    president = get_president(cur)
    if president and should_run_scheduled_election(cur, president):
        summary_parts.append("scheduled election")
        run_election(cur, "president")
        president = get_president(cur)

    ctx["senate"] = {
        "summary": "; ".join(summary_parts) or f"voted {voted} laws",
        "laws_voted": voted,
        "frs_confirmed": ctx.get("frs_confirmed"),
    }
    summary = ctx["senate"]["summary"]
    log_event(
        cur,
        None,
        "senate",
        f"Senate governance tick: {summary}",
        voted,
        priority="normal",
    )
    return ctx


def trigger_emergency_session(cur, reason: str):
    """Called when starvation or crisis exceeds threshold."""
    log_event(
        cur,
        None,
        "senate",
        f"EMERGENCY SESSION: {reason}",
        0,
        priority="breaking",
    )
    return {"emergency_session": True, "senate": {"emergency_session": True, "reason": reason}}


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_senate_schema(cur)
    ensure_parties_exist(cur)
    conn.commit()

    print(f"\n🏛️ ZION Senate — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        ensure_senate_exists(cur)
        president = get_president(cur)

        # Read AI Senate decision
        ai_decision = get_latest_ai_decision(cur, "senate")
        ai_action = ai_decision.get("action", "")
        ai_amount = float(ai_decision.get("amount", 0) or 0)

        if ai_action == "stimulate_economy" and president:
            print(f"Senate influenced by AI to pass stimulus: {ai_amount} ZION")
            propose_law(cur, president, "STIMULUS_PACKAGE", proposer="senate_ai")
        elif ai_action == "tax_change" and president:
            print("Senate influenced by AI for tax reform")
            propose_law(cur, president, "TAX_REFORM", proposer="senate_ai")

        if president:
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM senate_laws
                WHERE status = 'pending' AND proposed_by = 'president'
                """
            )
            pending_pres = int(cur.fetchone()["c"] or 0)
            if pending_pres < 1 and random.random() < 0.45:
                law_type = choose_law_for_president(cur, president)
                propose_law(cur, president, law_type, proposer="president")
                print(f"  Proposed: {law_type}")

            presidential_actions(cur, president)
            president = get_president(cur)

        cur.execute(
            "SELECT id FROM senate_laws WHERE status = 'pending' ORDER BY proposed_at ASC"
        )
        for row in cur.fetchall():
            senate_vote(cur, row["id"])

        check_impeachment(cur)
        from political_economy import run_power_struggles, compute_power_scores

        scores = compute_power_scores(cur)
        run_power_struggles(cur, scores)
        check_coup(cur)

        president = get_president(cur)
        if president and should_run_scheduled_election(cur, president):
            print("  Scheduled election triggered")
            run_election(cur, "president")

        log_event(
            cur,
            None,
            "senate",
            "Senate cycle complete — laws voted, power struggles checked",
            0,
            priority="normal",
        )
        conn.commit()
        print("\n✅ Senate cycle complete!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
