#!/usr/bin/env python3
"""
ZION Sheriff System — elected sheriff and law enforcement.
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

SHERIFF_TYPES = ["honest", "corrupt", "enforcement"]
TYPE_WEIGHTS = [0.5, 0.35, 0.15]
SHERIFF_TERM_HOURS = 720


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
    """Independent sheriff election — party nominees (senate/police exp) + class popular vote."""
    from senate import (
        PARTY_IDS,
        PARTIES,
        compute_sheriff_popular_vote,
        pick_sheriff_party_nominee,
    )

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
    exclude = {last_sheriff_id} if last_sheriff_id else set()

    nominees: dict = {}
    for party_id in PARTY_IDS:
        row = pick_sheriff_party_nominee(cur, party_id, exclude)
        if row:
            nominees[party_id] = {
                "id": row["id"],
                "name": row["name"],
                "class": row.get("class"),
                "approval_rating": int(row.get("approval_rating") or 50),
                "has_senate_experience": bool(row.get("has_senate_experience")),
                "has_police_experience": bool(row.get("has_police_experience")),
            }

    if len(nominees) < 2:
        print("Sheriff election postponed — need eligible nominees from both parties")
        civ_log_event(
            cur,
            None,
            "sheriff_action",
            "Sheriff election postponed — no qualified candidates (senate/police experience required)",
            0,
            priority="urgent",
        )
        return None

    vote_totals, vote_meta = compute_sheriff_popular_vote(cur, nominees)
    winner_party = max(vote_totals, key=vote_totals.get)
    winner = nominees[winner_party]
    rival_party = next(p for p in vote_totals if p != winner_party)

    poor_pct, working_pct, rich_pct = _class_vote_percentages()
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
            coup_points, corruption_level, term_number, days_in_office, started_at
        )
        VALUES (%s, %s, %s, 50, %s, %s, 0, 0, 1, 0, NOW())
        """,
        (winner["id"], winner["name"], sheriff_type, inherited_budget, inherited_count),
    )

    type_desc = {
        "honest": "HONEST — will fight crime and protect citizens",
        "corrupt": "CORRUPT — will take bribes and enable crime",
        "enforcement": "ENFORCEMENT — expanded police operations within the law",
    }
    qual = []
    if winner.get("has_senate_experience"):
        qual.append("senate")
    if winner.get("has_police_experience"):
        qual.append("police")

    log_event(
        winner["id"],
        "sheriff_action",
        f"SHERIFF ELECTION: {PARTIES[winner_party]['name']} nominee {winner['name']} "
        f"wins {vote_totals[winner_party]:,} vs {vote_totals[rival_party]:,} "
        f"(mood {vote_meta['mood_swing_pct']:+.1f}%) — {sheriff_type}",
        vote_totals[winner_party],
    )
    log_event(
        winner["id"],
        "sheriff_action",
        f"{winner['name']} elected Sheriff! Type: {type_desc[sheriff_type]}. "
        f"Qualifications: {', '.join(qual) or 'experienced'}. Term {SHERIFF_TERM_HOURS}h.",
        vote_totals[winner_party],
    )
    sync_police_divisions(cur)
    print(
        f"Sheriff elected: {winner['name']} ({winner_party}/{sheriff_type}) — "
        f"{vote_totals[winner_party]:,} vs {vote_totals[rival_party]:,} votes"
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
    """Daily sheriff actions by type: honest fights crime, corrupt takes bribes, enforcement expands operations."""
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

    elif stype == "enforcement":
        print("Sheriff tick: constitutional enforcement check", flush=True)
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
                     f"🚔 Sheriff {name} expanded police force: +{new_cops} officers. Total: {police + new_cops}. Budget: -{cost} ZION",
                     cost)
            print("constitutional enforcement check")
        
        # Raid clans for funding
        cur.execute("SELECT id, name, treasury FROM clans WHERE treasury > 200 ORDER BY RANDOM() LIMIT 1")
        clan_target = cur.fetchone()
        if clan_target:
            seized = round(float(clan_target['treasury']) * 0.15, 2)
            cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s", (seized, clan_target['id']))
            cur.execute("UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active=true", (seized,))
            log_event(sid, 'sheriff_action',
                     f"🚔 Sheriff dept recovered {seized:.0f} ZION in lawful asset forfeiture from {clan_target['name']}.",
                     seized)
            print("constitutional enforcement check")

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
                f"Sheriff {sheriff['agent_name']} opens constitutional review of "
                f"President {president['agent_name']} — police uphold the rule of law.",
                0,
            )
            print(f"Sheriff {sheriff['agent_name']} constitutional review")

            cur.execute(
                "SELECT approval_rating FROM president_state WHERE is_active = true LIMIT 1"
            )
            row = cur.fetchone()
            current_approval = row["approval_rating"] if row else president["approval_rating"]

            if current_approval < 25:
                cur.execute("UPDATE president_state SET is_active = false, is_dictator = false WHERE is_active = true")
                log_event(
                    sheriff["agent_id"],
                    "sheriff_action",
                    f"Sheriff {sheriff['agent_name']} enforces Article XV review — "
                    f"President {president['agent_name']} removed; election scheduled.",
                    0,
                )
                print(f"President {president['agent_name']} removed via constitutional review")

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
                f"CORRUPT REGIME CRISIS: unlawful oppression under review — "
                f"{victims} vulnerable agents harmed; Senate emergency session called.",
                victims * 10,
            )
            print(f"Corrupt regime chaos: {victims} victims")


def check_term_end(sheriff):
    """720-hour term (like president); new election when term expires."""
    cur.execute(
        """
        SELECT started_at FROM sheriff_state
        WHERE is_active = true
        ORDER BY started_at DESC NULLS LAST LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row or not row.get("started_at"):
        return

    started = row["started_at"]
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - started).total_seconds() / 3600

    if age_hours < SHERIFF_TERM_HOURS:
        return

    record_last_sheriff_agent(cur)
    cur.execute("UPDATE sheriff_state SET is_active = false WHERE is_active = true")
    log_event(
        sheriff["agent_id"],
        "sheriff_action",
        f"Sheriff {sheriff['agent_name']} completed {SHERIFF_TERM_HOURS}h term. New election called.",
        0,
    )
    print(f"Sheriff {sheriff['agent_name']} term ended ({age_hours:.0f}h) — election")
    run_sheriff_election(forced=True)


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
        elif ctx.get("sheriff_recall"):
            print("Sheriff tick: Senate recall — calling election...", flush=True)
            _sheriff_step("Sheriff tick: run_sheriff_election (recall)...", run_sheriff_election, True)
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
                print("Sheriff tick: constitutional enforcement check", flush=True)
                cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
                president = cur.fetchone()
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
