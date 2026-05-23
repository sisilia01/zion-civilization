#!/usr/bin/env python3
"""ZION Corporations — hiring, role salaries, revenue, gang extortion, bankruptcy."""
import random
from datetime import datetime

from civ_common import (
    SECTOR_MULTIPLIERS,
    ensure_schema,
    get_conn,
    get_cursor,
    log_event,
    set_corporate_crisis,
    zrs_add_reserve,
    zrs_deduct_reserve,
    zrs_reserve,
    ZRS_RESERVE_FLOOR,
)

EMPLOYEE_SALARY = 15.0
MANAGER_MULT = 15
WORKER_MULT = 8
SECURITY_MULT = 0
BANKRUPTCY_CYCLES = 3
EXTORTION_RATE = 0.15
EXTORTION_REDUCTION = 0.50
HIRE_TREASURY_MIN = 500.0
HIRE_REVENUE_MIN = 200.0
LAYOFF_TREASURY = 200.0
MASS_LAYOFF_TREASURY = 50.0


def sector_multiplier(corp_type: str) -> float:
    return SECTOR_MULTIPLIERS.get(corp_type or "industry", 1.0)


def eligible_worker(agent: dict) -> bool:
    status = agent.get("education_status") or ""
    return status in ("graduated", "street", "studying_university", "studying_academy")


def count_employees(cur, corp_id: int) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        """,
        (corp_id,),
    )
    return int((cur.fetchone() or {}).get("c") or 0)


def sync_employee_count(cur, corp_id: int):
    cur.execute(
        """
        UPDATE corporations SET employees = (
            SELECT COUNT(*) FROM agents
            WHERE employer_corp_id = %s AND is_alive = true
        ) WHERE id = %s
        """,
        (corp_id, corp_id),
    )


def fire_one_employee(cur, corp_id: int) -> int:
    cur.execute(
        """
        SELECT id FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        ORDER BY balance DESC
        LIMIT 1
        """,
        (corp_id,),
    )
    row = cur.fetchone()
    if not row:
        return 0
    cur.execute(
        """
        UPDATE agents SET
            job_status = 'unemployed',
            employer_corp_id = NULL,
            job_role = NULL
        WHERE id = %s
        """,
        (row["id"],),
    )
    sync_employee_count(cur, corp_id)
    return 1


def layoff_for_corp(cur, corp: dict) -> int:
    """Treasury-based layoffs before hiring."""
    treasury = float(corp.get("treasury") or 0)
    if treasury < MASS_LAYOFF_TREASURY:
        fired = fire_all_employees(cur, corp["id"])
        if fired:
            print(f"  {corp['name']}: mass layoff ({fired} fired, treasury {treasury:.0f})")
        return fired
    if treasury < LAYOFF_TREASURY:
        if fire_one_employee(cur, corp["id"]):
            print(f"  {corp['name']}: layoff 1 (treasury {treasury:.0f})")
            return 1
    return 0


def hire_for_corp(cur, corp: dict) -> int:
    """Hire workers when treasury and revenue are strong; prioritize poor agents."""
    treasury = float(corp.get("treasury") or 0)
    revenue = float(corp.get("last_cycle_revenue") or 0)
    if treasury <= MASS_LAYOFF_TREASURY or treasury < LAYOFF_TREASURY:
        return 0
    if not (treasury > HIRE_TREASURY_MIN and revenue > HIRE_REVENUE_MIN):
        return 0

    current = count_employees(cur, corp["id"])
    max_employees = max(0, int(treasury // 100))
    to_hire = min(5, max_employees - current)
    if to_hire <= 0:
        return 0

    cur.execute(
        """
        SELECT id, name, education_path, education_status, balance, class
        FROM agents
        WHERE is_alive = true
          AND COALESCE(job_status, 'unemployed') = 'unemployed'
          AND employer_corp_id IS NULL
          AND (class IN ('poor', 'working') OR class IS NULL)
        ORDER BY balance ASC
        LIMIT %s
        """,
        (to_hire * 8,),
    )
    hired = 0
    for ag in cur.fetchall():
        if not eligible_worker(ag):
            continue
        cur.execute(
            """
            UPDATE agents SET
                job_status = 'employed',
                employer_corp_id = %s,
                job_role = 'worker'
            WHERE id = %s
            """,
            (corp["id"], ag["id"]),
        )
        hired += 1
        if hired >= to_hire:
            break

    if hired:
        sync_employee_count(cur, corp["id"])
    return hired


def pay_salaries(cur, corp_id: int) -> float:
    total = 0.0
    cur.execute(
        """
        SELECT id FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        """,
        (corp_id,),
    )
    for ag in cur.fetchall():
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (EMPLOYEE_SALARY, corp_id),
        )
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (EMPLOYEE_SALARY, ag["id"]),
        )
        total += EMPLOYEE_SALARY
    return total


def compute_revenue(cur, corp_id: int, sector_mult: float) -> float:
    cur.execute(
        """
        SELECT job_role, COUNT(*) AS c FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        GROUP BY job_role
        """,
        (corp_id,),
    )
    revenue = 0.0
    for row in cur.fetchall():
        role = row["job_role"] or "worker"
        count = int(row["c"] or 0)
        mult = {
            "manager": MANAGER_MULT,
            "worker": WORKER_MULT,
            "security": SECURITY_MULT,
        }.get(role, WORKER_MULT)
        revenue += count * mult * sector_mult * random.uniform(0.9, 1.1)
    return round(revenue, 2)


def gang_extortion(cur, corp: dict):
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE employer_corp_id = %s AND job_role = 'security' AND is_alive = true
        """,
        (corp["id"],),
    )
    has_security = int(cur.fetchone()["c"] or 0) > 0
    treasury = float(corp["treasury"] or 0)
    if treasury <= 0:
        return

    rate = 0.0 if has_security else EXTORTION_RATE
    if has_security:
        rate = EXTORTION_RATE * (1 - EXTORTION_REDUCTION)

    if rate <= 0:
        return

    taken = round(treasury * rate, 2)
    cur.execute(
        "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
        (taken, corp["id"]),
    )
    clan_id = corp.get("controlled_by_clan_id")
    if clan_id:
        cur.execute(
            "UPDATE clans SET treasury = COALESCE(treasury, 0) + %s WHERE id = %s",
            (taken, clan_id),
        )
    else:
        zrs_add_reserve(cur, taken)
    log_event(
        cur,
        None,
        "corporation",
        f"Gang extortion: {corp['name']} lost {taken:.0f} ZION"
        + (" (security reduced 50%)" if has_security else " (no security!)"),
        taken,
        priority="urgent",
    )


