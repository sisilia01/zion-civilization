#!/usr/bin/env python3
"""ZION Gangs/Clans — extortion, territory, recruitment, wars, street crime."""
import random
from datetime import datetime

from civ_common import (
    CRISIS_ZRS_MODES,
    cap_gang_treasuries,
    ensure_schema,
    get_conn,
    get_cursor,
    get_division_officers,
    get_zrs_policy_mode,
    log_event,
)

RECRUIT_BONUS = 5.0
SIGNING_BALANCE_MAX = 3.0
MAX_DOMINANT_GANGS = 3
EXTORT_RATE = 0.08


def sync_member_counts(cur):
    cur.execute(
        """
        UPDATE clans c SET members_count = (
            SELECT COUNT(*) FROM agents WHERE clan_id = c.id AND is_alive = true
        )
        """
    )


def recruit_poor(cur):
    cur.execute(
        """
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND clan_id IS NULL AND balance < %s
        ORDER BY RANDOM() LIMIT 20
        """,
        (SIGNING_BALANCE_MAX,),
    )
    recruits = cur.fetchall()
    cur.execute(
        "SELECT id, name, treasury FROM clans WHERE members_count >= 0 ORDER BY treasury DESC"
    )
    clans = cur.fetchall()
    if not clans:
        return 0

    joined = 0
    for ag in recruits:
        clan = random.choice(clans)
        if float(clan["treasury"] or 0) < RECRUIT_BONUS:
            continue
        cur.execute(
            "UPDATE clans SET treasury = treasury - %s WHERE id = %s",
            (RECRUIT_BONUS, clan["id"]),
        )
        cur.execute(
            """
            UPDATE agents SET clan_id = %s, clan_name = %s, balance = balance + %s
            WHERE id = %s
            """,
            (clan["id"], clan["name"], RECRUIT_BONUS, ag["id"]),
        )
        joined += 1
    return joined


def street_crime(cur) -> int:
    """Poor rob rich during ZRS crisis; desperation robberies in boom/normal."""
    zrs_mode = get_zrs_policy_mode(cur)
    crisis = zrs_mode in CRISIS_ZRS_MODES
    rob_rate = 0.05 if crisis else 0.01

    cur.execute(
        """
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND balance < 50
        """
    )
    poor_agents = cur.fetchall()
    if not poor_agents:
        return 0

    cur.execute(
        """
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND balance > 500
        """
    )
    rich_agents = cur.fetchall()
    if not rich_agents:
        return 0

    anti_tax = get_division_officers(cur, "ANTI-TAX")
    catch_chance = 0.30 if anti_tax > 0 else 0.05
    robberies = 0

    for robber in poor_agents:
        if random.random() > rob_rate:
            continue
        victim = random.choice(rich_agents)
        vbal = float(victim["balance"] or 0)
        if vbal <= 0:
            continue
        steal_pct = random.uniform(0.10, 0.30)
        stolen = round(vbal * steal_pct, 2)
        if stolen <= 0:
            continue

        if random.random() < catch_chance:
            cur.execute(
                """
                UPDATE agents SET balance = GREATEST(0, balance - 50)
                WHERE id = %s
                """,
                (robber["id"],),
            )
            log_event(
                cur,
                robber["id"],
                "street_crime",
                f"Police caught {robber['name']} robbing {victim['name']}! Jail fine -50 ZION",
                50,
                priority="urgent",
            )
            continue

        cur.execute(
            "UPDATE agents SET balance = balance - %s WHERE id = %s",
            (stolen, victim["id"]),
        )
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (stolen, robber["id"]),
        )
        log_event(
            cur,
            robber["id"],
            "street_crime",
            f"{robber['name']} robbed {victim['name']} for {stolen:.0f} ZION!",
            stolen,
            priority="urgent",
        )
        robberies += 1

    if robberies > 0 and crisis:
        log_event(
            cur,
            None,
            "street_crime",
            f"URGENT: Street crime surges as ZRS enters {zrs_mode} mode — {robberies} robberies!",
            robberies,
            priority="urgent",
        )
    return robberies


def extort_territory(cur):
    cur.execute(
        """
        SELECT ct.clan_id, cl.name AS clan_name, c.id AS corp_id, c.name AS corp_name, c.treasury
        FROM clan_territory ct
        JOIN clans cl ON cl.id = ct.clan_id
        JOIN corporations c ON c.id = ct.corp_id
        WHERE c.is_active = true
        """
    )
    for row in cur.fetchall():
        treasury = float(row["treasury"] or 0)
        if treasury < 10:
            continue
        cut = round(treasury * EXTORT_RATE, 2)
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (cut, row["corp_id"]),
        )
        cur.execute(
            "UPDATE clans SET treasury = treasury + %s WHERE id = %s",
            (cut, row["clan_id"]),
        )
        cur.execute(
            "UPDATE corporations SET controlled_by_clan_id = %s WHERE id = %s",
            (row["clan_id"], row["corp_id"]),
        )


