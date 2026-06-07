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
from political_parties import PARTIES, ensure_parties_exist, ensure_parties_schema

PARTY_IDS = ("conservatives", "centrists", "populists")
SENATORS_PER_PARTY = 3
ROGUE_VOTE_CHANCE = 0.20
ELECTION_BONUS = 50.0
IMPEACH_APPROVAL_MAX = 15
IMPEACH_OPPOSITION_MIN = 6
COUP_CORRUPTION_MIN = 80
COUP_CHANCE = 0.30

CLASS_TO_PARTY = {
    "elite": "conservatives",
    "middle": "centrists",
    "working": "centrists",
    "poor": "populists",
    "critical": "populists",
}

LAW_TYPES = (
    "TAX_REFORM",
    "STIMULUS_PACKAGE",
    "MARTIAL_LAW",
    "AMNESTY",
    "NATIONALIZATION",
    "WEALTH_TAX",
    "DEREGULATION",
    "ELECTION_DELAY",
)

# Party default vote: True = yes, False = no, None = swing (centrist decides)
PARTY_LAW_STANCE = {
    "conservatives": {
        "TAX_REFORM": None,
        "STIMULUS_PACKAGE": False,
        "MARTIAL_LAW": True,
        "AMNESTY": False,
        "NATIONALIZATION": None,
        "WEALTH_TAX": False,
        "DEREGULATION": True,
        "ELECTION_DELAY": False,
    },
    "centrists": {
        "TAX_REFORM": None,
        "STIMULUS_PACKAGE": None,
        "MARTIAL_LAW": None,
        "AMNESTY": None,
        "NATIONALIZATION": None,
        "WEALTH_TAX": None,
        "DEREGULATION": None,
        "ELECTION_DELAY": False,
    },
    "populists": {
        "TAX_REFORM": None,
        "STIMULUS_PACKAGE": True,
        "MARTIAL_LAW": False,
        "AMNESTY": True,
        "NATIONALIZATION": True,
        "WEALTH_TAX": True,
        "DEREGULATION": False,
        "ELECTION_DELAY": False,
    },
}

