#!/usr/bin/env python3
"""
ZION Sheriff System — elected sheriff, law enforcement, and military junta.
"""
import psycopg2
import psycopg2.extras
import random
import traceback
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026",
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

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


def ensure_tables():
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sheriff_state (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            agent_name VARCHAR(100),
            sheriff_type VARCHAR(20),
            approval_rating INTEGER DEFAULT 60,
            police_budget NUMERIC(20,2) DEFAULT 300,
            police_count INTEGER DEFAULT 20,
            term_number INTEGER DEFAULT 1,
            days_in_office INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            started_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def get_sheriff():
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def run_sheriff_election(forced=False):
    """Run sheriff election with voting, corporate bribes, and sheriff type assignment."""
    reason = "forced early election" if forced else "regular election"
    print(f"\nSHERIFF ELECTION ({reason})!")

    cur.execute(
        """
        SELECT id, name, class, charisma, balance FROM agents
        WHERE is_alive = true AND charisma > 50
        AND id NOT IN (SELECT agent_id FROM president_state WHERE is_active=true)
        ORDER BY charisma DESC, RANDOM() LIMIT 6
        """
    )
    candidates = cur.fetchall()
    if not candidates:
        print("No eligible candidates for sheriff election.")
        return None

    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 200
        """
    )
    corps = cur.fetchall()
    bribe_total = 0
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
            "police",
            f"Corporations spent {bribe_total:.0f} ZION bribing sheriff election voters!",
            bribe_total,
        )
        print(f"Corporate election bribes: {bribe_total:.0f} ZION")

    cur.execute("SELECT id, class FROM agents WHERE is_alive = true")
    voters = cur.fetchall()
    votes = {c["id"]: 0 for c in candidates}

    for voter in voters:
        weights = [c["charisma"] + random.randint(0, 30) for c in candidates]
        if voter["class"] in ("poor", "critical"):
            weights = [w + 10 for w in weights]
        winner_idx = weights.index(max(weights))
        votes[candidates[winner_idx]["id"]] += 1

    winner_id = max(votes, key=votes.get)
    winner = next(c for c in candidates if c["id"] == winner_id)
    winner_votes = votes[winner_id]

    sheriff_type = random.choices(SHERIFF_TYPES, weights=TYPE_WEIGHTS)[0]

    cur.execute("UPDATE sheriff_state SET is_active = false WHERE is_active = true")
    cur.execute(
        """
        INSERT INTO sheriff_state (agent_id, agent_name, sheriff_type, police_budget, police_count)
        VALUES (%s, %s, %s, 300, 20)
        """,
        (winner["id"], winner["name"], sheriff_type),
    )

    type_desc = {
        "honest": "HONEST — will fight crime and protect citizens",
        "corrupt": "CORRUPT — will take bribes and enable crime",
        "junta": "JUNTA — dangerous military ambitions",
    }

    log_event(
        winner["id"],
        "police",
        f"{winner['name']} elected Sheriff! Type: {type_desc[sheriff_type]}. "
        f"Votes: {winner_votes}/{len(voters)}",
        winner_votes,
    )
    print(f"Sheriff elected: {winner['name']} ({sheriff_type}) — {winner_votes}/{len(voters)} votes")
    return winner


def sheriff_actions(sheriff):
    """Daily sheriff actions by type: honest fights crime, corrupt takes bribes, junta attempts coup."""
    sid = sheriff["agent_id"]
    name = sheriff["agent_name"]
    stype = sheriff["sheriff_type"]
    budget = float(sheriff["police_budget"])
    police = sheriff["police_count"]
    approval = sheriff["approval_rating"]
    approval_change = 0

    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 100
        """
    )
    corps = cur.fetchall()
    corp_income = 0
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
        cur.execute(
            """
            SELECT id, name, balance FROM agents
            WHERE is_alive = true AND dust_days > 2
            ORDER BY RANDOM() LIMIT 5
            """
        )
        criminals = cur.fetchall()
        fines = 0
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

        if budget > 200:
            new_cops = random.randint(2, 8)
            cost = new_cops * 10
            cur.execute(
                """
                UPDATE sheriff_state
                SET police_count = police_count + %s, police_budget = police_budget - %s
                WHERE is_active = true
                """,
                (new_cops, cost),
            )
            cur.execute(
                """
                UPDATE agents SET balance = balance + 15, class = 'poor'
                WHERE is_alive = true AND class = 'critical'
                AND id IN (
                    SELECT id FROM agents WHERE class = 'critical'
                    ORDER BY RANDOM() LIMIT %s
                )
                """,
                (new_cops,),
            )
            police += new_cops

        log_event(
            sid,
            "police",
            f"Sheriff {name} cracked down on crime! Collected {fines:.0f} ZION in fines. "
            f"Police force: {police} officers.",
            fines,
        )
        approval_change = random.randint(5, 12)
        print(f"Honest sheriff: {fines:.0f} ZION in fines collected")

    elif stype == "corrupt":
        cur.execute(
            """
            SELECT id, name, treasury FROM clans
            WHERE treasury > 200
            ORDER BY RANDOM() LIMIT 2
            """
        )
        clans = cur.fetchall()
        bribes = 0
        for clan in clans:
            bribe = round(float(clan["treasury"]) * 0.08, 2)
            cur.execute(
                "UPDATE clans SET treasury = treasury - %s WHERE id = %s",
                (bribe, clan["id"]),
            )
            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (bribe * 0.7, sid),
            )
            bribes += bribe

        log_event(
            sid,
            "police",
            f"CORRUPT Sheriff {name} took {bribes:.0f} ZION in clan bribes! "
            f"Crime flourishes. Police look the other way.",
            bribes,
        )
        approval_change = -random.randint(10, 20)

        cur.execute(
            """
            UPDATE agents SET balance = balance - 3
            WHERE is_alive = true AND class IN ('poor', 'critical')
            AND id IN (SELECT id FROM agents ORDER BY RANDOM() LIMIT 50)
            """
        )
        print(f"Corrupt sheriff: {bribes:.0f} ZION in bribes")

    elif stype == "junta":
        # Junta actively builds military power
        if budget > 80:
            new_cops = random.randint(5, 15)
            cost = new_cops * 8
            cur.execute("UPDATE sheriff_state SET police_count = police_count + %s, police_budget = police_budget - %s WHERE is_active=true",
                       (new_cops, cost))
            cur.execute("""
                UPDATE agents SET balance = balance + 10, class = 'poor'
                WHERE is_alive=true AND class='critical'
                AND id IN (SELECT id FROM agents WHERE class='critical' ORDER BY RANDOM() LIMIT %s)
            """, (new_cops,))
            log_event(sid, 'police',
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
            log_event(sid, 'police',
                     f"⚔️ Junta forces seized {seized:.0f} ZION from {clan_target['name']}! Military growing stronger.",
                     seized)
            print(f"⚔️ Junta seized {seized:.0f} from {clan_target['name']}")
        
        if approval < 30 or random.random() < 0.1:
            cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
            president = cur.fetchone()

            if president and random.random() < 0.4:
                cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
                cur.execute(
                    "UPDATE agents SET balance = balance - 100 WHERE id = %s",
                    (president["agent_id"],),
                )
                log_event(
                    sid,
                    "police",
                    f"COUP! Sheriff {name} arrested President {president['agent_name']}! "
                    f"Military junta takes control! Martial law declared!",
                    0,
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
                    "police",
                    f"Coup resistance crushed! {deaths} agents killed in street fighting.",
                    deaths * 10,
                )
                print(f"Coup casualties: {deaths} agents killed")
                approval_change = -10
            else:
                log_event(
                    sid,
                    "police",
                    f"Sheriff {name} (JUNTA) attempted coup but failed. Tensions rise.",
                    0,
                )
                approval_change = -8
                print("Junta coup attempt failed")
        else:
            log_event(
                sid,
                "police",
                f"Sheriff {name} (JUNTA) bides his time. Approval: {approval}%",
                0,
            )
            approval_change = -5
            print("Junta sheriff biding time")

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
                "police",
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
                    "police",
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
                "police",
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
            "police",
            f"Sheriff {sheriff['agent_name']} re-elected for term 2!",
            0,
        )
        print(f"Sheriff {sheriff['agent_name']} re-elected for term 2")

    elif days >= TERM_DAYS and term >= MAX_TERMS:
        if sheriff["sheriff_type"] == "junta" and random.random() < 0.4:
            log_event(
                sheriff["agent_id"],
                "police",
                f"Sheriff {sheriff['agent_name']} REFUSES to step down! Military coup imminent!",
                0,
            )
            print(f"Junta sheriff {sheriff['agent_name']} refuses to leave office!")
        else:
            cur.execute("UPDATE sheriff_state SET is_active = false WHERE is_active = true")
            log_event(
                sheriff["agent_id"],
                "police",
                f"Sheriff {sheriff['agent_name']} completed 2 terms. New election called.",
                0,
            )
            print(f"Sheriff {sheriff['agent_name']} stepped down after 2 terms")
            run_sheriff_election()


def main():
    print(f"\nZION Sheriff System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        ensure_tables()
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

        sheriff_actions(sheriff)
        check_interaction_with_president()
        check_term_end(sheriff)

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
