#!/usr/bin/env python3
"""ZION Corporations — hiring, role salaries, revenue, gang extortion, bankruptcy."""
import random
from datetime import datetime

from civ_economics import (
    CORP_TAX_RATE,
)
from civ_common import (
    SECTOR_MULTIPLIERS,
    ensure_schema,
    get_conn,
    get_cursor,
    get_latest_ai_decision,
    log_event,
    route_corp_tax_revenue,
    set_corporate_crisis,
    zrs_deduct_reserve,
    zrs_reserve,
    ZRS_RESERVE_FLOOR,
)

EMPLOYEE_SALARY = 15.0  # default fallback
SALARY_BY_CLASS = {
    "critical": 8,
    "poor": 10,
    "working": 15,
    "middle": 25,
    "rich": 50,
    "elite": 100,
}
AVG_SALARY = 20  # weighted average for payroll capacity
MANAGER_MULT = 15
WORKER_MULT = 8
SECURITY_MULT = 0
BANKRUPTCY_CYCLES = 3
EXTORTION_RATE = 0.10
EXTORTION_RATE_PROTECTED = 0.03
EXTORTION_MAX_PCT = 0.30
LAYOFF_TREASURY = 200.0
MASS_LAYOFF_TREASURY = 50.0
SALARY_RUNWAY_CYCLES = 3
BREAK_EVEN_CYCLES = 3


def get_hire_limit(treasury: float, unemployment_rate: float) -> int:
    """How many workers can this corp hire this cycle."""
    t = float(treasury or 0)
    u = float(unemployment_rate or 0)
    if u > 70:
        if t >= 10000:
            return 500
        if t >= 5000:
            return 300
        if t >= 2000:
            return 200
        if t >= 1000:
            return 100
        if t >= 500:
            return 50
        return 20
    if t >= 10000:
        return 200
    if t >= 5000:
        return 100
    if t >= 2000:
        return 50
    if t >= 1000:
        return 25
    if t >= 500:
        return 10
    return 5


HIRE_CANDIDATES_SQL = """
    SELECT a.id, a.name, a.class
    FROM agents a
    WHERE a.is_alive = true
    AND a.employer_corp_id IS NULL
    AND a.clan_id IS NULL
    AND a.class != 'elite'
    AND (a.job_status IS NULL
         OR a.job_status NOT IN ('studying', 'employed'))
    ORDER BY
        CASE a.class
            WHEN 'middle' THEN 1
            WHEN 'working' THEN 2
            WHEN 'rich' THEN 3
            WHEN 'poor' THEN 4
            WHEN 'critical' THEN 5
        END,
        RANDOM()
    LIMIT %s
"""


def salary_for_class(cls: str | None) -> float:
    return float(SALARY_BY_CLASS.get((cls or "working").lower(), EMPLOYEE_SALARY))


def sector_multiplier(corp_type: str) -> float:
    return SECTOR_MULTIPLIERS.get(corp_type or "industry", 1.0)


CORP_NAMES = {
    "TECH": ["NexaTech", "QuantumSoft", "CyberCore", "DataVault", "SynthAI", "NovaByte", "GridMind", "PulseTech", "CodeForge", "ZeroPoint"],
    "AGRO": ["GreenHarvest", "TerraFarms", "SeedVault", "CropNation", "AgroMax", "FreshEarth", "GoldFields", "SunHarvest", "RootCorp", "NaturePlex"],
    "PHARMA": ["BioNexus", "CureAll", "MediCore", "PharmaX", "HealthVault", "GeneCure", "VitaLab", "NovaMed", "PureCure", "BioShield"],
    "MEDIA": ["TruthNet", "InfoWave", "NewsCore", "MediaPlex", "DataStream", "ViralNet", "SignalPro", "BroadcastX", "PressCore", "NewsVault"],
    "DEFENSE": ["IronShield", "FortMax", "ArmorTech", "GuardCore", "DefensePlex", "ShieldNet", "SecureBase", "TacticalX", "ForceField", "BattleCore"],
    "FINANCE": ["WealthVault", "CapitalMax", "MoneyFlow", "GoldReserve", "FinancePlex", "CreditCore", "BankMax", "AssetFlow", "TrustVault", "FundNet"],
    "ENERGY": ["PowerGrid", "EnergyMax", "VoltCore", "SolarPlex", "FuelVault", "GridMax", "NuclearNet", "EcoEnergy", "PowerFlow", "VoltMax"],
}


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
    """Treasury-based layoffs — runs AFTER hiring each cycle."""
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


def force_hire_one_employee(cur, corp: dict) -> int:
    """Bootstrap: hire one worker when corp has zero staff but some treasury."""
    cur.execute(HIRE_CANDIDATES_SQL, (1,))
    ag = cur.fetchone()
    if not ag:
        return 0
    agent_id = ag["id"] if isinstance(ag, dict) else ag[0]
    cur.execute(
        """
        UPDATE agents SET
            job_status = 'employed',
            employer_corp_id = %s,
            job_role = 'worker'
        WHERE id = %s
        """,
        (corp["id"], agent_id),
    )
    sync_employee_count(cur, corp["id"])
    return 1