LAW_TITLES = {
    "TAX_REFORM": "Tax Reform Act",
    "STIMULUS_PACKAGE": "Economic Stimulus Package",
    "MARTIAL_LAW": "Martial Law Authorization",
    "AMNESTY": "National Amnesty Decree",
    "NATIONALIZATION": "Emergency Nationalization Bill",
    "WEALTH_TAX": "Elite Wealth Tax",
    "DEREGULATION": "Corporate Deregulation Act",
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
    legacy = {"blue": "populists", "red": "conservatives"}
    if raw in legacy:
        return legacy[raw]
    cur_party = president.get("party_id")
    if cur_party in PARTY_IDS:
        return cur_party
    return "centrists"


def agent_party_from_class(agent_class: str) -> str:
    return CLASS_TO_PARTY.get(agent_class or "middle", "centrists")


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
    if base == "poor":
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


def ensure_senate_exists(cur):
    """Elect senators if fewer than 9 living seated (3 per party). Speaker = highest approval."""
    if senate_refill_blocked(cur):
        return

    living = living_senators_count(cur)
    if living >= 9:
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
            """,
            (party_id,),
        )
        have = int(cur.fetchone()["c"] or 0)
        need = SENATORS_PER_PARTY - have
        for _ in range(need):
            agent = pick_senator_candidate(cur, party_id, seated_ids)
            if not agent or agent["id"] in seated_ids:
                continue
            approval = min(90, 40 + int(agent.get("charisma") or 50) // 2)
            cur.execute(
                """
                INSERT INTO senate (
                    agent_id, agent_name, party_id, role, approval_rating, is_active
                ) VALUES (%s, %s, %s, 'senator', %s, true)
                """,
                (agent["id"], agent["name"], party_id, approval),
            )
            seated_ids.add(agent["id"])
            log_event(
                cur,
                agent["id"],
                "senate",
                f"Senator {agent['name']} ({PARTIES[party_id]['emoji']} {party_id}) sworn in",
                0,
                priority="normal",
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
        agent = pick_senator_candidate(cur, party_id, seated_ids)
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
        approval = min(90, 40 + int(agent.get("charisma") or 50) // 2)
        cur.execute(
            """
            INSERT INTO senate (
                agent_id, agent_name, party_id, role, approval_rating, is_active
            ) VALUES (%s, %s, %s, 'senator', %s, true)
            """,
            (agent["id"], agent["name"], party_id, approval),
        )
        seated_ids.add(agent["id"])
        log_event(
            cur,
            agent["id"],
            "senate",
            f"Senate diversity guard: {agent['name']} seated for {party_id}",
            0,
            priority="normal",
        )

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
        WHERE s.is_active = true
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
        "STIMULUS_PACKAGE": 20 if poverty_pct > 30 else 5,
        "MARTIAL_LAW": 25 if poverty_pct > 40 else 8,
        "AMNESTY": 18 if poverty_pct > 25 else 6,
        "NATIONALIZATION": 12,
        "WEALTH_TAX": 22 if party == "populists" else 8,
        "DEREGULATION": 22 if party == "conservatives" else 8,
        "ELECTION_DELAY": 30 if approval < 25 else 3,
    }
    if corruption > 60:
        weights["ELECTION_DELAY"] += 15
        weights["MARTIAL_LAW"] += 10
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
    law_type = law["law_type"]
    base = senator_votes_for(senator, law_type)

    pres_approval = int(president.get("approval_rating") or 50)
    if pres_approval > 70:
        base = base or random.random() < 0.2
    elif pres_approval < 30:
        base = (not base) if random.random() < 0.4 else base

    if random.random() < ROGUE_VOTE_CHANCE:
        return not base
    return base


def senator_votes_for(senator: dict, law_type: str) -> bool:
    party = (senator.get("party_id") or senator.get("party") or "").lower()
    if "populist" in party or "people" in party or "front" in party:
        if law_type in ("WELFARE", "TAX_RELIEF", "AMNESTY", "STIMULUS", "STIMULUS_PACKAGE", "WEALTH_TAX"):
            return random.random() < 0.85
        if law_type in ("CORP_DEREGULATION", "PRIVATIZATION", "DEREGULATION"):
            return random.random() < 0.15
    elif "conservative" in party:
        if law_type in ("CORP_DEREGULATION", "PRIVATIZATION", "TAX_REFORM", "DEREGULATION"):
            return random.random() < 0.85
        if law_type in ("WELFARE", "AMNESTY", "STIMULUS", "STIMULUS_PACKAGE"):
            return random.random() < 0.20
    return random.random() < 0.55


def execute_law_effect(cur, law: dict, president: dict) -> bool:
    """Apply law effects. Returns False if effect could not run (e.g. ZRS insufficient)."""
    law_type = law["law_type"]
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

    elif law_type == "MARTIAL_LAW":
        cur.execute(
            """
            UPDATE sheriff_state
            SET police_count = police_count * 2
            WHERE is_active = true
            """
        )
        apply_martial_law_divisions(cur)
        sync_police_divisions(cur)
        insert_active_effect(cur, "martial_law", 24, crime_modifier=-0.35, poverty_modifier=0.1)
        cur.execute(
            """
            UPDATE president_state
            SET approval_rating = GREATEST(5, COALESCE(approval_rating, 50) - 15),
                martial_law_until = NOW() + INTERVAL '24 hours'
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "senate",
            f"MARTIAL LAW: police doubled, crime suppressed — President {pname} approval -15",
            0,
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
        "MARTIAL_LAW",
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
    cur.execute("UPDATE senate SET is_active = false WHERE is_active = true")
    cur.execute(
        """
        UPDATE president_state
        SET dictatorship_mode = true, is_dictator = true,
            approval_rating = GREATEST(5, COALESCE(approval_rating, 50) - 25),
            dissolved_until = NOW() + INTERVAL '720 hours'
        WHERE is_active = true
        """
    )
    log_event(
        cur,
        president["agent_id"],
        "senate",
        f"DICTATORSHIP: President {president['agent_name']} dissolves the Senate!",
        0,
        priority="breaking",
    )


def declare_dictatorship(cur, president: dict, sheriff: dict):
    if not sheriff or sheriff.get("sheriff_type") != "corrupt":
        return False
    cur.execute(
        """
        UPDATE president_state
        SET is_dictator = true, dictatorship_mode = true,
            approval_rating = GREATEST(10, COALESCE(approval_rating, 50) - 10)
        WHERE is_active = true
        """
    )
    log_event(
        cur,
        president["agent_id"],
        "senate",
        f"FULL DICTATORSHIP: corrupt Sheriff backs President {president['agent_name']}",
        0,
        priority="breaking",
    )
    return True


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


def pick_president_candidate(cur, party_id: str) -> dict | None:
    info = PARTIES.get(party_id, {})
    base = info.get("base_class", "middle")
    if base == "poor":
        cur.execute(
            """
            SELECT id, name, charisma, class, balance
            FROM agents WHERE is_alive = true AND class IN ('poor', 'critical')
            ORDER BY charisma DESC NULLS LAST LIMIT 1
            """
        )
    else:
        cur.execute(
            """
            SELECT id, name, charisma, class, balance
            FROM agents WHERE is_alive = true AND class = %s
            ORDER BY charisma DESC NULLS LAST LIMIT 1
            """,
            (base,),
        )
    return cur.fetchone()


def run_election(cur, election_type: str = "president"):
    cur.execute(
        "SELECT party_id, approval_rating, name FROM political_parties"
    )
    parties = {r["party_id"]: dict(r) for r in cur.fetchall()}
    if len(parties) < 3:
        ensure_parties_exist(cur)

    president = get_president(cur)
    incumbent_id = president["agent_id"] if president else None
    dictatorship = bool(
        president
        and (president.get("dictatorship_mode") or president.get("is_dictator"))
    )

    candidates = {}
    for party_id in PARTY_IDS:
        c = pick_president_candidate(cur, party_id)
        if c:
            candidates[party_id] = {
                "agent_id": c["id"],
                "name": c["name"],
                "class": c["class"],
                "charisma": int(c.get("charisma") or 50),
            }

    if len(candidates) < 2:
        return None

    scores = {}
    for party_id, cand in candidates.items():
        approval = int((parties.get(party_id) or {}).get("approval_rating") or 33)
        scores[party_id] = approval + random.randint(-15, 15)
        if random.random() < 0.1:
            scores[party_id] -= random.randint(10, 25)

    if dictatorship and president:
        incumbent_party = president_party_id(president)
        for pid in scores:
            if pid == incumbent_party:
                scores[pid] = 95
            else:
                scores[pid] = max(1, scores[pid] // 4)

    winner_party = max(scores, key=scores.get)
    winner = candidates[winner_party]

    if election_type == "president" and president:
        cur.execute(
            """
            UPDATE president_state
            SET is_active = false, phase = 'retired'
            WHERE is_active = true
            """
        )
        # Fresh term — do not copy prior approval/corruption to the new row.

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
            json.dumps(scores),
            winner["agent_id"],
            winner_party,
        ),
    )
    emoji = PARTIES.get(winner_party, {}).get("emoji", "🏛️")
    log_event(
        cur,
        winner["agent_id"],
        "election",
        f"BREAKING: {emoji} {winner['name']} elected President ({PARTIES[winner_party]['name']})! "
        f"Score {scores[winner_party]} vs rivals",
        50,
        priority="breaking",
    )
    ensure_senate_exists(cur)
    return winner


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


