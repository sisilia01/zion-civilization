#!/usr/bin/env python3
"""
ZION Sheriff System — elected sheriff, law enforcement, and military junta.
"""
import psycopg2
import psycopg2.extras
import random
import signal
import traceback
from datetime import datetime, timezone

SHERIFF_STEP_TIMEOUT_SEC = 30


def _sheriff_timeout_handler(signum, frame):
    raise TimeoutError(f"Sheriff step timed out after {SHERIFF_STEP_TIMEOUT_SEC}s")


def _sheriff_step(label: str, fn, *args, **kwargs):
    print(label, flush=True)
    signal.signal(signal.SIGALRM, _sheriff_timeout_handler)
    signal.alarm(SHERIFF_STEP_TIMEOUT_SEC)
    try:
        return fn(*args, **kwargs)
    finally:
        signal.alarm(0)

from civ_common import (
    get_conn,
    get_cursor,
    get_latest_ai_decision,
    is_martial_law_active,
    is_uprising_active,
    log_event as civ_log_event,
    sync_police_divisions,
)
from civ_governance import (
    attempt_coup,
    process_sheriff_orders,
    record_last_sheriff_agent,
)
from civ_common import transfer_power, zrs_add_reserve

conn = None
cur = None


def _init_sheriff_db():
    """Lazy DB init — avoids blocking import and duplicate connections."""
    global conn, cur
    if conn is None:
        conn = get_conn()
        cur = get_cursor(conn)
    return conn, cur

SHERIFF_TYPES = ["honest", "corrupt", "junta"]
TYPE_WEIGHTS = [0.5, 0.35, 0.15]
TERM_DAYS = 10
MAX_TERMS = 2


def log_event(agent_id, event_type, description, amount=0):
    cur.execute(
        """
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
        """,
        (agent_id, event_type, description, amount),
    )


def _class_vote_percentages():
    """Распределение классов среди живых агентов для классового голосования."""
    cur.execute(
        """
        SELECT class, COUNT(*) AS cnt FROM agents
        WHERE is_alive = true
        GROUP BY class
        """
    )
    class_counts = {row["class"]: int(row["cnt"]) for row in cur.fetchall()}
    total_voters = sum(class_counts.values()) or 1
    poor_pct = (
        class_counts.get("poor", 0) + class_counts.get("critical", 0)
    ) / total_voters
    working_pct = (
        class_counts.get("working", 0) + class_counts.get("middle", 0)
    ) / total_voters
    rich_pct = (
        class_counts.get("rich", 0) + class_counts.get("elite", 0)
    ) / total_voters
    return poor_pct, working_pct, rich_pct


def _sheriff_candidate_class_bonus(cand_class: str, poor_pct: float, working_pct: float, rich_pct: float) -> float:
    """Бедные — за «честных» кандидатов, богатые — за «коррумпированных»."""
    if cand_class in ("poor", "critical", "working", "middle"):
        return poor_pct * 1000
    if cand_class in ("rich", "elite"):
        return rich_pct * 1000
    return working_pct * 700


def reset_inherited_sheriff_approval():
    """One-time fix: inherited sheriffs often keep 100% approval from pre-election era."""
    cur.execute(
        """
        UPDATE sheriff_state
        SET approval_rating = 50
        WHERE is_active = true
          AND approval_rating = 100
          AND (days_in_office > 0 OR days_in_office IS NULL)
        """
    )
    if cur.rowcount:
        print(
            f"Sheriff: reset inherited approval 100→50 for {cur.rowcount} active sheriff(s)",
            flush=True,
        )


def ensure_tables():
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sheriff_state (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            agent_name VARCHAR(100),
            sheriff_type VARCHAR(20),
            approval_rating INTEGER DEFAULT 50,
            police_budget NUMERIC(20,2) DEFAULT 300,
            police_count INTEGER DEFAULT 20,
            coup_points INTEGER DEFAULT 0,
            corruption_level INTEGER DEFAULT 0,
            term_number INTEGER DEFAULT 1,
            days_in_office INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            started_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        "ALTER TABLE sheriff_state ADD COLUMN IF NOT EXISTS coup_points INTEGER DEFAULT 0"
    )
    cur.execute(
        "ALTER TABLE sheriff_state ADD COLUMN IF NOT EXISTS corruption_level INTEGER DEFAULT 0"
    )


