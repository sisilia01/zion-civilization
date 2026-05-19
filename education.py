#!/usr/bin/env python3
"""
ZION Education — study sessions and clan elder mentoring.
Runs every 2 hours (watchdog).
"""
import random
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, log_event

STUDY_COST = 2.0
MIN_BALANCE_TO_STUDY = 5.0
CHARISMA_MAX = 95


def study_sessions(cur):
    """Middle/elite agents with balance > 5 pay 2 ZION to study."""
    cur.execute(
        """
        SELECT id, name, balance, charisma, ambition
        FROM agents
        WHERE is_alive = true
          AND class IN ('middle', 'elite')
          AND balance > %s
        ORDER BY RANDOM()
        LIMIT 25
        """,
        (MIN_BALANCE_TO_STUDY,),
    )
    students = cur.fetchall()
    studied = 0

    for ag in students:
        if random.random() > 0.55:
            continue
        balance = float(ag["balance"] or 0)
        if balance < STUDY_COST + 0.5:
            continue

        cur.execute(
            """
            UPDATE agents SET
                balance = balance - %s,
                charisma = LEAST(%s, COALESCE(charisma, 50) + 2),
                ambition = LEAST(100, COALESCE(ambition, 50) + 1)
            WHERE id = %s
            """,
            (STUDY_COST, CHARISMA_MAX, ag["id"]),
        )
        log_event(
            cur,
            ag["id"],
            "education",
            f"🎓 {ag['name']} studied and gained charisma",
            STUDY_COST,
            priority="normal",
        )
        print(f"🎓 {ag['name']} studied (-{STUDY_COST} ZION, charisma +2, ambition +1)")
        studied += 1

    return studied


def clan_elder_learning(cur):
    """Poor agents in clans with an elite member learn from elders (+1 charisma)."""
    cur.execute(
        """
        SELECT DISTINCT p.id, p.name, p.clan_id
        FROM agents p
        WHERE p.is_alive = true
          AND p.class IN ('poor', 'critical')
          AND p.clan_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM agents e
              WHERE e.clan_id = p.clan_id
                AND e.is_alive = true
                AND e.class = 'elite'
                AND e.id != p.id
          )
        ORDER BY RANDOM()
        LIMIT 20
        """
    )
    learners = cur.fetchall()
    taught = 0

    for ag in learners:
        if random.random() > 0.40:
            continue
        cur.execute(
            """
            UPDATE agents SET charisma = LEAST(%s, COALESCE(charisma, 50) + 1)
            WHERE id = %s
            """,
            (CHARISMA_MAX, ag["id"]),
        )
        log_event(
            cur,
            ag["id"],
            "education",
            f"📖 {ag['name']} learned from clan elders (+1 charisma)",
            0,
            priority="gossip",
        )
        print(f"📖 {ag['name']} learned from clan elders (+1 charisma)")
        taught += 1

    return taught


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🎓 ZION Education — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        studied = study_sessions(cur)
        taught = clan_elder_learning(cur)
        conn.commit()
        print(f"\n✅ Education complete! Studied: {studied} | Clan lessons: {taught}")
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        import traceback

        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
