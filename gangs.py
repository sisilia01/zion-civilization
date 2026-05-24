#!/usr/bin/env python3
"""ZION Gang System — territory, extortion, growth tied to unemployment & crime."""
from __future__ import annotations

import random
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, log_event


GANG_NAMES = (
    "Iron Wolves", "Shadow Syndicate", "Crimson Vipers", "Dust Rats",
    "Neon Jackals", "Black Lotus", "Rust Kings", "Void Crew",
)


def ensure_gangs(cur) -> None:
    ensure_schema(cur)
    cur.execute("SELECT COUNT(*) AS c FROM gangs WHERE is_active = true")
    if int((cur.fetchone() or {}).get("c") or 0) > 0:
        return
    cur.execute(
        """
        SELECT c.id, c.name, c.treasury, c.members_count,
               (SELECT a.id FROM agents a WHERE a.clan_id = c.id AND a.is_alive = true LIMIT 1) AS leader_id
        FROM clans c WHERE c.members_count > 0 ORDER BY c.treasury DESC LIMIT 8
        """
    )
    clans = cur.fetchall()
    if clans:
        for clan in clans:
            cur.execute(
                """
                INSERT INTO gangs (name, members, treasury, territory_control, leader_id, gang_health)
                VALUES (%s, %s, %s, %s, %s, 100)
                """,
                (
                    clan["name"],
                    int(clan["members_count"] or 10),
                    float(clan["treasury"] or 100),
                    min(100.0, float(clan["members_count"] or 0) / 10),
                    clan.get("leader_id"),
                ),
            )
    else:
        for name in GANG_NAMES[:5]:
            cur.execute(
                """
                INSERT INTO gangs (name, members, treasury, territory_control, gang_health)
                VALUES (%s, %s, %s, %s, 100)
                """,
                (name, random.randint(10, 50), random.uniform(100, 500), random.uniform(5, 15)),
            )


def gang_growth(cur, metrics: dict) -> int:
    """Gangs grow when unemployment > 50% or crime_rate > 0.4."""
    unemployment = metrics.get("unemployment_rate", 0)
    crime_rate = metrics.get("crime_rate", 0)
    if unemployment <= 50 and crime_rate <= 0.4:
        return 0

    growth_pct = 0.05
    if crime_rate > 0.6:
        growth_pct = 0.08
    if unemployment > 70:
        growth_pct = 0.10

    cur.execute("SELECT id, name, members FROM gangs WHERE is_active = true")
    gangs = cur.fetchall()
    recruited = 0
    for gang in gangs:
        add = max(1, int(gang["members"] * growth_pct))
        cur.execute(
            """
            UPDATE gangs SET members = members + %s,
                territory_control = LEAST(100, territory_control + %s)
            WHERE id = %s
            """,
            (add, add * 0.2, gang["id"]),
        )
        cur.execute(
            """
            SELECT id FROM agents
            WHERE is_alive = true AND clan_id IS NULL
              AND COALESCE(job_status, 'unemployed') = 'unemployed'
            ORDER BY RANDOM() LIMIT %s
            """,
            (add,),
        )
        for ag in cur.fetchall():
            cur.execute(
                "UPDATE agents SET clan_name = %s WHERE id = %s",
                (gang["name"], ag["id"]),
            )
            recruited += 1

    if recruited:
        log_event(
            cur,
            None,
            "gang",
            f"Gangs expand (+{recruited} recruits) — unemployment {unemployment:.0f}%, crime {crime_rate:.0%}",
            recruited,
            priority="urgent",
        )
    return recruited


def gang_revenue(cur) -> float:
    """Extortion: territory_control * 10 ZION/cycle per gang."""
    total = 0.0
    cur.execute(
        "SELECT id, name, territory_control, treasury FROM gangs WHERE is_active = true"
    )
    for gang in cur.fetchall():
        revenue = round(float(gang["territory_control"] or 0) * 10, 2)
        if revenue <= 0:
            continue
        cur.execute(
            """
            SELECT id, treasury FROM corporations
            WHERE is_active = true AND treasury > %s
            ORDER BY RANDOM() LIMIT 1
            """,
            (revenue,),
        )
        corp = cur.fetchone()
        if not corp:
            continue
        taken = min(revenue, float(corp["treasury"] or 0))
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (taken, corp["id"]),
        )
        cur.execute(
            "UPDATE gangs SET treasury = treasury + %s WHERE id = %s",
            (taken, gang["id"]),
        )
        total += taken
    return total