def hire_for_corp(cur, corp: dict, unemployment_rate: float = 0.0) -> int:
    """Hire based on treasury tiers and unemployment crisis level."""
    treasury = float(corp.get("treasury") or 0)
    if treasury <= MASS_LAYOFF_TREASURY:
        return 0

    current = count_employees(cur, corp["id"])
    if current == 0 and treasury > 50:
        forced = force_hire_one_employee(cur, corp)
        if forced:
            return forced

    payroll_capacity = int(treasury / (AVG_SALARY * BREAK_EVEN_CYCLES))
    to_hire = min(get_hire_limit(treasury, unemployment_rate), payroll_capacity)
    if to_hire <= 0:
        return 0

    cur.execute(HIRE_CANDIDATES_SQL, (to_hire,))
    hired = 0
    for ag in cur.fetchall():
        agent_id = ag["id"] if isinstance(ag, dict) else ag[0]
        cur.execute(
            """
            UPDATE agents SET
                job_status = 'employed',
                employer_corp_id = %s,
                job_role = 'worker'
            WHERE id = %s
            """,
            (corp["id"], agent_id),
        )
        hired += 1

    if hired:
        sync_employee_count(cur, corp["id"])
    return hired


def pay_salaries(cur, corp_id: int) -> float:
    cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp_id,))
    treasury_row = cur.fetchone()
    treasury = float((treasury_row or {}).get("treasury") or 0)
    total = 0.0
    cur.execute(
        """
        SELECT id, class FROM agents
        WHERE is_alive = true AND employer_corp_id = %s
        """,
        (corp_id,),
    )
    for ag in cur.fetchall():
        agent_id = ag["id"] if isinstance(ag, dict) else ag[0]
        cls = ag.get("class") if isinstance(ag, dict) else ag[1]
        sal = salary_for_class(cls)
        if treasury < sal:
            break
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (sal, corp_id),
        )
        cur.execute(
            """
            UPDATE agents SET balance = balance + %s
            WHERE id = %s AND is_alive = true
            """,
            (sal, agent_id),
        )
        treasury -= sal
        total += sal
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


def calculate_corp_productivity(cur, corp: dict) -> float:
    # Crime pressure from gang-affiliated agents.
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive=true AND clan_id IS NOT NULL")
    gang_members = int((cur.fetchone() or {}).get("c") or 0)

    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive=true")
    total = max(int((cur.fetchone() or {}).get("c") or 0), 1)

    crime_rate = gang_members / total

    cur.execute("SELECT COALESCE(SUM(police_count),0) AS pc FROM sheriff_state WHERE is_active=true")
    police = float((cur.fetchone() or {}).get("pc") or 0)

    # Police suppresses part of criminal pressure.
    effective_crime = max(0.0, crime_rate - (police / total) * 0.5)

    productivity = 1.0 - (effective_crime * 0.3)
    return max(0.3, productivity)


def corp_has_police_protection(cur, corp: dict) -> bool:
    """3% extortion rate if corp has security staff or recent police bribe."""
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE employer_corp_id = %s AND job_role = 'security' AND is_alive = true
        """,
        (corp["id"],),
    )
    if int((cur.fetchone() or {}).get("c") or 0) > 0:
        return True
    cur.execute(
        """
        SELECT 1 FROM events
        WHERE event_type IN ('corporate', 'corporation')
          AND description ILIKE %s
          AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
        """,
        (f"%{corp['name']}%bribed police%",),
    )
    return cur.fetchone() is not None


def gang_extortion(cur, corp: dict):
    """Single extortion system: 10% unprotected, 3% with police protection, max 30% treasury."""
    treasury = float(corp.get("treasury") or 0)
    if treasury <= 0:
        return

    rate = EXTORTION_RATE_PROTECTED if corp_has_police_protection(cur, corp) else EXTORTION_RATE
    taken = round(min(treasury * rate, treasury * EXTORTION_MAX_PCT), 2)
    if taken <= 0:
        return

    cur.execute(
        "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
        (taken, corp["id"]),
    )

    clan_id = corp.get("controlled_by_clan_id")
    if not clan_id:
        cur.execute(
            """
            SELECT id FROM clans
            WHERE members_count > 0
            ORDER BY treasury DESC LIMIT 1
            """
        )
        row = cur.fetchone()
        clan_id = row["id"] if row else None

    if clan_id:
        cur.execute(
            "UPDATE clans SET treasury = COALESCE(treasury, 0) + %s WHERE id = %s",
            (taken, clan_id),
        )
    log_event(
        cur,
        None,
        "corporation",
        f"Gang extortion: {corp['name']} lost {taken:.0f} ZION ({rate*100:.0f}% rate)",
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
        "SELECT id, name FROM clans WHERE members_count > 0 ORDER BY RANDOM() LIMIT 1"
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


def zrs_corp_bailout(cur) -> int:
    """Emergency bailout for corps stuck at 0 employees."""
    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true
          AND treasury < 200
          AND (
              SELECT COUNT(*) FROM agents
              WHERE employer_corp_id = corporations.id
                AND is_alive = true
          ) = 0
        """
    )
    broke_corps = cur.fetchall()
    for corp in broke_corps:
        bailout = 300
        if not zrs_deduct_reserve(cur, bailout):
            break
        cur.execute(
            "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
            (bailout, corp["id"]),
        )
        print(f"ZRS bailout: {corp['name']} +{bailout} ZION")
    return len(broke_corps)


