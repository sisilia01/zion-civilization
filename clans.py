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
    get_latest_ai_decision,
    get_zrs_policy_mode,
    log_event,
    zrs_add_reserve,
)

RECRUIT_BONUS = 5.0
MAX_DOMINANT_GANGS = 3


def police_defections_to_clans(cur) -> int:
    cur.execute("SELECT police_count, police_budget FROM sheriff_state WHERE is_active=true LIMIT 1")
    sheriff = cur.fetchone()
    if not sheriff or float(sheriff.get("police_budget") or 0) >= 100:
        return 0
    defectors = random.randint(1, 5)
    cur.execute(
        "UPDATE sheriff_state SET police_count = GREATEST(0, police_count - %s) WHERE is_active=true",
        (defectors,),
    )
    cur.execute(
        "SELECT id, name FROM clans WHERE members_count > 0 ORDER BY RANDOM() LIMIT 1"
    )
    clan = cur.fetchone()
    if not clan:
        return 0
    cur.execute(
        """
        UPDATE agents SET clan_id = %s, clan_name = %s
        WHERE id IN (
            SELECT id FROM agents
            WHERE is_alive = true AND clan_id IS NULL
              AND class IN ('poor', 'critical', 'working')
            ORDER BY RANDOM() LIMIT %s
        )
        """,
        (clan["id"], clan["name"], defectors),
    )
    assigned = cur.rowcount
    if assigned:
        sync_member_counts(cur)
    log_event(
        cur,
        None,
        "police",
        f"{defectors} officers defected — {assigned} agents joined {clan['name']}",
    )
    return assigned


def gang_retaliation_wave(cur) -> int:
    """After failed police raid — clans strike back."""
    cur.execute(
        "SELECT pending_gang_retaliation, last_raid_failed_clan_id FROM civilization_state WHERE id = 1"
    )
    row = cur.fetchone() or {}
    if not row.get("pending_gang_retaliation"):
        return 0
    clan_id = row.get("last_raid_failed_clan_id")
    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 200
        ORDER BY RANDOM() LIMIT 3
        """
    )
    hit = 0
    for corp in cur.fetchall():
        steal = round(float(corp["treasury"]) * 0.06, 2)
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (steal, corp["id"]),
        )
        if clan_id:
            cur.execute(
                "SELECT id FROM clans WHERE id = %s AND members_count > 0",
                (clan_id,),
            )
            if cur.fetchone():
                cur.execute(
                    "UPDATE clans SET treasury = treasury + %s WHERE id = %s",
                    (steal, clan_id),
                )
        hit += 1
    cur.execute(
        """
        UPDATE civilization_state SET
            pending_gang_retaliation = false,
            last_raid_failed_clan_id = NULL
        WHERE id = 1
        """
    )
    log_event(
        cur,
        None,
        "clan_war",
        f"GANG RETALIATION: {hit} corporations extorted after failed SWAT raid!",
        hit,
        priority="breaking",
    )
    return hit


def run_clan_cycle(cur=None):
    """Full clan/gang cycle — single source of truth for organized crime."""
    own_conn = cur is None
    if own_conn:
        conn = get_conn()
        cur = get_cursor(conn)
        ensure_schema(cur)
        conn.commit()

    try:
        police_defections_to_clans(cur)
        gang_retaliation_wave(cur)

        ai_decision = get_latest_ai_decision(cur, "gangs")
        ai_action = ai_decision.get("action", "")
        force_war = ai_action == "attack_clan"
        extra_recruit = 0
        if ai_action == "recruit_members":
            extra_recruit = min(int(float(ai_decision.get("amount", 0) or 0)), 30)

        sync_member_counts(cur)
        robbed = street_crime(cur)
        recruited = recruit_poor(cur)
        for _ in range(max(0, extra_recruit // 5)):
            recruited += recruit_poor(cur)
        # Extortion handled once per cycle in corporations.gang_extortion()
        expand_territory(cur)
        if force_war or random.random() < 0.4:
            gang_war(cur)
        dissolve_empty_clans(cur)
        cap_dominant_gangs(cur)
        sync_member_counts(cur)
        cap_gang_treasuries(cur)

        if own_conn:
            conn.commit()
        return {"recruited": recruited, "robberies": robbed}
    finally:
        if own_conn:
            cur.close()
            conn.close()


def sync_member_counts(cur):
    cur.execute(
        """
        UPDATE clans c SET members_count = (
            SELECT COUNT(*) FROM agents WHERE clan_id = c.id AND is_alive = true
        )
        """
    )
    cur.execute(
        """
        UPDATE clans SET status = CASE
            WHEN members_count > 0 THEN 'ACTIVE'
            ELSE 'DISBANDED'
        END
        """
    )


def recruit_poor(cur):
    """Character-based gang recruitment (aggression, faith, party, street path)."""
    cur.execute(
        """
        SELECT id, name, balance, aggression, faith, party, education_path
        FROM agents
        WHERE is_alive = TRUE
          AND clan_id IS NULL
          AND (
            COALESCE(aggression, 0) > 60
            OR COALESCE(faith, 50) < 25
            OR party = 'gang_alliance'
            OR (
              education_path = 'street'
              AND COALESCE(aggression, 0) > 40
            )
          )
        ORDER BY aggression DESC, faith ASC
        LIMIT 20
        """
    )
    recruits = cur.fetchall()
    cur.execute(
        "SELECT id, name, treasury FROM clans WHERE members_count > 0 ORDER BY treasury DESC"
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
        log_event(
            cur,
            ag["id"],
            "clan_recruited",
            (
                f"🔫 {clan['name']} recruited {ag['name']} "
                f"(aggression:{ag.get('aggression')}, faith:{ag.get('faith')}, "
                f"path:{ag.get('education_path')})"
            ),
            RECRUIT_BONUS,
        )
        clan["treasury"] = float(clan["treasury"] or 0) - RECRUIT_BONUS
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
            "UPDATE agents SET balance = GREATEST(0, balance - %s) WHERE id = %s",
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

    loser_treasury = float(loser["treasury"] or 0)
    loot = round(loser_treasury * 0.25, 2)
    loot = min(loot, loser_treasury * 0.3)  # максимум 30% казны за раз
    loot = min(loot, 50000)  # абсолютный максимум за одну войну
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
        cur.execute("SELECT treasury FROM clans WHERE id = %s", (clan["id"],))
        row = cur.fetchone()
        remainder = round(float((row or {}).get("treasury") or 0), 2)
        if remainder > 0:
            zrs_add_reserve(cur, remainder)
        cur.execute("DELETE FROM clan_territory WHERE clan_id = %s", (clan["id"],))
        cur.execute(
            "UPDATE clans SET treasury = 0, members_count = 0, status = 'DISBANDED' WHERE id = %s",
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
    print(f"\n⚔️  ZION Clans — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    result = run_clan_cycle()
    print(f"✅ Clans cycle — recruited {result.get('recruited', 0)}, robberies {result.get('robberies', 0)}\n")


if __name__ == "__main__":
    from civ_common import run_db_script

    run_db_script(main, "Clans cycle")
