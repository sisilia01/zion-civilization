#!/usr/bin/env python3
"""ZION Education — university, police academy, street paths; child maintenance."""
import random
from datetime import datetime

from civ_common import (
    ACADEMY_COST,
    UNIVERSITY_COST,
    ensure_schema,
    get_conn,
    get_cursor,
    log_event,
    zrs_add_reserve,
)

UNIVERSITY_DAYS = 3
ACADEMY_DAYS = 2
CHILD_MAINTENANCE = 2.0
CHILD_MAX_DAY = 7

CORE_TRACKS = ["PHILOSOPHY", "POLITICS", "ECONOMICS"]


def assign_specialization(cur, agent_id: int, education_path: str | None) -> str:
    """Assign discipline track based on education path."""
    path = (education_path or "").lower()
    if path == "academy":
        track = "SECURITY"
    elif path == "street":
        track = random.choice(["ECONOMICS", "SECURITY"])
    else:
        cur.execute(
            """
            SELECT track, COUNT(*) AS book_count
            FROM books
            GROUP BY track
            """
        )
        rows = cur.fetchall()
        tracks = [r["track"] for r in rows]
        weights = [int(r["book_count"] or 0) for r in rows]
        if not tracks:
            track = "PHILOSOPHY"
        else:
            track = random.choices(tracks, weights=weights, k=1)[0]

    cur.execute(
        "UPDATE agents SET specialization_track = %s WHERE id = %s",
        (track, agent_id),
    )
    return track


def backfill_specializations(cur) -> int:
    """One-off: assign specialization_track to agents missing it."""
    cur.execute(
        """
        SELECT id, education_path FROM agents
        WHERE is_alive = true AND specialization_track IS NULL
        """
    )
    updated = 0
    for row in cur.fetchall():
        assign_specialization(cur, row["id"], row.get("education_path"))
        updated += 1
    return updated


def process_children(cur):
    """Day 0-7: child status; parent pays 2 ZION/day maintenance."""
    cur.execute(
        """
        SELECT id, name, parent_id, COALESCE(age_days, 0) AS age_days, balance
        FROM agents
        WHERE is_alive = true AND COALESCE(education_status, 'child') = 'child'
          AND COALESCE(age_days, 0) < %s
        """,
        (CHILD_MAX_DAY,),
    )
    for child in cur.fetchall():
        cur.execute(
            "UPDATE agents SET age_days = age_days + 1 WHERE id = %s",
            (child["id"],),
        )
        pid = child["parent_id"]
        if pid:
            cur.execute(
                "SELECT balance FROM agents WHERE id = %s AND is_alive = true",
                (pid,),
            )
            parent = cur.fetchone()
            if parent and float(parent["balance"] or 0) >= CHILD_MAINTENANCE:
                cur.execute(
                    "UPDATE agents SET balance = balance - %s WHERE id = %s",
                    (CHILD_MAINTENANCE, pid),
                )
                zrs_add_reserve(cur, CHILD_MAINTENANCE)

        age = int(child["age_days"] or 0) + 1
        if age >= CHILD_MAX_DAY:
            bal = float(child["balance"] or 0)
            strength = 0
            cur.execute(
                "SELECT COALESCE(strength, 0) AS s FROM agents WHERE id = %s",
                (child["id"],),
            )
            row = cur.fetchone()
            if row:
                strength = int(row["s"] or 0)

            if bal >= UNIVERSITY_COST:
                path = "university"
                status = "studying_university"
            elif bal >= ACADEMY_COST and strength >= 3:
                path = "academy"
                status = "studying_academy"
            else:
                path = "street"
                status = "street"
                cur.execute(
                    """
                    UPDATE agents SET aggression = LEAST(100, COALESCE(aggression, 10) + 3)
                    WHERE id = %s
                    """,
                    (child["id"],),
                )

            cur.execute(
                """
                UPDATE agents SET
                    education_status = %s,
                    education_path = %s,
                    education_start_day = %s
                WHERE id = %s
                """,
                (status, path, age, child["id"]),
            )
            if path in ("street", "academy"):
                assign_specialization(cur, child["id"], path)
            if path == "street":
                log_event(
                    cur,
                    child["id"],
                    "education",
                    f"Agent {child['name']} took the street path — gang labor unlocked",
                    0,
                    priority="gossip",
                )


def enroll_overgrown_children(cur):
    cur.execute(
        """
        SELECT id, name, COALESCE(age_days,0) AS age_days, balance,
               COALESCE(strength,0) AS strength
        FROM agents
        WHERE is_alive = true
          AND COALESCE(education_status,'child') = 'child'
          AND COALESCE(age_days,0) >= %s
        """,
        (CHILD_MAX_DAY,),
    )
    enrolled = 0
    for child in cur.fetchall():
        bal = float(child["balance"] or 0)
        strength = int(child["strength"] or 0)
        age = int(child["age_days"] or 0)
        if bal >= UNIVERSITY_COST:
            path, status = "university", "studying_university"
        elif bal >= ACADEMY_COST and strength >= 3:
            path, status = "academy", "studying_academy"
        else:
            path, status = "street", "street"
        cur.execute(
            """UPDATE agents SET education_status=%s, education_path=%s,
               education_start_day=%s WHERE id=%s""",
            (status, path, age, child["id"]),
        )
        if path in ("street", "academy"):
            assign_specialization(cur, child["id"], path)
        enrolled += 1
    print(f"  Enrolled {enrolled} overgrown children")
    return enrolled