def expand_territory(cur):
    cur.execute(
        """
        SELECT id, name, treasury, members_count FROM clans
        WHERE treasury > 1000 AND members_count > 0
        ORDER BY treasury DESC LIMIT 3
        """
    )
    for clan in cur.fetchall():
        if random.random() > 0.35:
            continue
        cur.execute(
            """
            SELECT c.id, c.name, c.treasury FROM corporations c
            WHERE c.is_active = true
            AND c.id NOT IN (SELECT corp_id FROM clan_territory)
            ORDER BY RANDOM() LIMIT 1
            """
        )
        target = cur.fetchone()
        if not target:
            continue
        gang_power = int(clan["members_count"] or 0) * 10 + float(clan["treasury"]) / 100
        security = int(random.uniform(20, 80))
        if gang_power > security:
            cur.execute(
                "INSERT INTO clan_territory (clan_id, corp_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (clan["id"], target["id"]),
            )
            cur.execute(
                "UPDATE corporations SET controlled_by_clan_id = %s WHERE id = %s",
                (clan["id"], target["id"]),
            )
            log_event(
                cur,
                None,
                "clan_war",
                f"BREAKING: {clan['name']} seized {target['name']}! Territory expanded.",
                float(target["treasury"]) * 0.1,
                priority="urgent",
            )


def gang_war(cur):
    cur.execute(
        """
        SELECT id, name, treasury, members_count FROM clans
        WHERE members_count > 0 ORDER BY RANDOM() LIMIT 2
        """
    )
    clans = cur.fetchall()
    if len(clans) < 2:
        return

    a, b = clans[0], clans[1]
    power_a = float(a["treasury"]) + int(a["members_count"] or 0) * 15
    power_b = float(b["treasury"]) + int(b["members_count"] or 0) * 15
    deaths = random.randint(1, max(3, int((a["members_count"] or 0) * 0.05)))

    if power_a >= power_b:
        winner, loser = a, b
    else:
        winner, loser = b, a

    loot = round(float(loser["treasury"]) * 0.25, 2)
    cur.execute(
        "UPDATE clans SET treasury = treasury + %s, wins = COALESCE(wins,0) + 1 WHERE id = %s",
        (loot, winner["id"]),
    )
    cur.execute(
        "UPDATE clans SET treasury = GREATEST(0, treasury - %s), losses = COALESCE(losses,0) + 1 WHERE id = %s",
        (loot, loser["id"]),
    )
    cur.execute(
        """
        UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'gang_war'
        WHERE clan_id = %s AND is_alive = true
        AND id IN (SELECT id FROM agents WHERE clan_id = %s AND is_alive = true ORDER BY RANDOM() LIMIT %s)
        """,
        (loser["id"], loser["id"], deaths),
    )
    log_event(
        cur,
        None,
        "clan_war",
        f"BREAKING: {winner['name']} defeated {loser['name']} in gang war! {deaths} dead, {loot:.0f} ZION stolen!",
        loot,
        priority="breaking",
    )


def dissolve_empty_clans(cur):
    cur.execute(
        """
        SELECT c.id, c.name FROM clans c
        WHERE NOT EXISTS (
            SELECT 1 FROM agents WHERE clan_id = c.id AND is_alive = true
        ) AND members_count = 0
        """
    )
    for clan in cur.fetchall():
        cur.execute("DELETE FROM clan_territory WHERE clan_id = %s", (clan["id"],))
        cur.execute(
            "UPDATE clans SET treasury = 0, members_count = 0 WHERE id = %s",
            (clan["id"],),
        )


def cap_dominant_gangs(cur):
    cur.execute(
        """
        SELECT c.id, c.name,
               (SELECT COUNT(*) FROM clan_territory ct WHERE ct.clan_id = c.id) AS terr
        FROM clans c
        WHERE members_count > 0
        ORDER BY terr DESC, treasury DESC
        """
    )
    rows = cur.fetchall()
    if len(rows) <= MAX_DOMINANT_GANGS:
        return
    for excess in rows[MAX_DOMINANT_GANGS:]:
        if random.random() < 0.2:
            cur.execute(
                """
                DELETE FROM clan_territory WHERE clan_id = %s AND corp_id IN (
                    SELECT corp_id FROM clan_territory WHERE clan_id = %s LIMIT 1
                )
                """,
                (excess["id"], excess["id"]),
            )


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n⚔️  ZION Clans — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    sync_member_counts(cur)
    robbed = street_crime(cur)
    recruited = recruit_poor(cur)
    extort_territory(cur)
    expand_territory(cur)
    if random.random() < 0.4:
        gang_war(cur)
    dissolve_empty_clans(cur)
    cap_dominant_gangs(cur)
    sync_member_counts(cur)
    cap_gang_treasuries(cur)

    conn.commit()
    print(f"✅ Clans cycle — recruited {recruited}, street robberies {robbed}\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
