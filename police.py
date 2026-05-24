#!/usr/bin/env python3
"""ZION Police — gang raids, casualties, corrupt sheriff tip-offs."""
import random
from datetime import datetime

from civ_economics import OFFICER_SALARY, POLICE_MIN_OFFICERS, target_police_officers
from political_economy import crisis_police_multiplier, is_crisis_active
from civ_common import (
    OFFICER_SALARY_PER_CYCLE,
    cleanup_expired_effects,
    effective_crime_multiplier,
    ensure_schema,
    get_conn,
    get_cursor,
    get_division_officers,
    is_martial_law_active,
    is_uprising_active,
    log_event,
    restore_after_martial_law,
    sync_police_divisions,
)


def sync_police_force_to_population(cur) -> int:
    """Scale police_count to ~2% of alive population; hire from unemployed."""
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    alive = int(cur.fetchone()["c"] or 0)
    target = target_police_officers(alive)
    cur.execute(
        "SELECT police_count, police_budget FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    sh = cur.fetchone()
    if not sh:
        return 0
    current = int(sh["police_count"] or 0)
    budget = float(sh["police_budget"] or 0)
    crisis = is_crisis_active(cur)
    mult = crisis_police_multiplier(cur)
    if crisis:
        target = min(target * mult, max(target, alive // 30))
    else:
        max_affordable = int(budget // OFFICER_SALARY) if OFFICER_SALARY > 0 else target
        target = min(target, max(max_affordable, POLICE_MIN_OFFICERS))
    if target <= current:
        return 0
    need = target - current
    cur.execute(
        """
        SELECT id FROM agents
        WHERE is_alive = true
          AND COALESCE(job_status, 'unemployed') = 'unemployed'
          AND employer_corp_id IS NULL
        ORDER BY RANDOM()
        LIMIT %s
        """,
        (need,),
    )
    recruits = cur.fetchall()
    hired = 0
    for row in recruits:
        cur.execute(
            """
            UPDATE agents SET
                job_status = 'employed',
                job_role = 'police',
                employer_corp_id = NULL
            WHERE id = %s
            """,
            (row["id"],),
        )
        hired += 1
    if hired <= 0:
        return 0
    new_count = current + hired
    cur.execute(
        "UPDATE sheriff_state SET police_count = %s WHERE is_active = true",
        (new_count,),
    )
    sync_police_divisions(cur)
    log_event(
        cur,
        None,
        "police_action",
        f"POLICE RECRUITMENT: Force scaled to {new_count} officers ({new_count/max(alive,1)*100:.2f}% of pop)",
        hired,
        priority="normal",
    )
    return hired


def get_sheriff(cur):
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def target_officers_for_budget(budget: float) -> int:
    """Staffing from division budget: floor(budget/10), capped when well-funded."""
    target = int(budget // 10)
    if budget > 500:
        return min(target, 50)
    if budget > 100:
        return min(target, 10)
    return target


def hire_divisions_from_budget(cur):
    """Set each division's officers from its budget; sync sheriff total."""
    if is_uprising_active(cur):
        return 0

    cur.execute("SELECT division_name, officers, budget FROM police_divisions")
    divs = cur.fetchall()
    if not divs:
        return 0

    total = 0
    hired = 0
    for div in divs:
        budget = float(div.get("budget") or 0)
        target = target_officers_for_budget(budget)
        current = int(div.get("officers") or 0)
        if target > current:
            hired += target - current
        total += target
        cur.execute(
            """
            UPDATE police_divisions SET officers = %s
            WHERE division_name = %s
            """,
            (target, div["division_name"]),
        )

    cur.execute(
        "UPDATE sheriff_state SET police_count = %s WHERE is_active = true",
        (max(5, total),),
    )
    return hired


def police_salary_check(cur) -> int:
    """Pay 8 ZION/officer/cycle; underfunded divisions lose officers proportionally."""
    cur.execute(
        "SELECT police_count, police_budget FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    sh = cur.fetchone()
    if not sh:
        return 0

    total_officers = int(sh["police_count"] or 0)
    budget = float(sh["police_budget"] or 0)
    salary_needed = total_officers * OFFICER_SALARY_PER_CYCLE
    if salary_needed <= 0:
        return 0

    if budget >= salary_needed:
        cur.execute(
            """
            UPDATE sheriff_state SET police_budget = police_budget - %s
            WHERE is_active = true
            """,
            (salary_needed,),
        )
        return 0

    paid = budget
    cur.execute(
        "UPDATE sheriff_state SET police_budget = 0 WHERE is_active = true"
    )
    pay_ratio = paid / salary_needed if salary_needed > 0 else 0
    quit_total = max(1, int(total_officers * (1 - pay_ratio)))

    cur.execute("SELECT division_name, officers FROM police_divisions WHERE officers > 0")
    divs = cur.fetchall()
    if not divs:
        new_count = max(5, total_officers - quit_total)
        cur.execute(
            "UPDATE sheriff_state SET police_count = %s WHERE is_active = true",
            (new_count,),
        )
    else:
        div_officer_sum = sum(int(d["officers"] or 0) for d in divs)
        for d in divs:
            share = int(d["officers"] or 0) / max(div_officer_sum, 1)
            loss = max(0, int(quit_total * share))
            new_o = max(0, int(d["officers"] or 0) - loss)
            cur.execute(
                "UPDATE police_divisions SET officers = %s WHERE division_name = %s",
                (new_o, d["division_name"]),
            )
        cur.execute("SELECT COALESCE(SUM(officers), 0) AS s FROM police_divisions")
        new_total = int((cur.fetchone() or {}).get("s") or 0)
        cur.execute(
            "UPDATE sheriff_state SET police_count = %s WHERE is_active = true",
            (max(5, new_total),),
        )

    log_event(
        cur,
        None,
        "police_action",
        f"NORMAL: Officer exodus: {quit_total} police quit unpaid wages!",
        quit_total,
        priority="urgent",
    )
    log_event(
        cur,
        None,
        "police_action",
        "URGENT: Police losing officers — budget depleted!",
        paid,
        priority="urgent",
    )
    print(f"💸 Salary crisis: {quit_total} officers quit (paid {paid:.0f}/{salary_needed:.0f})")
    return quit_total


def gang_strength(cur, clan_id):
    cur.execute(
        """
        SELECT COUNT(*) AS m, COALESCE(AVG(balance), 1) AS avg_b
        FROM agents WHERE clan_id = %s AND is_alive = true
        """,
        (clan_id,),
    )
    r = cur.fetchone()
    return int(r["m"] or 0) * 10 + float(r["avg_b"] or 0)


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    cleanup_expired_effects(cur)
    restore_after_martial_law(cur)
    conn.commit()

    print(f"\n🚔 ZION Police — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    sheriff = get_sheriff(cur)
    if not sheriff:
        print("No sheriff — skipping police cycle")
        conn.close()
        return

    recruited = sync_police_force_to_population(cur)
    if recruited:
        print(f"  Population scaling: +{recruited} officers hired")

    police_salary_check(cur)

    swat_officers = get_division_officers(cur, "SWAT") or int(sheriff.get("police_count") or 20)
    police_strength = swat_officers * 10
    crime_mult = effective_crime_multiplier(cur)
    police_strength = int(police_strength / max(crime_mult, 0.5))
    stype = sheriff.get("sheriff_type") or "honest"
    sname = sheriff.get("agent_name") or "Sheriff"

    if stype == "corrupt" and random.random() < 0.40:
        log_event(
            cur,
            None,
            "police_action",
            f"CORRUPT: Sheriff {sname} tipped off gangs — raid cancelled!",
            0,
            priority="urgent",
        )
        print(f"🤫 {sname} tipped off gangs (corrupt)")
        conn.commit()
        cur.close()
        conn.close()
        return

    cur.execute(
        """
        SELECT c.id, c.name, c.treasury, c.members_count
        FROM clans c
        WHERE c.members_count > 0
        ORDER BY (c.treasury / GREATEST(c.members_count, 1)) ASC
        LIMIT 1
        """
    )
    target = cur.fetchone()
    if not target:
        print("No gang targets")
        conn.commit()
        cur.close()
        conn.close()
        return

    gstr = gang_strength(cur, target["id"])
    success_rate = police_strength / max(police_strength + gstr, 1)
    if is_uprising_active(cur):
        success_rate *= 0.10
        print("⚡ UPRISING: SWAT depleted — raids fail 90% of the time")
    success = random.random() < success_rate

    if success:
        kill_pct = random.uniform(0.10, 0.20)
        cur.execute(
            "SELECT COUNT(*) AS c FROM agents WHERE clan_id = %s AND is_alive = true",
            (target["id"],),
        )
        members = int(cur.fetchone()["c"] or 0)
        deaths = max(1, int(members * kill_pct))
        cur.execute(
            """
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'gang_war'
            WHERE clan_id = %s AND is_alive = true
            AND id IN (
                SELECT id FROM agents WHERE clan_id = %s AND is_alive = true
                ORDER BY RANDOM() LIMIT %s
            )
            """,
            (target["id"], target["id"], deaths),
        )
        seized = round(float(target["treasury"] or 0) * random.uniform(0.2, 0.4), 2)
        cur.execute(
            "UPDATE clans SET treasury = GREATEST(0, treasury - %s) WHERE id = %s",
            (seized, target["id"]),
        )
        cur.execute(
            "UPDATE state_treasury SET police_fund = police_fund + %s WHERE id = 1",
            (seized * 0.7,),
        )
        cur.execute(
            """
            DELETE FROM clan_territory WHERE clan_id = %s AND corp_id IN (
                SELECT corp_id FROM clan_territory WHERE clan_id = %s
                ORDER BY RANDOM() LIMIT 1
            )
            """,
            (target["id"], target["id"]),
        )
        log_event(
            cur,
            None,
            "police_action",
            f"SWAT RAID: Sheriff {sname} crushes {target['name']} hideout! {deaths} dead, {seized:.0f} ZION recovered!",
            seized,
            priority="breaking",
        )
        print(f"✅ Raid on {target['name']}: {deaths} killed, +{seized:.0f} ZION")

        # Reinvest seized funds into recruitment
        recruits = min(3, int(seized / 40))
        if recruits > 0:
            cur.execute(
                """
                UPDATE sheriff_state SET police_count = police_count + %s
                WHERE is_active = true
                """,
                (recruits,),
            )
            print(f"  📋 +{recruits} officers recruited from raid proceeds")
    else:
        loss = random.randint(1, 3)
        cur.execute("SELECT police_count FROM sheriff_state WHERE is_active = true LIMIT 1")
        police_count = int((cur.fetchone() or {}).get("police_count") or 20)
        new_count = max(8, police_count - loss)
        cur.execute(
            "UPDATE sheriff_state SET police_count = %s WHERE is_active = true",
            (new_count,),
        )
        log_event(
            cur,
            None,
            "police_action",
            f"SWAT raid on {target['name']} FAILED! {loss} officers lost. Morale drops.",
            loss,
            priority="urgent",
        )
        print(f"❌ Raid failed: -{loss} officers (no civilian casualties)")

    if not is_uprising_active(cur):
        sync_police_divisions(cur)
        added = hire_divisions_from_budget(cur)
        if added:
            print(f"  👮 Division hiring: +{added} officers (budget-based staffing)")
    conn.commit()
    print("✅ Police cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
