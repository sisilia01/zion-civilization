#!/usr/bin/env python3
"""ZION Birth/Death — unique names, inheritance, natural death at day 100."""
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
from names_pool import generate_unique_name

OLD_AGE_DAYS = 100
BIRTH_COST = 50.0


def birth_name(cur, gender: str) -> str:
    """Unique first+surname only — never numeric suffixes."""
    for _ in range(100):
        name, _ = generate_unique_name(cur, gender)
        if name and not any(ch.isdigit() for ch in name):
            return name
    raise RuntimeError("Could not generate a valid birth name without numbers")
STARVATION_DEBT = 50.0


def birth_rate_for_avg(avg_balance: float) -> float:
    if avg_balance > 500:
        return 0.03
    if avg_balance >= 100:
        return 0.02
    if avg_balance >= 50:
        return 0.01
    return 0.005


def birth_chance_for_population(pop: int) -> float:
    """Reduce birth probability as population grows."""
    if pop > 800000:
        return 0.02
    if pop > 600000:
        return 0.05
    if pop > 400000:
        return 0.15
    if pop > 200000:
        return 0.40
    return 1.0


def run_birth_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    cur.execute("SELECT COALESCE(AVG(balance), 0) AS a FROM agents WHERE is_alive = TRUE")
    avg_balance = float(cur.fetchone()["a"] or 0)
    birth_rate = birth_rate_for_avg(avg_balance)

    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
    alive_total = int(cur.fetchone()["c"] or 0)
    birth_chance = birth_chance_for_population(alive_total)
    max_births = max(0, int(alive_total * birth_rate))

    print(f"\n👶 ZION Birth Cycle — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(
        f"   Avg balance: {avg_balance:.1f} | Birth rate: {birth_rate*100:.1f}% | "
        f"Cap: {max_births} | Pop birth chance: {birth_chance*100:.0f}%"
    )

    deaths_old = 0
    deaths_starvation = 0

    cur.execute(
        """
        SELECT id, name, balance, COALESCE(age_days, 0) AS age_days, COALESCE(debt, 0) AS debt
        FROM agents WHERE is_alive = TRUE
        """
    )
    all_agents = cur.fetchall()

    for ag in all_agents:
        age = int(ag["age_days"] or 0)
        if age > OLD_AGE_DAYS:
            settle_agent_death(cur, ag["id"])
            cur.execute(
                """
                UPDATE agents SET is_alive = FALSE, died_at = NOW(),
                    death_cause = 'old_age'
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
        SELECT id, name FROM agents
        WHERE is_alive = TRUE
        ORDER BY RANDOM()
        """
    )
    parents = cur.fetchall()
    random.shuffle(parents)

    births = 0
    for parent in parents:
        if births >= max_births:
            break

        if random.random() > birth_chance:
            continue

        gender = random.choice(["male", "female"])
        child_name = birth_name(cur, gender)

        cur.execute(
            """
            INSERT INTO agents (
                name, class, balance, parent_id, gender,
                charisma, aggression, faith, intelligence, strength, loyalty,
                education_status, job_status, age_days
            ) VALUES (
                %s, 'poor', 0, %s, %s,
                %s, %s, %s, %s, %s, %s,
                'child', 'unemployed', 0
            ) RETURNING id
            """,
            (
                child_name,
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
            f"New citizen {child_name} born to {parent['name']} — ZRS funded {child_share:.0f} ZION",
            child_share,
            priority="normal",
        )
        print(f"👶 {parent['name']} → {child_name} (ZRS birth grant {child_share:.0f} ZION)")
        births += 1

    conn.commit()
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()["c"]
    print(f"\n📊 Births: {births} | Old age: {deaths_old} | Starvation: {deaths_starvation} | Alive: {alive}")
    print("✅ Birth cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run_birth_cycle()
