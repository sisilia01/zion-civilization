#!/usr/bin/env python3
"""ZionWork — jobs, pay, charisma growth from work/promotion/firing."""
import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password=os.environ.get("DB_PASSWORD", ""),
)

CHARISMA_MAX = 95
CHARISMA_MIN = 10

TASKS = [
    {"title": "Guard the clan treasury", "reward": 5.0, "skill": "aggression"},
    {"title": "Spy on rival clan", "reward": 8.0, "skill": "charisma"},
    {"title": "Collect taxes from poor", "reward": 3.0, "skill": "aggression"},
    {"title": "Write propaganda for the prophet", "reward": 4.0, "skill": "charisma"},
    {"title": "Train new clan recruits", "reward": 6.0, "skill": "aggression"},
    {"title": "Negotiate peace treaty", "reward": 10.0, "skill": "charisma"},
    {"title": "Build clan fortifications", "reward": 7.0, "skill": "aggression"},
    {"title": "Spread faith among poor", "reward": 4.0, "skill": "faith"},
    {"title": "Organize rebellion suppression", "reward": 9.0, "skill": "aggression"},
    {"title": "Deliver secret message", "reward": 5.0, "skill": "charisma"},
]


def create_table():
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            employer_id INTEGER REFERENCES agents(id),
            worker_id INTEGER REFERENCES agents(id),
            title VARCHAR(100) NOT NULL,
            reward DECIMAL(20,2) NOT NULL,
            skill VARCHAR(20) NOT NULL,
            status VARCHAR(20) DEFAULT 'open',
            created_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP DEFAULT NULL
        )
        """
    )
    conn.commit()
    cur.close()


def adjust_charisma(cur, agent_id, delta, reason=""):
    cur.execute(
        """
        UPDATE agents SET charisma = GREATEST(%s, LEAST(%s, COALESCE(charisma, 50) + %s))
        WHERE id = %s
        RETURNING name, charisma
        """,
        (CHARISMA_MIN, CHARISMA_MAX, delta, agent_id),
    )
    row = cur.fetchone()
    if row and reason:
        print(f"  📈 {row[0]}: charisma {delta:+d} → {row[1]} ({reason})")
    return row


def process_firings(cur):
    """Employers lay off recent workers — charisma -2."""
    cur.execute(
        """
        SELECT DISTINCT j.worker_id, a.name
        FROM jobs j
        JOIN agents a ON a.id = j.worker_id
        WHERE j.status = 'completed'
          AND j.completed_at > NOW() - INTERVAL '48 hours'
          AND a.is_alive = true
        ORDER BY RANDOM()
        LIMIT 5
        """
    )
    workers = cur.fetchall()
    fired = 0
    for worker_id, name in workers:
        if random.random() > 0.25:
            continue
        adjust_charisma(cur, worker_id, -2, "fired")
        cur.execute(
            """
            UPDATE jobs SET status = 'fired'
            WHERE id IN (
                SELECT id FROM jobs
                WHERE worker_id = %s AND status = 'completed'
                ORDER BY completed_at DESC LIMIT 1
            )
            """,
            (worker_id,),
        )
        cur.execute(
            """
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'work', %s, 0)
            """,
            (worker_id, f"{name} was fired — charisma -2"),
        )
        fired += 1
    return fired


def check_promotion(cur, worker_id, worker_name):
    """Five completed jobs → promotion, charisma +3."""
    cur.execute(
        "SELECT COUNT(*) FROM jobs WHERE worker_id = %s AND status = 'completed'",
        (worker_id,),
    )
    total_jobs = cur.fetchone()[0]
    if total_jobs > 0 and total_jobs % 5 == 0:
        adjust_charisma(cur, worker_id, 3, "promoted")
        cur.execute(
            """
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'work', %s, 0)
            """,
            (worker_id, f"🎖️ {worker_name} promoted after {total_jobs} jobs! Charisma +3"),
        )
        return True
    return False


def run_zionwork():
    cur = conn.cursor()

    print(f"\n⚒️  ZionWork - {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    fired_count = process_firings(cur)

    cur.execute(
        """
        SELECT id, name, balance FROM agents
        WHERE is_alive = TRUE AND balance > 20
        ORDER BY RANDOM() LIMIT 3
        """
    )
    employers = cur.fetchall()

    jobs_posted = 0
    charisma_gains = 0

    for emp_id, emp_name, emp_balance in employers:
        if random.random() > 0.40:
            continue

        task = random.choice(TASKS)
        reward = task["reward"]

        cur.execute(
            """
            INSERT INTO jobs (employer_id, title, reward, skill)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (emp_id, task["title"], reward, task["skill"]),
        )
        job_id = cur.fetchone()[0]

        cur.execute(
            "UPDATE agents SET balance = balance - %s WHERE id = %s",
            (reward, emp_id),
        )

        print(f"📋 {emp_name} posted job: '{task['title']}' ({reward} ZION)")
        jobs_posted += 1

        cur.execute(
            f"""
            SELECT id, name, {task['skill']} as skill_val FROM agents
            WHERE is_alive = TRUE AND id != %s
            ORDER BY {task['skill']} DESC, RANDOM() LIMIT 1
            """,
            (emp_id,),
        )
        worker = cur.fetchone()

        if worker:
            worker_id, worker_name, skill_val = worker
            worker_reward = round(reward * 0.98, 2)
            platform_fee = round(reward - worker_reward, 2)

            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (worker_reward, worker_id),
            )
            if platform_fee > 0:
                from civ_common import zrs_add_reserve
                zrs_add_reserve(cur, platform_fee)

            cur.execute(
                """
                UPDATE jobs SET worker_id = %s, status = 'completed', completed_at = NOW()
                WHERE id = %s
                """,
                (worker_id, job_id),
            )

            adjust_charisma(cur, worker_id, 1, "work cycle")
            charisma_gains += 1
            check_promotion(cur, worker_id, worker_name)

            cur.execute(
                """
                INSERT INTO events (agent_id, event_type, description, zion_amount)
                VALUES (%s, 'work', %s, %s)
                """,
                (
                    worker_id,
                    f"{worker_name} completed '{task['title']}' for {emp_name}",
                    worker_reward,
                ),
            )

            print(f"  ✅ {worker_name} completed task! Earned {worker_reward:.2f} ZION (+1 charisma)")

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM jobs WHERE status = 'completed'")
    completed = cur.fetchone()[0]

    print(
        f"\n📊 Jobs posted: {jobs_posted} | Fired: {fired_count} | "
        f"Charisma gains: {charisma_gains} | Total completed: {completed}"
    )
    print("✅ ZionWork cycle complete!\n")
    cur.close()


if __name__ == "__main__":
    create_table()
    run_zionwork()