def fire_all_employees(cur, corp_id: int) -> int:
    cur.execute(
        "SELECT COUNT(*) AS c FROM agents WHERE employer_corp_id = %s",
        (corp_id,),
    )
    count = int((cur.fetchone() or {}).get("c") or 0)
    cur.execute(
        """
        UPDATE agents SET
            job_status = 'unemployed',
            employer_corp_id = NULL,
            job_role = NULL
        WHERE employer_corp_id = %s
        """,
        (corp_id,),
    )
    cur.execute("UPDATE corporations SET employees = 0 WHERE id = %s", (corp_id,))
    return count


def layoff_to_gangs(cur, corp_id: int, corp_name: str, count: int):
    """Unemployed agents with balance < 20 join a random gang."""
    cur.execute(
        """
        SELECT id FROM agents
        WHERE is_alive = true AND balance < 20
          AND COALESCE(job_status, 'unemployed') = 'unemployed'
          AND clan_id IS NULL
        ORDER BY RANDOM() LIMIT %s
        """,
        (max(count * 2, 5),),
    )
    agents = cur.fetchall()
    if not agents:
        return
    cur.execute(
        "SELECT id, name FROM clans WHERE members_count >= 0 ORDER BY RANDOM() LIMIT 1"
    )
    clan = cur.fetchone()
    if not clan:
        return
    joined = 0
    for ag in agents[:count]:
        cur.execute(
            """
            UPDATE agents SET clan_id = %s, clan_name = %s
            WHERE id = %s
            """,
            (clan["id"], clan["name"], ag["id"]),
        )
        joined += 1
    if joined:
        log_event(
            cur,
            None,
            "corporation",
            f"Gang {clan['name']} recruits {joined} laid-off workers from {corp_name}",
            joined,
            priority="urgent",
        )