def check_impeachment(cur):
    president = get_president(cur)
    if not president:
        return
    if not isinstance(president, dict):
        president = dict(president) if hasattr(president, "keys") else {}
    if not president:
        return
    if _president_office_age_hours(cur, president) < 12:
        return
    approval = int(president.get("approval_rating") or 50)
    if approval >= IMPEACH_APPROVAL_MAX:
        return
    opposition = count_opposition_senators(cur, president)
    if opposition < IMPEACH_OPPOSITION_MIN:
        return

    cur.execute(
        """
        SELECT s.* FROM senate s
        INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
        WHERE s.is_active = true
        """
    )
    senators = cur.fetchall()
    impeach_votes = 0
    for s in senators:
        if s["party_id"] != president_party_id(president):
            impeach_votes += 1
        elif random.random() < 0.25:
            impeach_votes += 1

    if impeach_votes < pass_threshold(cur):
        log_event(
            cur,
            president.get("agent_id"),
            "senate",
            f"Impeachment FAILED {impeach_votes}-{len(senators) - impeach_votes} "
            f"(President approval {approval}%)",
            0,
            priority="urgent",
        )
        return

    pname = president.get("agent_name") or "President"
    pid = president.get("agent_id")
    cur.execute(
        "UPDATE president_state SET is_active = false, phase = 'impeached' WHERE is_active = true"
    )
    log_event(
        cur,
        pid,
        "senate",
        f"BREAKING: IMPEACHMENT! President {pname} removed ({impeach_votes} Senate votes)",
        0,
        priority="breaking",
    )
    run_election(cur, "president")


def cancel_all_pending_laws(cur):
    cur.execute(
        """
        UPDATE senate_laws SET status = 'cancelled', voted_at = NOW()
        WHERE status = 'pending'
        """
    )


def check_coup(cur):
    president = get_president(cur)
    sheriff = get_sheriff(cur)
    if not president or not sheriff:
        return
    corruption = float(president.get("corruption_index") or 0)
    if corruption <= COUP_CORRUPTION_MIN:
        return
    if sheriff.get("sheriff_type") != "corrupt":
        return
    if random.random() > COUP_CHANCE:
        return

    pname = president["agent_name"]
    sname = sheriff["agent_name"]
    sid = sheriff["agent_id"]

    cur.execute("UPDATE senate SET is_active = false WHERE is_active = true")
    cancel_all_pending_laws(cur)
    cur.execute(
        """
        UPDATE president_state
        SET dissolved_until = NOW() + INTERVAL '720 hours'
        WHERE is_active = true
        """
    )
    cur.execute(
        """
        UPDATE sheriff_state
        SET is_active = false, sheriff_type = 'junta', coup_points = 0
        WHERE is_active = true
        """
    )
    transfer_power(
        cur,
        f"MILITARY COUP! Sheriff {sname} seizes power — President {pname} ousted!",
        new_agent_id=sid,
        new_agent_name=sname,
        new_party="junta",
        phase="interim",
        is_dictator=True,
        dictatorship_mode=True,
        log_agent_id=sid,
    )


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
    return hours > 720 or approval < 10


def run_governance_tick(cur, ctx: dict) -> dict:
    """Legislative step — confirms FRS Chief, votes laws (budget via senate_budget.py hourly)."""
    from frs_chief import senate_confirm_frs_chief, get_frs_chief

    ensure_senate_exists(cur)
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
        "SELECT id FROM senate_laws WHERE status = 'pending' ORDER BY proposed_at ASC"
    )
    voted = 0
    for row in cur.fetchall():
        senate_vote(cur, row["id"])
        voted += 1

    check_impeachment(cur)
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