def process_studying(cur):
    cur.execute(
        """
        SELECT id, name, balance, education_path, education_start_day,
               COALESCE(age_days, 0) AS age_days, intelligence, charisma, strength, loyalty
        FROM agents
        WHERE is_alive = true
          AND education_status IN ('studying_university', 'studying_academy')
        """
    )
    for ag in cur.fetchall():
        age = int(ag["age_days"] or 0)
        start = int(ag["education_start_day"] or 0)
        elapsed = age - start
        path = ag["education_path"]

        if path == "university":
            if elapsed == 0:
                bal = float(ag["balance"] or 0)
                if bal < UNIVERSITY_COST:
                    cur.execute(
                        """
                        UPDATE agents SET education_status = 'street', education_path = 'street'
                        WHERE id = %s
                        """,
                        (ag["id"],),
                    )
                    assign_specialization(cur, ag["id"], "street")
                    continue
                cur.execute(
                    "UPDATE agents SET balance = balance - %s WHERE id = %s",
                    (UNIVERSITY_COST, ag["id"]),
                )
                zrs_add_reserve(cur, UNIVERSITY_COST)
            if elapsed >= UNIVERSITY_DAYS:
                cur.execute(
                    """
                    UPDATE agents SET
                        education_status = 'graduated',
                        intelligence = LEAST(100, COALESCE(intelligence, 10) + 5),
                        charisma = LEAST(100, COALESCE(charisma, 10) + 4)
                    WHERE id = %s
                    """,
                    (ag["id"],),
                )
                log_event(
                    cur,
                    ag["id"],
                    "education",
                    f"Agent {ag['name']} graduated university — manager & politics eligible",
                    UNIVERSITY_COST,
                    priority="normal",
                )
                assign_specialization(cur, ag["id"], "university")
        elif path == "academy":
            if elapsed == 0:
                bal = float(ag["balance"] or 0)
                if bal < ACADEMY_COST:
                    cur.execute(
                        """
                        UPDATE agents SET education_status = 'street', education_path = 'street'
                        WHERE id = %s
                        """,
                        (ag["id"],),
                    )
                    assign_specialization(cur, ag["id"], "street")
                    continue
                cur.execute(
                    "UPDATE agents SET balance = balance - %s WHERE id = %s",
                    (ACADEMY_COST, ag["id"]),
                )
                zrs_add_reserve(cur, ACADEMY_COST)
            if elapsed >= ACADEMY_DAYS:
                cur.execute(
                    """
                    UPDATE agents SET
                        education_status = 'graduated',
                        strength = LEAST(100, COALESCE(strength, 10) + 5),
                        loyalty = LEAST(100, COALESCE(loyalty, 10) + 5)
                    WHERE id = %s
                    """,
                    (ag["id"],),
                )
                log_event(
                    cur,
                    ag["id"],
                    "education",
                    f"Agent {ag['name']} graduated police academy — officer & security eligible",
                    ACADEMY_COST,
                    priority="normal",
                )
                assign_specialization(cur, ag["id"], "academy")

        cur.execute(
            "UPDATE agents SET age_days = age_days + 1 WHERE id = %s",
            (ag["id"],),
        )


def apply_church_school_bonus(cur):
    cur.execute(
        "SELECT school_built FROM church_state WHERE id = 1"
    )
    row = cur.fetchone()
    if row and row.get("school_built"):
        cur.execute(
            """
            UPDATE agents SET intelligence = LEAST(100, COALESCE(intelligence, 10) + 3)
            WHERE is_alive = true AND education_status = 'child'
            """
        )


def tuition_discount(cur, base_cost: float) -> float:
    cur.execute(
        "SELECT COALESCE(tuition_discount_pct, 0) AS d FROM church_state WHERE id = 1"
    )
    row = cur.fetchone()
    discount = float(row["d"] or 0) / 100.0 if row else 0.0
    return round(base_cost * (1 - discount), 2)


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🎓 ZION Education — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        apply_church_school_bonus(cur)
        process_children(cur)
        enroll_overgrown_children(cur)
        process_studying(cur)
        conn.commit()
        print("\n✅ Education cycle complete!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "backfill_specializations":
        conn = get_conn()
        cur = get_cursor(conn)
        ensure_schema(cur)
        try:
            n = backfill_specializations(cur)
            conn.commit()
            print(f"✅ Backfilled specialization_track for {n} agents")
        except Exception as e:
            conn.rollback()
            print(f"❌ Backfill error: {e}")
            raise
        finally:
            cur.close()
            conn.close()
    else:
        main()
