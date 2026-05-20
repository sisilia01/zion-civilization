#!/usr/bin/env python3
"""ZION Corporations — hiring, role salaries, revenue, gang extortion, bankruptcy."""
import random
from datetime import datetime

from civ_common import (
    SECTOR_MULTIPLIERS,
    ensure_schema,
    get_conn,
    get_cursor,
    get_zrs_state,
    log_event,
)

MANAGER_SALARY = 50.0
WORKER_SALARY = 20.0
SECURITY_SALARY = 30.0
MANAGER_MULT = 15
WORKER_MULT = 8
SECURITY_MULT = 0
BANKRUPTCY_CYCLES = 3
EXTORTION_RATE = 0.15
EXTORTION_REDUCTION = 0.50


def sector_multiplier(corp_type: str) -> float:
    return SECTOR_MULTIPLIERS.get(corp_type or "industry", 1.0)


def eligible_for_role(agent: dict, role: str) -> bool:
    path = agent.get("education_path") or ""
    status = agent.get("education_status") or ""
    if role == "manager":
        return path == "university" and status == "graduated"
    if role == "security":
        return path == "academy" and status == "graduated"
    if role == "worker":
        return status in ("graduated", "street", "studying_university", "studying_academy")
    return False


def hire_for_corp(cur, corp: dict):
    """Hire unemployed agents meeting education requirements if corp is profitable."""
    treasury = float(corp["treasury"] or 0)
    if treasury <= 0:
        return 0

    cur.execute(
        """
        SELECT COUNT(*) FILTER (WHERE job_role = 'manager') AS mgr,
               COUNT(*) FILTER (WHERE job_role = 'worker') AS wrk,
               COUNT(*) FILTER (WHERE job_role = 'security') AS sec
        FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        """,
        (corp["id"],),
    )
    counts = cur.fetchone()
    slots = {"manager": 2, "worker": 10, "security": 3}
    role_keys = {"manager": "mgr", "worker": "wrk", "security": "sec"}
    hired = 0

    for role, max_slots in slots.items():
        current = int(counts[role_keys[role]] or 0)
        need = max_slots - current
        if need <= 0:
            continue

        cur.execute(
            """
            SELECT id, name, education_path, education_status, balance
            FROM agents
            WHERE is_alive = true
              AND COALESCE(job_status, 'unemployed') = 'unemployed'
              AND employer_corp_id IS NULL
            ORDER BY RANDOM()
            LIMIT %s
            """,
            (need * 5,),
        )
        for ag in cur.fetchall():
            if not eligible_for_role(ag, role):
                continue
            cur.execute(
                """
                UPDATE agents SET
                    job_status = 'employed',
                    employer_corp_id = %s,
                    job_role = %s
                WHERE id = %s
                """,
                (corp["id"], role, ag["id"]),
            )
            hired += 1
            need -= 1
            if need <= 0:
                break

    if hired:
        cur.execute(
            """
            UPDATE corporations SET employees = (
                SELECT COUNT(*) FROM agents
                WHERE employer_corp_id = %s AND is_alive = true
            ) WHERE id = %s
            """,
            (corp["id"], corp["id"]),
        )
    return hired


def pay_salaries(cur, corp_id: int) -> float:
    total = 0.0
    cur.execute(
        """
        SELECT id, job_role FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        """,
        (corp_id,),
    )
    for ag in cur.fetchall():
        role = ag["job_role"] or "worker"
        salary = {
            "manager": MANAGER_SALARY,
            "worker": WORKER_SALARY,
            "security": SECURITY_SALARY,
        }.get(role, WORKER_SALARY)
        cur.execute(
            """
            UPDATE corporations SET treasury = treasury - %s WHERE id = %s
            """,
            (salary, corp_id),
        )
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (salary, ag["id"]),
        )
        total += salary
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
    log_event(
        cur,
        None,
        "corporation",
        f"Gang extortion: {corp['name']} lost {taken:.0f} ZION"
        + (" (security reduced 50%)" if has_security else " (no security!)"),
        taken,
        priority="urgent",
    )


def fire_all_employees(cur, corp_id: int):
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


def run_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🏢 ZION Corporations — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    zrs = get_zrs_state(cur) or {}
    loans_frozen = bool(zrs.get("loans_frozen"))

    cur.execute(
        """
        SELECT id, name, corp_type, employees, treasury,
               COALESCE(negative_cycles, 0) AS negative_cycles,
               controlled_by_clan_id, is_active
        FROM corporations WHERE is_active = true
        """
    )
    corps = cur.fetchall()

    for corp in corps:
        hired = hire_for_corp(cur, corp)
        if hired:
            print(f"  {corp['name']}: hired {hired}")

        mult = sector_multiplier(corp["corp_type"])
        revenue = compute_revenue(cur, corp["id"], mult)
        payroll = pay_salaries(cur, corp["id"])

        cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
        treasury = float(cur.fetchone()["treasury"] or 0) + revenue - payroll

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
            fire_all_employees(cur, corp["id"])
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
            print(f"💥 BANKRUPT: {corp['name']}")

    conn.commit()
    print("✅ Corporations cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run_cycle()
