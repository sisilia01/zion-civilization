#!/usr/bin/env python3
"""ZION Religion — faith, prayer, church treasury milestones, prophet speeches."""
import random
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, log_event

FAITH_CAP = 100
PRAYER_BASE_RATE = 0.30
TITHE_RATE = 0.005

MILESTONES = [
    (10_000, "clinic_built", 10, "Church built clinic — disease deaths -10%"),
    (50_000, "hospital_built", 25, "Church built hospital — disease deaths -25%"),
    (100_000, "school_built", 0, "Church built school — children +3 intelligence"),
    (200_000, "university_built", 50, "Church built university — tuition -50%"),
]


def ensure_church(cur):
    ensure_schema(cur)
    cur.execute("SELECT * FROM church_state WHERE id = 1")
    if not cur.fetchone():
        cur.execute("INSERT INTO church_state (id) VALUES (1)")


def prayer_probability(faith: int) -> float:
    return min(0.95, PRAYER_BASE_RATE + faith / 200.0)


def process_prayer_cycle(cur):
    cur.execute(
        """
        SELECT id, name, balance, COALESCE(faith, 0) AS faith, clan_id
        FROM agents
        WHERE is_alive = true AND clan_id IS NULL
        """
    )
    agents = cur.fetchall()
    prayers = 0
    tithe_total = 0.0

    for ag in agents:
        faith = int(ag["faith"] or 0)
        if random.random() > prayer_probability(faith):
            continue

        tithe = round(float(ag["balance"] or 0) * TITHE_RATE, 4)
        if tithe > 0:
            cur.execute(
                "UPDATE agents SET balance = balance - %s WHERE id = %s",
                (tithe, ag["id"]),
            )
            tithe_total += tithe

        cur.execute(
            """
            UPDATE agents SET faith = LEAST(%s, COALESCE(faith, 0) + 1), prays = true
            WHERE id = %s
            """,
            (FAITH_CAP, ag["id"]),
        )
        prayers += 1

    if tithe_total > 0:
        cur.execute(
            "UPDATE church_state SET treasury = treasury + %s WHERE id = 1",
            (round(tithe_total, 2),),
        )

    return prayers, tithe_total


def check_milestones(cur):
    cur.execute("SELECT * FROM church_state WHERE id = 1")
    church = cur.fetchone() or {}
    treasury = float(church.get("treasury") or 0)

    for threshold, col, reduction, msg in MILESTONES:
        if treasury >= threshold and not church.get(col):
            updates = {col: True}
            if reduction > 0 and col in ("clinic_built", "hospital_built"):
                cur.execute(
                    "SELECT COALESCE(disease_reduction_pct, 0) AS d FROM church_state WHERE id = 1"
                )
                current = float(cur.fetchone()["d"] or 0)
                updates["disease_reduction_pct"] = min(50, current + reduction)
            if col == "university_built":
                updates["tuition_discount_pct"] = 50

            set_clause = ", ".join(f"{k} = %s" for k in updates)
            cur.execute(
                f"UPDATE church_state SET {set_clause}, updated_at = NOW() WHERE id = 1",
                tuple(updates.values()),
            )
            log_event(cur, None, "religion", msg, threshold, priority="normal")
            print(f"⛪ {msg}")
            cur.execute("SELECT * FROM church_state WHERE id = 1")
            church = cur.fetchone() or {}


def prophet_speech(cur):
    cur.execute(
        """
        SELECT id, name, COALESCE(faith, 0) AS faith, charisma, balance, class
        FROM agents
        WHERE is_alive = true AND COALESCE(charisma, 0) > 5
        ORDER BY faith DESC, charisma DESC
        LIMIT 1
        """
    )
    prophet = cur.fetchone()
    if not prophet:
        return

    cur.execute(
        "SELECT COALESCE(MAX(age_days), 0) AS d FROM agents WHERE is_alive = true"
    )
    max_day = int(cur.fetchone()["d"] or 0)
    if max_day % 7 != 0:
        return

    bal = float(prophet["balance"] or 0)
    is_elite = bal > 2000 or prophet["class"] == "elite"

    prophecies_poor = [
        "The rich must share — the poor shall inherit the city!",
        "No child should hunger while treasuries overflow!",
        "Redistribute ZION to those who bleed for this civilization!",
    ]
    prophecies_elite = [
        "Order above chaos — obey the law of ZION!",
        "Strength and discipline will save us from the gangs!",
        "Prosperity comes to those who work and pay their dues!",
    ]

    if is_elite:
        prophecy = random.choice(prophecies_elite)
        cur.execute(
            """
            UPDATE agents SET faith = GREATEST(0, COALESCE(faith, 0) - 2)
            WHERE is_alive = true AND balance < 100
            """
        )
        log_event(
            cur,
            prophet["id"],
            "religion",
            f"Prophet {prophet['name']} speaks: '{prophecy}' — crime pressure eases",
            0,
            priority="normal",
        )
    else:
        prophecy = random.choice(prophecies_poor)
        cur.execute(
            """
            UPDATE agents SET faith = LEAST(%s, COALESCE(faith, 0) + 2)
            WHERE is_alive = true AND balance < 100
            """,
            (FAITH_CAP,),
        )
        log_event(
            cur,
            prophet["id"],
            "religion",
            f"Prophet {prophet['name']} speaks: '{prophecy}' — poor morale rises",
            0,
            priority="normal",
        )
    print(f"🔮 Prophet {prophet['name']}: '{prophecy}'")


def apply_faith_events(cur):
    """Faith -5 gang, -3 kill; +3 catastrophe survival handled in catastrophes module."""
    pass


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_church(cur)
    conn.commit()

    print(f"\n⛪ ZION Religion — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        prayers, tithes = process_prayer_cycle(cur)
        check_milestones(cur)
        prophet_speech(cur)
        conn.commit()

        cur.execute("SELECT treasury FROM church_state WHERE id = 1")
        treasury = float(cur.fetchone()["treasury"] or 0)
        print(f"Prayers: {prayers} | Tithes: {tithes:.2f} ZION | Church treasury: {treasury:,.0f}")
        print("\n✅ Religion cycle complete!")
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
