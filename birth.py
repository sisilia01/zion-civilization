#!/usr/bin/env python3
"""ZION Birth/Death — target population, class demographics, inheritance."""
import random
from datetime import datetime

from civ_common import (
    agent_class_from_balance,
    ensure_schema,
    fund_birth_from_zrs,
    get_conn,
    get_cursor,
    log_event,
    settle_agent_death,
)
from civ_economics import (
    BIRTH_STARTING_BALANCE,
    TARGET_POPULATION,
    agent_class_from_balance as genius_class,
    birth_cap_for_population,
    dynamic_birth_rate,
    pick_birth_class,
)
from names_pool import generate_unique_name

OLD_AGE_DAYS = 100
BIRTH_COST = 50.0
STARVATION_DEBT = 50.0


def birth_name(cur, gender: str) -> str:
    for _ in range(100):
        name, _ = generate_unique_name(cur, gender)
        if name and not any(ch.isdigit() for ch in name):
            return name
    raise RuntimeError("Could not generate a valid birth name without numbers")


def run_birth_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    cur.execute("SELECT COALESCE(AVG(balance), 0) AS a FROM agents WHERE is_alive = TRUE")
    avg_balance = float(cur.fetchone()["a"] or 0)

    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
    alive_total = int(cur.fetchone()["c"] or 0)
    if alive_total == 0:
        from civ_common import zrs_deduct_reserve, ZRS_RESERVE_FLOOR, zrs_reserve

        if zrs_reserve(cur) < ZRS_RESERVE_FLOOR + 600:
            print("Cannot bootstrap: insufficient ZRS reserve")
            cur.close()
            conn.close()
            return
        for i in range(12):
            founder_cost = BIRTH_COST
            if not zrs_deduct_reserve(cur, founder_cost):
                break
            gender = random.choice(["male", "female"])
            founder_name = birth_name(cur, gender)
            founder_class = pick_birth_class()
            child_share = round(founder_cost * 0.20, 2)
            cur.execute(
                """
                INSERT INTO agents (
                    name, class, balance, parent_id, gender,
                    charisma, aggression, faith, intelligence, strength, loyalty,
                    education_status, job_status, age_days, is_alive
                ) VALUES (
                    %s, %s, %s, NULL, %s,
                    %s, %s, %s, %s, %s, %s,
                    'child', 'unemployed', 0, TRUE
                )
                """,
                (
                    founder_name,
                    founder_class,
                    child_share,
                    gender,
                    random.randint(1, 15),
                    random.randint(1, 15),
                    random.randint(1, 20),
                    random.randint(1, 15),
                    random.randint(1, 15),
                    random.randint(1, 15),
                ),
            )
        conn.commit()
        print("🧬 Extinction guard activated: spawned 12 founder agents")
        cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
        alive_total = int(cur.fetchone()["c"] or 0)
    birth_rate = dynamic_birth_rate(alive_total, TARGET_POPULATION)
    max_births = birth_cap_for_population(alive_total, birth_rate)

    print(f"\n👶 ZION Birth Cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(
        f"   Alive: {alive_total:,} | Target: {TARGET_POPULATION:,} | "
        f"Birth rate: {birth_rate*100:.3f}% | Cap: {max_births}"
    )

    deaths_old = 0
    deaths_starvation = 0
    # Evolutionary rule: profitable traders resist death by old age
    _pcur = conn.cursor()
    try:
        _pcur.execute("SELECT agent_id FROM agent_trades WHERE status='CLOSED' GROUP BY agent_id HAVING COALESCE(SUM(pnl),0) > 0")
        _profitable = {row[0] for row in _pcur.fetchall()}
    except Exception:
        _profitable = set()
    finally:
        _pcur.close()

    cur.execute(
        """
        SELECT id, name, balance, COALESCE(age_days, 0) AS age_days, COALESCE(debt, 0) AS debt
        FROM agents WHERE is_alive = TRUE
        """
    )
    for ag in cur.fetchall():
        age = int(ag["age_days"] or 0)
        if age > OLD_AGE_DAYS and ag["id"] not in _profitable:
            settle_agent_death(cur, ag["id"])
            cur.execute(
                """
                UPDATE agents SET is_alive = FALSE, died_at = NOW(), death_cause = 'old_age'
                WHERE id = %s
                """,
                (ag["id"],),
            )
            deaths_old += 1
            log_event(
                cur,
                ag["id"],
                "death",
                f"💀 {ag['name']} died of old age at day {age}",
                0,
                priority="normal",
            )

        bal = float(ag["balance"] or 0)
        debt = float(ag["debt"] or 0)
        if bal <= 0 and debt > STARVATION_DEBT:
            settle_agent_death(cur, ag["id"])
            cur.execute(
                """
                UPDATE agents SET is_alive = FALSE, died_at = NOW(),
                    death_cause = 'starvation', debt = 0
                WHERE id = %s
                """,
                (ag["id"],),
            )
            deaths_starvation += 1

    cur.execute(
        """
        SELECT id, name FROM agents WHERE is_alive = TRUE ORDER BY RANDOM()
        """
    )
    parents = cur.fetchall()
    random.shuffle(parents)

    births = 0
    for parent in parents:
        if births >= max_births:
            break

        gender = random.choice(["male", "female"])
        child_name = birth_name(cur, gender)
        child_class = pick_birth_class()

        cur.execute(
            """
                INSERT INTO agents (
                    name, class, balance, parent_id, gender,
                    charisma, aggression, faith, intelligence, strength, loyalty,
                    education_status, job_status, age_days, is_alive
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    'child', 'unemployed', 0, TRUE
                ) RETURNING id
            """,
            (
                child_name,
                child_class,
                0,
                parent["id"],
                gender,
                random.randint(1, 15),
                random.randint(1, 15),
                random.randint(1, 20),
                random.randint(1, 15),
                random.randint(1, 15),
                random.randint(1, 15),
            ),
        )
        child_id = cur.fetchone()["id"]
        if not fund_birth_from_zrs(cur, child_id, BIRTH_COST):
            cur.execute("DELETE FROM agents WHERE id = %s", (child_id,))
            continue

        child_share = round(BIRTH_COST * 0.20, 2)
        log_event(
            cur,
            child_id,
            "birth",
            f"New {child_class} citizen {child_name} born to {parent['name']} — "
            f"ZRS birth grant {child_share:.0f} ZION",
            child_share,
            priority="normal",
        )
        print(f"👶 {parent['name']} → {child_name} ({child_class}, {child_share:.0f} ZION)")
        births += 1

    conn.commit()
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()["c"]
    print(
        f"\n📊 Births: {births} | Old age: {deaths_old} | Starvation: {deaths_starvation} | "
        f"Alive: {alive:,}"
    )
    print("✅ Birth cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    from civ_common import run_db_script

    run_db_script(run_birth_cycle, "Birth cycle")