def get_sheriff():
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def sheriff_budget_warning(sheriff):
    """Low police budget: no hiring, demoralized force."""
    budget = float(sheriff.get("police_budget") or 0)
    if budget >= 100:
        return
    civ_log_event(
        cur,
        sheriff["agent_id"],
        "sheriff_action",
        f"URGENT: Sheriff {sheriff['agent_name']} — police budget {budget:.0f} ZION! "
        f"Cannot hire; force efficiency -20%",
        budget,
        priority="urgent",
    )
    print(f"⚠️ Police budget critical: {budget:.0f} ZION")


def run_sheriff_election(forced=False):
    """Run sheriff election with voting, corporate bribes, and sheriff type assignment."""
    reason = "forced early election" if forced else "regular election"
    print(f"Sheriff tick: run_sheriff_election ({reason})...", flush=True)
    print(f"\nSHERIFF ELECTION ({reason})!")

    if not forced:
        cur.execute(
            """
            SELECT started_at FROM sheriff_state
            WHERE is_active = true
            ORDER BY started_at DESC NULLS LAST LIMIT 1
            """
        )
        last_sheriff = cur.fetchone()
        if last_sheriff and last_sheriff.get("started_at"):
            started = last_sheriff["started_at"]
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - started).total_seconds() / 3600
            if age_hours < 12:
                print(f"Sheriff too new ({age_hours:.1f}h) — skipping election")
                return

    cur.execute("SELECT last_sheriff_agent_id FROM civilization_state WHERE id = 1")
    civ = cur.fetchone() or {}
    last_sheriff_id = civ.get("last_sheriff_agent_id")

    cur.execute(
        """
        SELECT id, name, class, charisma, balance FROM agents
        WHERE is_alive = true
        AND charisma > (
            SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY charisma)
            FROM agents WHERE is_alive = true
        )
        AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
        AND (%s IS NULL OR id != %s)
        ORDER BY charisma DESC, RANDOM() LIMIT 6
        """,
        (last_sheriff_id, last_sheriff_id),
    )
    candidates = cur.fetchall()
    if not candidates:
        cur.execute(
            """
            SELECT id, name, class, charisma, balance FROM agents
            WHERE is_alive = true
            AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active = true)
            AND (%s IS NULL OR id != %s)
            ORDER BY charisma DESC, balance DESC
            LIMIT 6
            """,
            (last_sheriff_id, last_sheriff_id),
        )
        candidates = cur.fetchall()
        if not candidates:
            print("No eligible candidates for sheriff election.")
            return None

    print("Sheriff tick: election — fetching corporate bribers...", flush=True)
    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 200
        """
    )
    corps = cur.fetchall()
    bribe_total = 0
    print(f"Sheriff tick: election — corporate bribe loop ({len(corps)} corps)...", flush=True)
    for corp in corps:
        if random.random() < 0.35:
            bribe = round(float(corp["treasury"]) * 0.03, 2)
            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                (bribe, corp["id"]),
            )
            bribe_total += bribe

    if bribe_total > 0:
        log_event(
            None,
            "sheriff_action",
            f"Corporations spent {bribe_total:.0f} ZION bribing sheriff election voters!",
            bribe_total,
        )
        print(f"Corporate election bribes: {bribe_total:.0f} ZION")

    print("Sheriff tick: election — class vote percentages...", flush=True)
    poor_pct, working_pct, rich_pct = _class_vote_percentages()
    poverty_pct = poor_pct

    votes = {c["id"]: 0.0 for c in candidates}

    print(f"Sheriff tick: election — scoring {len(candidates)} candidates...", flush=True)
    for candidate in candidates:
        cand_class = candidate.get("class") or "middle"
        base_votes = float(candidate.get("charisma") or 50) * 0.3
        class_bonus = _sheriff_candidate_class_bonus(cand_class, poor_pct, working_pct, rich_pct)
        random_factor = random.randint(-100, 100)
        total_score = base_votes + class_bonus + random_factor
        if poverty_pct > 0.40 and cand_class in ("poor", "critical", "working", "middle"):
            total_score *= 1.5
        votes[candidate["id"]] = total_score

    winner_id = max(votes, key=votes.get)
    winner = next(c for c in candidates if c["id"] == winner_id)
    winner_votes = int(round(votes[winner_id]))
    total_votes = int(round(sum(votes.values())))

    type_weights = list(TYPE_WEIGHTS)
    type_weights[0] *= 1.0 + poor_pct
    type_weights[1] *= 1.0 + rich_pct
    sheriff_type = random.choices(SHERIFF_TYPES, weights=type_weights)[0]

    cur.execute(
        """
        SELECT police_budget, police_count
        FROM sheriff_state
        WHERE is_active = true
        LIMIT 1
        """
    )
    outgoing = cur.fetchone()
    inherited_budget = float((outgoing or {}).get("police_budget") or 300)
    inherited_count = int((outgoing or {}).get("police_count") or 20)

    record_last_sheriff_agent(cur)
    cur.execute("UPDATE sheriff_state SET is_active = false WHERE is_active = true")
    cur.execute(
        """
        INSERT INTO sheriff_state (
            agent_id, agent_name, sheriff_type,
            approval_rating, police_budget, police_count,
            coup_points, corruption_level, term_number, days_in_office
        )
        VALUES (%s, %s, %s, 50, %s, %s, 0, 0, 1, 0)
        """,
        (winner["id"], winner["name"], sheriff_type, inherited_budget, inherited_count),
    )

    type_desc = {
        "honest": "HONEST — will fight crime and protect citizens",
        "corrupt": "CORRUPT — will take bribes and enable crime",
        "junta": "JUNTA — dangerous military ambitions",
    }

    log_event(
        winner["id"],
        "sheriff_action",
        f"ELECTION RESULTS: Poor vote={poor_pct:.0%} Working={working_pct:.0%} "
        f"Rich={rich_pct:.0%} - Winner: {winner['name']} ({sheriff_type}) "
        f"score {winner_votes}/{total_votes}",
        winner_votes,
    )
    log_event(
        winner["id"],
        "sheriff_action",
        f"{winner['name']} elected Sheriff! Type: {type_desc[sheriff_type]}.",
        winner_votes,
    )
    sync_police_divisions(cur)
    print(
        f"Sheriff elected: {winner['name']} ({sheriff_type}) — "
        f"{winner_votes}/{total_votes} score | poor={poor_pct:.0%} rich={rich_pct:.0%}"
    )
    return winner


def _ai_ordered_raid(sheriff, ai_decision: dict):
    """Execute a police raid on the largest clan per AI sheriff order."""
    print("Sheriff tick: _ai_ordered_raid starting...", flush=True)
    raid_cost = 200.0
    budget = float(sheriff["police_budget"])
    if budget < raid_cost:
        print("Sheriff AI raid skipped: insufficient police budget")
        return
    cur.execute(
        """
        SELECT id, name, members_count FROM clans
        WHERE members_count > 0
        ORDER BY members_count DESC LIMIT 1
        """
    )
    target_clan = cur.fetchone()
    if not target_clan:
        return
    casualties = min(int(target_clan["members_count"] * 0.1), 20)
    cur.execute(
        """
        UPDATE agents SET is_alive=false, died_at=NOW(),
        death_cause='police_raid'
        WHERE id IN (
            SELECT id FROM agents
            WHERE clan_id=%s AND is_alive=true
            ORDER BY RANDOM() LIMIT %s
        )
        """,
        (target_clan["id"], casualties),
    )
    cur.execute(
        """
        UPDATE sheriff_state
        SET police_budget = police_budget - %s
        WHERE is_active = true AND police_budget >= %s
        """,
        (raid_cost, raid_cost),
    )
    sync_police_divisions(cur)
    log_event(
        sheriff["agent_id"],
        "sheriff_action",
        f"AI-ordered raid on {target_clan['name']}: {casualties} casualties",
        raid_cost,
    )
    print(f"Sheriff AI raid on {target_clan['name']}: {casualties} casualties")


def sheriff_actions(sheriff):
    """Daily sheriff actions by type: honest fights crime, corrupt takes bribes, junta attempts coup."""
    print(f"Sheriff tick: sheriff_actions type={sheriff.get('sheriff_type')}...", flush=True)
    sid = sheriff["agent_id"]
    name = sheriff["agent_name"]
    stype = sheriff["sheriff_type"]
    budget = float(sheriff["police_budget"])
    police = sheriff["police_count"]
    approval = sheriff["approval_rating"]
    approval_change = 0

    # Read AI Sheriff decision
    print("Sheriff tick: fetching AI decision...", flush=True)
    ai_decision = get_latest_ai_decision(cur, "sheriff")
    ai_action = ai_decision.get("action", "")
    force_raid = False
    extra_hire = 0

    if ai_action == "raid_gang":
        force_raid = True
        print(
            f"Sheriff executing AI-ordered raid: "
            f"{ai_decision.get('reasoning', '')[:80]}"
        )
    elif ai_action == "hire_police":
        extra_hire = min(int(float(ai_decision.get("amount", 0) or 0) / 100), 20)
        print(f"Sheriff hiring {extra_hire} extra officers per AI order")

    print("Sheriff tick: corporate protection fees...", flush=True)
    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 100
        """
    )
    corps = cur.fetchall()
    corp_income = 0
    print(f"Sheriff tick: corp fee loop ({len(corps)} corps)...", flush=True)
    for corp in corps:
        protection_fee = round(float(corp["treasury"]) * 0.02, 2)
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (protection_fee, corp["id"]),
        )
        corp_income += protection_fee

    cur.execute(
        "UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active = true",
        (corp_income,),
    )
    print(f"Corporate protection fees: +{corp_income:.0f} ZION")

    if stype == "honest":
        print("Sheriff tick: honest — crackdown on criminals...", flush=True)
        cur.execute(
            """
            SELECT id, name, balance FROM agents
            WHERE is_alive = true AND dust_days > 2
            ORDER BY RANDOM() LIMIT 5
            """
        )
        criminals = cur.fetchall()
        fines = 0
        print(f"Sheriff tick: honest — fine loop ({len(criminals)} targets)...", flush=True)
        for criminal in criminals:
            fine = round(min(float(criminal["balance"]) * 0.2, 30), 2)
            cur.execute(
                "UPDATE agents SET balance = balance - %s WHERE id = %s",
                (fine, criminal["id"]),
            )
            fines += fine

        cur.execute(
            "UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active = true",
            (fines,),
        )

        if budget >= 200:
            new_cops = random.randint(2, 8)
            hire_bonus = 10.0
            cost = round(new_cops * hire_bonus, 2)
            cur.execute(
                """
                UPDATE sheriff_state
                SET police_count = police_count + %s, police_budget = police_budget - %s
                WHERE is_active = true AND police_budget >= %s
                """,
                (new_cops, cost, cost),
            )
            if cur.rowcount == 1:
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s, class = 'poor'
                    WHERE is_alive = true AND class = 'critical'
                    AND id IN (
                        SELECT id FROM agents WHERE class = 'critical'
                        ORDER BY RANDOM() LIMIT %s
                    )
                    """,
                    (hire_bonus, new_cops),
                )
            police += new_cops

        log_event(
            sid,
            "sheriff_action",
            f"Sheriff {name} cracked down on crime! Collected {fines:.0f} ZION in fines. "
            f"Police force: {police} officers.",
            fines,
        )
        approval_change = random.randint(5, 12)
        print(f"Honest sheriff: {fines:.0f} ZION in fines collected")

    elif stype == "corrupt":
        print("Sheriff tick: corrupt — clan bribes...", flush=True)
        cur.execute(
            """
            SELECT id, name, treasury FROM clans
            WHERE treasury > 200
            ORDER BY RANDOM() LIMIT 2
            """
        )
        clans = cur.fetchall()
        bribes = 0
        print(f"Sheriff tick: corrupt — bribe loop ({len(clans)} clans)...", flush=True)
        for clan in clans:
            bribe = round(float(clan["treasury"]) * 0.08, 2)
            cur.execute(
                "UPDATE clans SET treasury = treasury - %s WHERE id = %s",
                (bribe, clan["id"]),
            )
            sheriff_share = round(bribe * 0.7, 2)
            zrs_share = round(bribe - sheriff_share, 2)
            cur.execute(
                "UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active = true",
                (sheriff_share,),
            )
            if zrs_share > 0:
                zrs_add_reserve(cur, zrs_share)
            bribes += bribe

        log_event(
            sid,
            "sheriff_action",
            f"CORRUPT Sheriff {name} took {bribes:.0f} ZION in clan bribes! "
            f"Crime flourishes. Police look the other way.",
            bribes,
        )
        approval_change = -random.randint(10, 20)

        print("Sheriff tick: corrupt — shake-down loop...", flush=True)
        cur.execute(
            """
            SELECT id FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical')
            ORDER BY RANDOM() LIMIT 50
            """
        )
        shake_targets = cur.fetchall()
        shake = round(3.0 * len(shake_targets), 2)
        print(f"Sheriff tick: corrupt — shaking {len(shake_targets)} agents...", flush=True)
        for row in shake_targets:
            cur.execute(
                "UPDATE agents SET balance = GREATEST(0, balance - 3) WHERE id = %s",
                (row["id"],),
            )
        if shake > 0:
            cur.execute(
                """
                UPDATE sheriff_state SET police_budget = police_budget + %s
                WHERE is_active = true
                """,
                (shake,),
            )
        print(f"Corrupt sheriff: {bribes:.0f} ZION in bribes")

    elif stype == "junta":
        print("Sheriff tick: junta — military expansion...", flush=True)
        # Junta actively builds military power
        if budget > 80:
            new_cops = random.randint(5, 15)
            hire_bonus = 8.0
            cost = round(new_cops * hire_bonus, 2)
            cur.execute(
                """
                UPDATE sheriff_state SET police_count = police_count + %s,
                police_budget = police_budget - %s
                WHERE is_active=true AND police_budget >= %s
                """,
                (new_cops, cost, cost),
            )
            if cur.rowcount == 1:
                cur.execute(
                    """
                    UPDATE agents SET balance = balance + %s, class = 'poor'
                    WHERE is_alive=true AND class='critical'
                    AND id IN (SELECT id FROM agents WHERE class='critical' ORDER BY RANDOM() LIMIT %s)
                    """,
                    (hire_bonus, new_cops),
                )
            log_event(sid, 'sheriff_action',
                     f"⚔️ Junta Sheriff {name} expands military! Recruited {new_cops} officers. Total: {police + new_cops}. Budget: -{cost} ZION",
                     cost)
            print(f"⚔️ Junta: +{new_cops} officers hired")
        
        # Raid clans for funding
        cur.execute("SELECT id, name, treasury FROM clans WHERE treasury > 200 ORDER BY RANDOM() LIMIT 1")
        clan_target = cur.fetchone()
        if clan_target:
            seized = round(float(clan_target['treasury']) * 0.15, 2)
            cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s", (seized, clan_target['id']))
            cur.execute("UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active=true", (seized,))
            log_event(sid, 'sheriff_action',
                     f"⚔️ Junta forces seized {seized:.0f} ZION from {clan_target['name']}! Military growing stronger.",
                     seized)
            print(f"⚔️ Junta seized {seized:.0f} from {clan_target['name']}")
        
        if approval < 30 or random.random() < 0.1:
            print("Sheriff tick: junta — coup attempt branch...", flush=True)
            cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
            president = cur.fetchone()

            if president and random.random() < 0.4:
                print("Sheriff tick: junta — executing coup (transfer_power)...", flush=True)
                cur.execute(
                    "UPDATE agents SET balance = balance - 100 WHERE id = %s",
                    (president["agent_id"],),
                )
                transfer_power(
                    cur,
                    f"COUP! Sheriff {name} arrested President {president['agent_name']}! "
                    f"Military junta takes control!",
                    new_agent_id=sid,
                    new_agent_name=name,
                    new_party="junta",
                    phase="interim",
                    is_dictator=True,
                    dictatorship_mode=True,
                    log_agent_id=sid,
                )
                print(f"COUP! Sheriff arrested President {president['agent_name']}!")

                cur.execute("SELECT COUNT(*) AS cnt FROM agents WHERE is_alive = true")
                total = cur.fetchone()["cnt"]
                deaths = int(total * random.uniform(0.05, 0.15))
                cur.execute(
                    """
                    UPDATE agents
                    SET is_alive = false, died_at = NOW(), death_cause = 'killed in coup resistance'
                    WHERE is_alive = true
                    AND id IN (
                        SELECT id FROM agents WHERE is_alive = true
                        ORDER BY RANDOM() LIMIT %s
                    )
                    """,
                    (deaths,),
                )
                log_event(
                    None,
                    "sheriff_action",
                    f"Coup resistance crushed! {deaths} agents killed in street fighting.",
                    deaths * 10,
                )
                print(f"Coup casualties: {deaths} agents killed")
                approval_change = -10
            else:
                log_event(
                    sid,
                    "sheriff_action",
                    f"Sheriff {name} (JUNTA) attempted coup but failed. Tensions rise.",
                    0,
                )
                approval_change = -8
                print("Junta coup attempt failed")
        else:
            log_event(
                sid,
                "sheriff_action",
                f"Sheriff {name} (JUNTA) bides his time. Approval: {approval}%",
                0,
            )
            approval_change = -5
            print("Junta sheriff biding time")

    if force_raid:
        print("Sheriff tick: force_raid — AI ordered raid...", flush=True)
        _ai_ordered_raid(sheriff, ai_decision)
        cur.execute("SELECT police_count FROM sheriff_state WHERE is_active = true LIMIT 1")
        row = cur.fetchone()
        if row:
            police = int(row["police_count"] or police)

    if extra_hire > 0:
        hire_cost = round(extra_hire * 100.0, 2)
        cur.execute(
            """
            UPDATE sheriff_state
            SET police_count = police_count + %s,
                police_budget = police_budget - %s
            WHERE is_active = true AND police_budget >= %s
            """,
            (extra_hire, hire_cost, hire_cost),
        )
        if cur.rowcount:
            police += extra_hire
            sync_police_divisions(cur)

    new_approval = max(0, min(100, approval + approval_change))
    cur.execute(
        """
        UPDATE sheriff_state
        SET approval_rating = %s, days_in_office = days_in_office + 1
        WHERE is_active = true
        """,
        (new_approval,),
    )
    print(f"Sheriff approval: {approval} -> {new_approval}")


def check_interaction_with_president():
    """Honest sheriff may arrest dictator; corrupt sheriff + dictator causes chaos."""
    print("Sheriff tick: check_interaction_with_president...", flush=True)
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    sheriff = cur.fetchone()
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    president = cur.fetchone()

    if not sheriff or not president:
        return

    is_dictator = president.get("is_dictator", False)

    if is_dictator and sheriff["sheriff_type"] == "honest":
        if random.random() < 0.3:
            cur.execute(
                """
                UPDATE president_state
                SET approval_rating = GREATEST(0, approval_rating - 20)
                WHERE is_active = true
                """
            )
            log_event(
                sheriff["agent_id"],
                "sheriff_action",
                f"Sheriff {sheriff['agent_name']} REFUSES to support dictator "
                f"{president['agent_name']}! Police stand with the people!",
                0,
            )
            print(f"Sheriff {sheriff['agent_name']} defies dictator")

            cur.execute(
                "SELECT approval_rating FROM president_state WHERE is_active = true LIMIT 1"
            )
            row = cur.fetchone()
            current_approval = row["approval_rating"] if row else president["approval_rating"]

            if current_approval < 25:
                cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
                log_event(
                    sheriff["agent_id"],
                    "sheriff_action",
                    f"Sheriff {sheriff['agent_name']} ARRESTED dictator "
                    f"{president['agent_name']}! Democracy restored!",
                    0,
                )
                print(f"Dictator {president['agent_name']} arrested by sheriff!")

    elif is_dictator and sheriff["sheriff_type"] == "corrupt":
        if random.random() < 0.2:
            cur.execute("SELECT COUNT(*) AS cnt FROM agents WHERE is_alive = true")
            total = cur.fetchone()["cnt"]
            victims = int(total * random.uniform(0.03, 0.08))
            cur.execute(
                """
                UPDATE agents
                SET is_alive = false, died_at = NOW(), death_cause = 'oppressed by corrupt regime'
                WHERE is_alive = true AND class IN ('poor', 'critical')
                AND id IN (
                    SELECT id FROM agents ORDER BY RANDOM() LIMIT %s
                )
                """,
                (victims,),
            )
            log_event(
                None,
                "sheriff_action",
                f"CORRUPT REGIME: Dictator + Corrupt Sheriff oppress citizens! "
                f"{victims} poor agents killed! City in chaos!",
                victims * 10,
            )
            print(f"Corrupt regime chaos: {victims} victims")


def check_term_end(sheriff):
    """10 days per term, max 2 terms; junta sheriff may refuse to leave."""
    days = sheriff["days_in_office"]
    term = sheriff["term_number"]

    if days >= TERM_DAYS and term == 1:
        cur.execute(
            """
            UPDATE sheriff_state
            SET term_number = 2, days_in_office = 0
            WHERE is_active = true
            """
        )
        log_event(
            sheriff["agent_id"],
            "sheriff_action",
            f"Sheriff {sheriff['agent_name']} re-elected for term 2!",
            0,
        )
        print(f"Sheriff {sheriff['agent_name']} re-elected for term 2")

    elif days >= TERM_DAYS and term >= MAX_TERMS:
        if sheriff["sheriff_type"] == "junta" and random.random() < 0.4:
            log_event(
                sheriff["agent_id"],
                "sheriff_action",
                f"Sheriff {sheriff['agent_name']} REFUSES to step down! Military coup imminent!",
                0,
            )
            print(f"Junta sheriff {sheriff['agent_name']} refuses to leave office!")
        else:
            record_last_sheriff_agent(cur)
            cur.execute("UPDATE sheriff_state SET is_active = false WHERE is_active = true")
            log_event(
                sheriff["agent_id"],
                "sheriff_action",
                f"Sheriff {sheriff['agent_name']} completed 2 terms. New election called.",
                0,
            )
            print(f"Sheriff {sheriff['agent_name']} stepped down after 2 terms")
            run_sheriff_election()


def run_governance_tick(tick_cur, ctx: dict) -> dict:
    """Law enforcement step — uses governance tick connection (no second conn)."""
    global cur, conn
    _saved_cur, _saved_conn = cur, conn
    cur = tick_cur
    conn = tick_cur.connection

    print("Sheriff tick: starting...", flush=True)

    try:
        cur.execute(
            "SELECT agent_name, sheriff_type, police_count FROM sheriff_state WHERE is_active=true LIMIT 1"
        )
        sheriff_row = cur.fetchone()
        print(f"Sheriff tick: found sheriff={sheriff_row}", flush=True)

        _sheriff_step("Sheriff tick: ensure_tables...", ensure_tables)
        _sheriff_step(
            "Sheriff tick: reset_inherited_sheriff_approval...",
            reset_inherited_sheriff_approval,
        )
        sheriff = get_sheriff()
        summary = "No sheriff"
        corrupt_flag = False

        if not sheriff:
            print("Sheriff tick: no active sheriff — calling election...", flush=True)
            _sheriff_step("Sheriff tick: run_sheriff_election...", run_sheriff_election)
            sheriff = get_sheriff()

        if sheriff:
            if sheriff["approval_rating"] <= 0:
                print("Sheriff tick: approval 0 — forced election...", flush=True)
                record_last_sheriff_agent(cur)
                cur.execute("UPDATE sheriff_state SET is_active=false WHERE is_active=true")
                conn.commit()
                _sheriff_step("Sheriff tick: run_sheriff_election...", run_sheriff_election, True)
                sheriff = get_sheriff()

            if sheriff:
                _sheriff_step("Sheriff tick: sheriff_budget_warning...", sheriff_budget_warning, sheriff)
                _sheriff_step("Sheriff tick: sheriff_actions...", sheriff_actions, sheriff)
                sheriff = get_sheriff()
                print("Sheriff tick: process_sheriff_orders...", flush=True)
                _sheriff_step("Sheriff tick: process_sheriff_orders (exec)...", process_sheriff_orders, cur, sheriff)
                sheriff = get_sheriff()
                print("Sheriff tick: fetching president for coup check...", flush=True)
                cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
                president = cur.fetchone()
                _sheriff_step("Sheriff tick: attempt_coup...", attempt_coup, cur, sheriff, president)
                _sheriff_step("Sheriff tick: check_interaction_with_president...", check_interaction_with_president)
                if sheriff.get("sheriff_type") == "corrupt" and random.random() < 0.15:
                    corrupt_flag = True
                    print("Sheriff tick: filing corruption court case...", flush=True)
                    from courts import file_case

                    _sheriff_step(
                        "Sheriff tick: file_case...",
                        file_case,
                        cur,
                        sheriff.get("agent_id"),
                        "corruption",
                        f"Whistleblower alleges Sheriff {sheriff.get('agent_name')} took bribes",
                    )
                if not is_uprising_active(cur) and not is_martial_law_active(cur):
                    print("Sheriff tick: sync_police_divisions...", flush=True)
                    _sheriff_step("Sheriff tick: sync_police_divisions (exec)...", sync_police_divisions, cur)
                sheriff = get_sheriff()
                if sheriff:
                    _sheriff_step("Sheriff tick: check_term_end...", check_term_end, sheriff)
                    sheriff = get_sheriff()
                summary = (
                    f"Sheriff {sheriff['agent_name']} ({sheriff['sheriff_type']}) "
                    f"approval {sheriff['approval_rating']}%"
                    if sheriff
                    else "No sheriff after term check"
                )

        ctx["sheriff"] = {"summary": summary, "corrupt_discovered": corrupt_flag}
        print("Sheriff tick: complete", flush=True)
        return ctx

    except TimeoutError as e:
        print(f"Sheriff tick: TIMEOUT — skipping remaining ops: {e}", flush=True)
        ctx["sheriff"] = {"summary": f"Sheriff tick timed out: {e}", "corrupt_discovered": False}
        return ctx
    finally:
        cur, conn = _saved_cur, _saved_conn


def main():
    _init_sheriff_db()
    print(f"\nZION Sheriff System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        ensure_tables()
        reset_inherited_sheriff_approval()
        conn.commit()

        sheriff = get_sheriff()

        if not sheriff:
            print("No active sheriff — calling election!")
            run_sheriff_election()
            conn.commit()
            return

        print(
            f"Sheriff: {sheriff['agent_name']} | Type: {sheriff['sheriff_type']} | "
            f"Approval: {sheriff['approval_rating']}% | "
            f"Day: {sheriff['days_in_office']} | Term: {sheriff['term_number']}"
        )

        if sheriff and sheriff['approval_rating'] <= 0:
            record_last_sheriff_agent(cur)
            cur.execute("UPDATE sheriff_state SET is_active=false WHERE is_active=true")
            log_event(sheriff['agent_id'], 'sheriff_action',
                     f"🗳️ Sheriff {sheriff['agent_name']} removed from office! Approval hit 0%. Emergency election called!",
                     0)
            conn.commit()
            run_sheriff_election(forced=True)
            conn.commit()
            return

        sheriff_budget_warning(sheriff)
        sheriff_actions(sheriff)
        sheriff = get_sheriff()
        process_sheriff_orders(cur, sheriff)
        sheriff = get_sheriff()
        cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
        president = cur.fetchone()
        attempt_coup(cur, sheriff, president)
        check_interaction_with_president()
        check_term_end(sheriff)
        if not is_uprising_active(cur) and not is_martial_law_active(cur):
            sync_police_divisions(cur)

        conn.commit()
        print("\nSheriff cycle complete!")

    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