def gang_vs_police(cur, metrics: dict) -> int:
    """Police attacks gangs during crisis; gangs fight back."""
    cur.execute("SELECT police_count FROM sheriff_state WHERE is_active = true LIMIT 1")
    sh = cur.fetchone()
    police_power = int((sh or {}).get("police_count") or 0)
    if is_crisis_active(cur):
        police_power *= 2

    cur.execute("SELECT id, name, gang_health, members FROM gangs WHERE is_active = true")
    gangs = cur.fetchall()
    officers_lost = 0
    for gang in gangs:
        damage = police_power * 2 if is_crisis_active(cur) else police_power * 0.5
        health = float(gang.get("gang_health") or 100) - damage
        if health <= 0:
            cur.execute(
                "UPDATE gangs SET is_active = false, gang_health = 0, members = GREATEST(0, members / 2) WHERE id = %s",
                (gang["id"],),
            )
            cur.execute(
                "UPDATE sheriff_state SET crime_cleared = COALESCE(crime_cleared, 0) + 1 WHERE is_active = true"
            )
            log_event(
                cur,
                None,
                "police_action",
                f"Police dismantles gang {gang['name']}!",
                damage,
                priority="breaking",
            )
        else:
            cur.execute(
                "UPDATE gangs SET gang_health = %s WHERE id = %s",
                (health, gang["id"]),
            )
            if health < 50 and random.random() < 0.3:
                loss = random.randint(1, 3)
                officers_lost += loss
                cur.execute(
                    """
                    UPDATE sheriff_state SET police_count = GREATEST(5, police_count - %s)
                    WHERE is_active = true
                    """,
                    (loss,),
                )
    return officers_lost


def gang_wars(cur) -> int:
    """Territory wars when multiple active gangs."""
    cur.execute(
        "SELECT id, name, territory_control, members FROM gangs WHERE is_active = true ORDER BY RANDOM() LIMIT 2"
    )
    pair = cur.fetchall()
    if len(pair) < 2:
        return 0
    a, b = pair[0], pair[1]
    if random.random() > 0.25:
        return 0
    winner = a if int(a["members"] or 0) >= int(b["members"] or 0) else b
    loser = b if winner["id"] == a["id"] else a
    steal = min(float(loser["territory_control"] or 0) * 0.3, 20)
    cur.execute(
        """
        UPDATE gangs SET territory_control = LEAST(100, territory_control + %s)
        WHERE id = %s
        """,
        (steal, winner["id"]),
    )
    cur.execute(
        """
        UPDATE gangs SET territory_control = GREATEST(0, territory_control - %s),
            members = GREATEST(5, members - %s)
        WHERE id = %s
        """,
        (steal, random.randint(2, 8), loser["id"]),
    )
    log_event(
        cur,
        None,
        "gang_war",
        f"Gang war: {winner['name']} seizes territory from {loser['name']}!",
        steal,
        priority="urgent",
    )
    return 1


def run_cycle() -> dict:
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_gangs(cur)
    metrics = compute_macro_metrics(cur)

    if metrics["crime_rate"] > 0.3:
        gang_growth(cur, metrics)

    revenue = gang_revenue(cur)
    police_loss = gang_vs_police(cur, metrics)
    wars = gang_wars(cur)

    conn.commit()
    cur.close()
    conn.close()
    print(
        f"  Gangs: revenue={revenue:.0f} police_loss={police_loss} wars={wars} "
        f"crime={metrics['crime_rate']:.2f}"
    )
    return {"gang_revenue": revenue, "police_loss": police_loss, "wars": wars}


def main():
    print(f"\n🔫 ZION Gangs — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    run_cycle()
    print("✅ Gangs cycle complete!\n")


if __name__ == "__main__":
    main()