def handle_corp_insolvency(cur, corp: dict, treasury: float) -> bool:
    """Treasury < 0: mass layoffs, bankruptcy."""
    if treasury >= 0:
        return False

    count = fire_all_employees(cur, corp["id"])
    layoff_to_gangs(cur, corp["id"], corp["name"], count)
    cur.execute(
        """
        UPDATE corporations SET is_active = false, employees = 0, treasury = %s
        WHERE id = %s
        """,
        (treasury, corp["id"]),
    )
    cur.execute("DELETE FROM clan_territory WHERE corp_id = %s", (corp["id"],))
    log_event(
        cur,
        None,
        "corporation",
        f"MASS LAYOFFS: {corp['name']} cannot pay {count} workers — treasury {treasury:.0f}",
        abs(treasury),
        priority="breaking",
    )
    print(f"💥 INSOLVENT: {corp['name']} ({count} laid off)")
    return True


def run_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🏢 ZION Corporations — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    cur.execute(
        """
        SELECT id, name, corp_type, employees, treasury,
               COALESCE(negative_cycles, 0) AS negative_cycles,
               COALESCE(last_cycle_revenue, 0) AS last_cycle_revenue,
               controlled_by_clan_id, is_active
        FROM corporations WHERE is_active = true
        """
    )
    corps = cur.fetchall()

    bankrupt_this_cycle = 0

    for corp in corps:
        cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
        corp["treasury"] = float((cur.fetchone() or {}).get("treasury") or 0)

        layoff_for_corp(cur, corp)
        cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
        corp["treasury"] = float((cur.fetchone() or {}).get("treasury") or 0)

        hired = hire_for_corp(cur, corp)
        if hired:
            print(f"  {corp['name']}: hired {hired}")

        mult = sector_multiplier(corp["corp_type"])
        revenue = compute_revenue(cur, corp["id"], mult)
        if revenue > 0 and not zrs_deduct_reserve(cur, revenue):
            revenue = 0.0
        payroll = pay_salaries(cur, corp["id"])

        cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
        treasury = float(cur.fetchone()["treasury"] or 0) + revenue - payroll

        if handle_corp_insolvency(cur, corp, treasury):
            bankrupt_this_cycle += 1
            continue

        neg = int(corp["negative_cycles"] or 0)
        if treasury < 0:
            neg += 1
        else:
            neg = 0

        cur.execute(
            """
            UPDATE corporations SET
                treasury = %s, last_cycle_revenue = %s, revenue = COALESCE(revenue, 0) + %s,
                negative_cycles = %s,
                employees = (
                    SELECT COUNT(*) FROM agents
                    WHERE employer_corp_id = %s AND is_alive = true
                )
            WHERE id = %s
            """,
            (treasury, revenue, revenue, neg, corp["id"], corp["id"]),
        )

        gang_extortion(cur, {**corp, "treasury": treasury})

        if neg >= BANKRUPTCY_CYCLES:
            count = fire_all_employees(cur, corp["id"])
            layoff_to_gangs(cur, corp["id"], corp["name"], count)
            cur.execute(
                "UPDATE corporations SET is_active = false, employees = 0 WHERE id = %s",
                (corp["id"],),
            )
            cur.execute("DELETE FROM clan_territory WHERE corp_id = %s", (corp["id"],))
            log_event(
                cur,
                None,
                "corporation",
                f"Corp {corp['name']} BANKRUPT! Workers unemployed",
                0,
                priority="breaking",
            )
            bankrupt_this_cycle += 1
            print(f"💥 BANKRUPT: {corp['name']}")

    if bankrupt_this_cycle >= 3:
        set_corporate_crisis(cur, True)
        log_event(
            cur,
            None,
            "corporation",
            f"BREAKING: CORPORATE CASCADE: {bankrupt_this_cycle} corporations bankrupt in 24h!",
            bankrupt_this_cycle,
            priority="breaking",
        )
        bailout_each = 5000.0
        cur.execute(
            "SELECT id, name FROM corporations WHERE is_active = true ORDER BY treasury ASC"
        )
        bailed = 0
        for c in cur.fetchall():
            if zrs_reserve(cur) >= ZRS_RESERVE_FLOOR + bailout_each:
                if zrs_deduct_reserve(cur, bailout_each):
                    cur.execute(
                        "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
                        (bailout_each, c["id"]),
                    )
                    bailed += 1
        if bailed > 0:
            log_event(
                cur,
                None,
                "zrs",
                f"CORPORATE CRISIS: ZRS emergency bailout activated — {bailed} corps +{bailout_each:.0f}",
                bailout_each * bailed,
                priority="breaking",
            )
            print(f"🏦 ZRS corporate bailout: {bailed} corps")

    conn.commit()
    print("✅ Corporations cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run_cycle()