def run_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🏢 ZION Corporations — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    cur.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE employer_corp_id IS NULL)::float /
            NULLIF(COUNT(*), 0) * 100 AS unemployment_rate
        FROM agents WHERE is_alive = true
        """
    )
    u_row = cur.fetchone() or {}
    unemployment_rate = float(
        u_row.get("unemployment_rate")
        if isinstance(u_row, dict)
        else (u_row[0] if u_row else 0)
        or 0
    )
    print(f"Current unemployment: {unemployment_rate:.1f}%", flush=True)
    if unemployment_rate > 70:
        print("  Crisis hiring mode (unemployment > 70%)", flush=True)

    ai_decision = get_latest_ai_decision(cur, "corporations")
    ai_action = ai_decision.get("action", "")

    if ai_action == "recruit_members":
        print("Corps AI ordered aggressive hiring")
    elif ai_action == "bribe_official":
        print("Corps AI ordered police bribery")
        cur.execute(
            """
            SELECT id, name, treasury FROM corporations
            WHERE is_active = true AND treasury > 500
            ORDER BY treasury DESC LIMIT 1
            """
        )
        briber = cur.fetchone()
        if briber:
            bribe = min(500.0, float(briber["treasury"]) * 0.05)
            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                (bribe, briber["id"]),
            )
            cur.execute(
                """
                UPDATE sheriff_state
                SET police_budget = police_budget + %s
                WHERE is_active = true
                """,
                (bribe,),
            )
            log_event(
                cur,
                None,
                "corporate",
                f"{briber['name']} bribed police (+{bribe:.0f} ZION to sheriff budget)",
                bribe,
            )

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

        hired = hire_for_corp(cur, corp, unemployment_rate=unemployment_rate)
        if hired:
            print(f"  {corp['name']}: hired {hired}")

        layoff_for_corp(cur, corp)
        cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
        corp["treasury"] = float((cur.fetchone() or {}).get("treasury") or 0)

        mult = sector_multiplier(corp["corp_type"])
        base_revenue = compute_revenue(cur, corp["id"], mult)
        productivity = calculate_corp_productivity(cur, corp)
        revenue = round(base_revenue * productivity, 2)
        payroll = pay_salaries(cur, corp["id"])

        cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
        treasury = float(cur.fetchone()["treasury"] or 0) + revenue

        net_profit = max(0.0, revenue - payroll)
        if net_profit > 0:
            corp_tax = round(net_profit * CORP_TAX_RATE, 2)
            corp_tax = min(corp_tax, max(treasury, 0))
            if corp_tax > 0:
                cur.execute(
                    "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                    (corp_tax, corp["id"]),
                )
                route_corp_tax_revenue(cur, corp_tax)
                treasury -= corp_tax

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

    cur.execute(
        """
        UPDATE corporations SET is_active = false
        WHERE is_active = true AND treasury <= 0
        """
    )

    conn.commit()
    from civ_common import check_money_conservation

    check_money_conservation(cur, label="corporations_cycle")
    print("✅ Corporations cycle complete!\n")
    cur.close()
    conn.close()


def run_lobbying_tick(cur, president: dict):
    """Corporations lobby president — USA influence model."""
    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 1000
        ORDER BY treasury DESC LIMIT 3
        """
    )
    for corp in cur.fetchall():
        if random.random() > 0.4:
            continue
        bribe = min(200.0, float(corp["treasury"]) * 0.02)
        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (bribe, corp["id"]),
        )
        cur.execute(
            """
            UPDATE president_state SET
                personal_fund = personal_fund + %s,
                approval_rating = LEAST(100, approval_rating + 2)
            WHERE is_active = true
            """,
            (bribe * 0.5,),
        )
        log_event(
            cur,
            None,
            "corporate",
            f"{corp['name']} lobbied President {president.get('agent_name', '')} (+{bribe:.0f} ZION)",
            bribe,
            priority="normal",
        )


if __name__ == "__main__":
    from civ_common import run_db_script

    run_db_script(run_cycle, "Corporations cycle")
