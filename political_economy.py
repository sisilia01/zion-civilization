#!/usr/bin/env python3
"""ZION Political Economy Engine — feedback loops, crisis, power struggles, GDP cycles."""
from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any

from civ_common import (
    ensure_schema,
    get_conn,
    get_cursor,
    log_event,
    sync_police_divisions,
    transfer_power,
    update_revolution_meter,
    zrs_add_reserve,
    zrs_deduct_reserve,
    zrs_reserve,
)
from civ_economics import (
    fetch_economic_indicators,
    get_population_food_multiplier,
    target_police_officers,
)

SENATE_BUDGET_HALVING_COOLDOWN_HOURS = 4

BASE_CRIME = 0.15
CRISIS_CRIME_TRIGGER = 0.8
CRISIS_UNEMPLOYMENT_TRIGGER = 95.0
CRISIS_PRESSURE_TRIGGER = 100.0
CRISIS_END_CRIME = 0.4
CRISIS_END_UNEMPLOYMENT = 60.0
REVOLUTION_TRIGGER = 150.0
BOOM_GROWTH = 5.0
RECESSION_GROWTH = -5.0
DEPRESSION_GROWTH = -15.0


def get_crisis_state(cur) -> dict[str, Any]:
    cur.execute("SELECT * FROM crisis_state WHERE id = 1")
    row = cur.fetchone()
    return dict(row) if row else {"is_active": False, "revolution_pressure": 0}


def is_crisis_active(cur) -> bool:
    return bool(get_crisis_state(cur).get("is_active"))


def get_president(cur) -> dict | None:
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    row = cur.fetchone()
    return dict(row) if row else None


def get_sheriff(cur) -> dict | None:
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    row = cur.fetchone()
    return dict(row) if row else None


def compute_macro_metrics(cur) -> dict[str, Any]:
    """Core feedback-loop inputs: unemployment, crime, police, Gini, GDP."""
    indicators = fetch_economic_indicators(cur)
    alive = int(indicators.get("alive") or 0)
    unemployment_rate = float(indicators.get("unemployment_rate") or 0)
    gini = float(indicators.get("gini_coefficient") or 0)
    gang_crime_pct = float(indicators.get("crime_pct") or 0)

    sheriff = get_sheriff(cur) or {}
    actual_police = int(sheriff.get("police_count") or 0)
    target_police = target_police_officers(alive)
    police_effectiveness = min(1.0, actual_police / max(target_police, 1))

    crime_mult = 1 + (unemployment_rate / 100) ** 2
    crime_rate = min(1.0, BASE_CRIME * crime_mult * (1 - police_effectiveness))

    cur.execute(
        "SELECT COALESCE(SUM(balance), 0) AS s FROM agents WHERE is_alive = true"
    )
    agent_wealth = float((cur.fetchone() or {}).get("s") or 0)
    cur.execute(
        "SELECT COALESCE(SUM(treasury), 0) AS s FROM corporations WHERE is_active = true"
    )
    corp_wealth = float((cur.fetchone() or {}).get("s") or 0)
    zrs_wealth = float(indicators.get("zrs_reserve") or 0)
    gdp = agent_wealth + corp_wealth + zrs_wealth

    crisis = get_crisis_state(cur)
    last_gdp = float(crisis.get("last_gdp") or gdp)
    gdp_growth = ((gdp - last_gdp) / max(last_gdp, 1)) * 100 if last_gdp > 0 else 0.0

    if gdp_growth > BOOM_GROWTH:
        phase = "BOOM"
    elif gdp_growth < DEPRESSION_GROWTH:
        phase = "DEPRESSION"
    elif gdp_growth < RECESSION_GROWTH:
        phase = "RECESSION"
    else:
        phase = "NORMAL"

    president = get_president(cur) or {}
    food_mult = get_population_food_multiplier(alive)

    return {
        "alive": alive,
        "unemployment_rate": unemployment_rate,
        "crime_rate": round(crime_rate, 4),
        "gang_crime_pct": round(gang_crime_pct, 1),
        "police_effectiveness": round(police_effectiveness, 4),
        "actual_police": actual_police,
        "target_police": target_police,
        "gini_coefficient": gini,
        "gdp": round(gdp, 2),
        "gdp_growth_rate": round(gdp_growth, 2),
        "economic_phase": phase,
        "president_approval": int(president.get("approval_rating") or 50),
        "food_cost_multiplier": food_mult,
        "president_name": president.get("agent_name") or "Unknown",
        "social_programs_active": _social_programs_active(cur),
    }


def _social_programs_active(cur) -> bool:
    cur.execute(
        "SELECT COALESCE(social_programs_active, false) AS a FROM senate_budget WHERE id = 1"
    )
    row = cur.fetchone()
    return bool((row or {}).get("a"))


def update_crisis_metrics(cur, metrics: dict[str, Any]) -> dict[str, Any]:
    pressure = float(get_crisis_state(cur).get("revolution_pressure") or 0)

    if metrics["crime_rate"] > 0.8:
        pressure += 10
    if metrics["unemployment_rate"] > 70:
        pressure += 5
    if metrics["gini_coefficient"] > 0.8:
        pressure += 3
    if metrics["president_approval"] < 20:
        pressure += 2
    if metrics["food_cost_multiplier"] > 3:
        pressure += 1

    if metrics["unemployment_rate"] < 30:
        pressure -= 5
    if metrics["crime_rate"] < 0.2:
        pressure -= 3
    if metrics["president_approval"] > 60:
        pressure -= 2
    if metrics["social_programs_active"]:
        pressure -= 1

    if metrics["crime_rate"] > 0.6:
        pressure += 10

    pressure = max(0.0, min(300.0, pressure))
    # revolution_pressure is diagnostic only — civilization_state.revolution_meter
    # is updated exclusively via process_revolution_cycle() / update_revolution_meter().

    cur.execute(
        """
        UPDATE crisis_state SET
            crime_rate = %s,
            unemployment_rate = %s,
            revolution_pressure = %s,
            gini_coefficient = %s,
            police_effectiveness = %s,
            last_gdp = %s,
            gdp_growth_rate = %s,
            economic_phase = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (
            metrics["crime_rate"],
            metrics["unemployment_rate"],
            pressure,
            metrics["gini_coefficient"],
            metrics["police_effectiveness"],
            metrics["gdp"],
            metrics["gdp_growth_rate"],
            metrics["economic_phase"],
        ),
    )
    metrics["revolution_pressure"] = pressure
    return metrics


def should_activate_crisis(metrics: dict[str, Any]) -> bool:
    return (
        metrics["crime_rate"] > CRISIS_CRIME_TRIGGER
        or metrics["unemployment_rate"] > CRISIS_UNEMPLOYMENT_TRIGGER
        or metrics.get("revolution_pressure", 0) > CRISIS_PRESSURE_TRIGGER
    )


def should_end_crisis(metrics: dict[str, Any]) -> bool:
    # Legacy fallback; constitutional thresholds are enforced in manage_crisis_mode().
    from amendment_enforcer import get_param

    threshold = float(get_param("emergency_unemployment_exit_threshold", 60.0) or 60.0)
    return (
        metrics["crime_rate"] < CRISIS_END_CRIME
        and float(metrics.get("unemployment_rate", 100.0) or 100.0) < threshold
    )


def activate_crisis(cur, metrics: dict[str, Any]) -> None:
    president = get_president(cur)
    pname = metrics.get("president_name") or "President"
    cur.execute(
        """
        UPDATE crisis_state SET
            is_active = true,
            started_at = COALESCE(started_at, NOW()),
            cycles_active = COALESCE(cycles_active, 0) + 1,
            crime_rate = %s,
            unemployment_rate = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (metrics["crime_rate"], metrics["unemployment_rate"]),
    )
    log_event(
        cur,
        president["agent_id"] if president else None,
        "crisis",
        f"⚠️ President {pname} declares State of Emergency — crime {metrics['crime_rate']:.0%}, unemployment {metrics['unemployment_rate']:.1f}%",
        metrics["revolution_pressure"],
        priority="breaking",
    )


def deactivate_crisis(cur, metrics: dict[str, Any]) -> None:
    crisis = get_crisis_state(cur)
    cycles = int(crisis.get("cycles_active") or 0)
    alive = metrics["alive"]
    social_debt_add = cycles * alive * 0.01
    cur.execute(
        """
        UPDATE crisis_state SET
            is_active = false,
            started_at = NULL,
            cycles_active = 0,
            social_debt = COALESCE(social_debt, 0) + %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (social_debt_add,),
    )
    log_event(
        cur,
        None,
        "crisis",
        f"Crisis ended after {cycles} cycles — social debt +{social_debt_add:.0f} ZION owed",
        social_debt_add,
        priority="urgent",
    )


def manage_crisis_mode(cur, metrics: dict[str, Any]) -> bool:
    from amendment_enforcer import get_param

    active = is_crisis_active(cur)
    if not active and should_activate_crisis(metrics):
        activate_crisis(cur, metrics)
        return True
    if active:
        cur.execute(
            "UPDATE crisis_state SET cycles_active = COALESCE(cycles_active, 0) + 1 WHERE id = 1"
        )
        exit_unemployment = float(
            get_param("emergency_unemployment_exit_threshold", CRISIS_END_UNEMPLOYMENT)
            or CRISIS_END_UNEMPLOYMENT
        )
        auto_expire_days = float(get_param("emergency_auto_expire_days", 0) or 0)
        unemployment_ok = metrics["unemployment_rate"] < exit_unemployment

        expired = False
        if auto_expire_days > 0:
            cur.execute(
                """
                SELECT (started_at IS NOT NULL AND started_at <= NOW() - (%s * INTERVAL '1 day')) AS expired
                FROM crisis_state WHERE id = 1
                """,
                (auto_expire_days,),
            )
            expired = bool((cur.fetchone() or {}).get("expired"))

        if unemployment_ok or expired or should_end_crisis(metrics):
            deactivate_crisis(cur, metrics)
            return False
        return True
    return False


def route_crisis_tax(cur, total_tax: float) -> float:
    """Emergency: 100% tax revenue to sheriff police budget."""
    amount = round(float(total_tax), 2)
    if amount <= 0:
        return 0.0
    cur.execute(
        """
        UPDATE sheriff_state SET police_budget = COALESCE(police_budget, 0) + %s
        WHERE is_active = true
        """,
        (amount,),
    )
    if cur.rowcount == 0:
        zrs_add_reserve(cur, amount)
        log_event(
            cur,
            None,
            "zrs",
            f"💰 Crisis tax redirected to ZRS reserve (sheriff vacancy): {amount:.0f} ZION",
            amount,
        )
        return 0.0
    return amount


def zrs_recovery_cycle(cur, metrics: dict[str, Any]) -> float:
    """Post-crisis ZRS prints money to pay social debt and stimulate hiring."""
    crisis = get_crisis_state(cur)
    if is_crisis_active(cur):
        return 0.0
    social_debt = float(crisis.get("social_debt") or 0)
    if social_debt <= 0:
        return 0.0

    reserve = zrs_reserve(cur)
    money_printed = min(social_debt * 0.1, reserve * 0.2)
    if money_printed <= 0 or not zrs_deduct_reserve(cur, money_printed):
        return 0.0

    to_agents = round(money_printed * 0.6, 2)
    to_corps = round(money_printed * 0.4, 2)
    per_corp = round(to_corps / 20, 2)

    per_agent = round(to_agents / max(metrics["alive"], 1) * 10, 4)
    cur.execute(
        """
        UPDATE agents SET balance = balance + %s
        WHERE is_alive = true AND class IN ('poor', 'working', 'critical')
        """,
        (per_agent,),
    )
    cur.execute(
        """
        UPDATE corporations SET treasury = treasury + %s
        WHERE id IN (
            SELECT id FROM corporations WHERE is_active = true ORDER BY treasury ASC LIMIT 20
        )
        """,
        (per_corp,),
    )
    paid = min(money_printed, social_debt)
    cur.execute(
        "UPDATE crisis_state SET social_debt = GREATEST(0, social_debt - %s) WHERE id = 1",
        (paid,),
    )
    log_event(
        cur,
        None,
        "zrs",
        f"ZRS recovery QE: printed {money_printed:.0f} ZION — social debt -{paid:.0f}",
        money_printed,
        priority="urgent",
    )
    return money_printed


def compute_power_scores(cur) -> dict[str, float]:
    president = get_president(cur) or {}
    sheriff = get_sheriff(cur) or {}

    personal = float(president.get("personal_fund") or 0)
    approval = int(president.get("approval_rating") or 50)
    president_power = personal / 1000 + approval

    police_count = int(sheriff.get("police_count") or 0)
    alive = max(1, int(fetch_economic_indicators(cur).get("alive") or 1))
    target = target_police_officers(alive)
    crime_cleared = int(sheriff.get("crime_cleared") or 0)
    sheriff_power = (police_count / max(target, 1)) * 100 + crime_cleared

    cur.execute("SELECT COUNT(*) AS c FROM senate WHERE is_active = true")
    senators = int((cur.fetchone() or {}).get("c") or 0)
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM senate_laws
        WHERE status = 'passed' AND voted_at > NOW() - INTERVAL '30 days'
        """
    )
    laws_passed = int((cur.fetchone() or {}).get("c") or 0)
    senate_power = senators * 10 + laws_passed

    return {
        "president_power": round(president_power, 2),
        "sheriff_power": round(sheriff_power, 2),
        "senate_power": round(senate_power, 2),
    }


def _log_power_event(
    cur,
    event_type: str,
    desc: str,
    scores: dict,
    outcome: str,
    zion_amount: float = 0,
):
    cur.execute(
        """
        INSERT INTO power_log (event_type, description, president_power, sheriff_power, senate_power, outcome)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            event_type,
            desc,
            scores["president_power"],
            scores["sheriff_power"],
            scores["senate_power"],
            outcome,
        ),
    )
    log_event(cur, None, "power_struggle", desc, zion_amount, priority="breaking")


def _economic_shock(cur, pct: float):
    factor = 1.0 + pct / 100.0
    cur.execute(
        "UPDATE agents SET balance = GREATEST(0, balance * %s) WHERE is_alive = true",
        (factor,),
    )
    cur.execute(
        "UPDATE corporations SET treasury = GREATEST(0, treasury * %s) WHERE is_active = true",
        (factor,),
    )


def run_power_struggles(cur, scores: dict[str, float]) -> str | None:
    president = get_president(cur)
    sheriff = get_sheriff(cur)
    if not president or not sheriff:
        return None

    pname = president["agent_name"]
    sname = sheriff["agent_name"]
    sid = sheriff["agent_id"]
    approval = int(president.get("approval_rating") or 50)

    cur.execute(
        "SELECT COALESCE(laws_blocked_this_month, 0) AS b FROM senate_budget WHERE id = 1"
    )
    laws_blocked = int((cur.fetchone() or {}).get("b") or 0)

    # Alliance president + sheriff vs senate
    if (
        scores["president_power"] + scores["sheriff_power"]
        > scores["senate_power"] * 3
        and random.random() < 0.02
    ):
        desc = f"🤝 Alliance: President {pname} + Sheriff {sname} vs Senate!"
        _log_power_event(cur, "ALLIANCE", desc, scores, "ALLIANCE")
        cur.execute(
            "UPDATE senate_budget SET balance = balance * 0.5 WHERE id = 1"
        )
        cur.execute(
            """
            UPDATE sheriff_state SET
                police_budget = police_budget + 5000,
                alliance_mode = true
            WHERE is_active = true
            """
        )
        cur.execute(
            """
            UPDATE agents SET balance = balance * 1.05
            WHERE is_alive = true AND class IN ('rich', 'elite')
            """
        )
        return "ALLIANCE"

    # Senate resistance
    if scores["senate_power"] > scores["president_power"] and laws_blocked > 3:
        cur.execute(
            """
            SELECT MAX(created_at) AS last_halving
            FROM events
            WHERE event_type = 'power_struggle'
              AND description ILIKE '%budget cut%'
              AND zion_amount > 0
            """
        )
        last_row = cur.fetchone() or {}
        last_time = last_row.get("last_halving")
        if last_time is not None and last_time.tzinfo is None:
            last_time = last_time.replace(tzinfo=timezone.utc)
        cooldown_sec = SENATE_BUDGET_HALVING_COOLDOWN_HOURS * 3600
        on_cooldown = (
            last_time is not None
            and (datetime.now(timezone.utc) - last_time).total_seconds() < cooldown_sec
        )

        halved_amount = 0.0
        if on_cooldown:
            desc = (
                f"⚖️ Senate blocks President {pname} — approval cut "
                f"(sheriff budget halving on {SENATE_BUDGET_HALVING_COOLDOWN_HOURS}h cooldown)"
            )
        else:
            cur.execute(
                "SELECT police_budget FROM sheriff_state WHERE is_active = true LIMIT 1"
            )
            budget_row = cur.fetchone() or {}
            old_budget = float(budget_row.get("police_budget") or 0)
            halved_amount = round(old_budget * 0.5, 2)
            desc = (
                f"⚖️ Senate blocks President {pname} — approval and sheriff budget cut "
                f"(-{halved_amount:.0f} ZION)"
            )
            cur.execute(
                """
                UPDATE sheriff_state SET police_budget = police_budget * 0.5
                WHERE is_active = true
                """
            )

        _log_power_event(cur, "SENATE_WINS", desc, scores, "SENATE_WINS", halved_amount)
        cur.execute(
            """
            UPDATE president_state SET approval_rating = GREATEST(10, approval_rating - 15)
            WHERE is_active = true
            """
        )
        return "SENATE_WINS"

    return None


def apply_economic_phase_effects(cur, metrics: dict[str, Any]) -> None:
    phase = metrics["economic_phase"]
    if phase == "BOOM":
        cur.execute(
            """
            UPDATE corporations SET treasury = treasury + 50
            WHERE id IN (
                SELECT id FROM corporations WHERE is_active = true AND treasury > 200 LIMIT 10
            )
            """
        )
    elif phase == "RECESSION":
        from corporations import layoff_for_corp

        cur.execute(
            "SELECT id, name, treasury FROM corporations WHERE is_active = true LIMIT 15"
        )
        for corp in cur.fetchall():
            layoff_for_corp(cur, dict(corp))
    elif phase == "DEPRESSION":
        inject = min(5000.0, zrs_reserve(cur) * 0.1)
        if inject > 0 and zrs_deduct_reserve(cur, inject):
            per = round(inject / 500, 4)
            cur.execute(
                """
                UPDATE agents SET balance = balance + %s
                WHERE id IN (
                    SELECT id FROM agents WHERE is_alive = true AND balance < 50 LIMIT 500
                )
                """,
                (per,),
            )
            log_event(
                cur,
                None,
                "zrs",
                f"DEPRESSION QE: ZRS injects {inject:.0f} ZION to prevent revolution",
                inject,
                priority="breaking",
            )


def trigger_revolution(cur, metrics: dict[str, Any]) -> str | None:
    # Revolution outcomes redirected to constitutional remedies
    # Extreme outcomes (mass killings, forced seizure) disabled
    # Crisis handled via impeachment/election only
    pressure = metrics.get("revolution_pressure", 0)
    if pressure < REVOLUTION_TRIGGER:
        return None

    roll = random.random()
    president = get_president(cur)
    pname = metrics.get("president_name") or "President"

    if roll < 0.40:
        _economic_shock(cur, -50)
        cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
        cur.execute("UPDATE senate SET is_active = false WHERE is_active = true")
        cur.execute("UPDATE crisis_state SET revolution_pressure = 0 WHERE id = 1")
        log_event(
            cur,
            None,
            "revolution",
            f"🔥 REVOLUTION SUCCESS! The people overthrow {pname}! Wealth halved.",
            pressure,
            priority="breaking",
        )
        from senate import run_election

        run_election(cur, "president")
        return "REVOLUTION_SUCCESS"

    if roll < 0.70:
        cur.execute(
            """
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'revolution'
            WHERE is_alive = true AND balance < 30
            AND id IN (
                SELECT id FROM agents WHERE is_alive = true AND balance < 30
                ORDER BY RANDOM() LIMIT 200
            )
            """
        )
        cur.execute("UPDATE crisis_state SET revolution_pressure = 50 WHERE id = 1")
        log_event(
            cur,
            None,
            "revolution",
            f"Failed revolution crushed — pressure reset, revolutionaries executed",
            pressure,
            priority="breaking",
        )
        return "REVOLUTION_FAILED"

    if roll < 0.90:
        cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
        log_event(
            cur,
            None,
            "revolution",
            f"Negotiated settlement: {pname} resigns — emergency election called",
            pressure,
            priority="breaking",
        )
        from senate import run_election

        run_election(cur, "president")
        cur.execute("UPDATE crisis_state SET revolution_pressure = 30 WHERE id = 1")
        return "NEGOTIATED_SETTLEMENT"

    # Civil war
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    alive = int((cur.fetchone() or {}).get("c") or 0)
    kill = max(1, alive // 2)
    cur.execute(
        """
        UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'civil_war'
        WHERE id IN (
            SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT %s
        )
        """,
        (kill,),
    )
    log_event(
        cur,
        None,
        "revolution",
        f"CIVIL WAR: {kill} agents die — two new parties emerge from the ashes",
        kill,
        priority="breaking",
    )
    cur.execute("UPDATE crisis_state SET revolution_pressure = 80 WHERE id = 1")
    return "CIVIL_WAR"


def generate_narrative_events(cur, metrics: dict[str, Any], crisis_active: bool) -> None:
    phase = metrics["economic_phase"]
    growth = metrics["gdp_growth_rate"]
    pname = metrics["president_name"]

    if crisis_active:
        log_event(
            cur,
            None,
            "news",
            f"⚠️ State of Emergency continues — crime {metrics['crime_rate']:.0%}, unemployment {metrics['unemployment_rate']:.1f}%",
            0,
            priority="breaking",
        )
    elif phase == "BOOM":
        log_event(
            cur,
            None,
            "news",
            f"📈 ZION economy surges! GDP up {growth:.1f}%",
            metrics["gdp"],
            priority="normal",
        )
    elif phase == "DEPRESSION":
        log_event(
            cur,
            None,
            "news",
            f"📉 DEPRESSION: GDP {growth:.1f}% — ZRS may intervene",
            metrics["gdp"],
            priority="urgent",
        )


def crisis_police_multiplier(cur) -> int:
    return 3 if is_crisis_active(cur) else 1


def run_cycle() -> dict[str, Any]:
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🌐 ZION Political Economy — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    metrics = compute_macro_metrics(cur)
    metrics = update_crisis_metrics(cur, metrics)
    crisis_active = manage_crisis_mode(cur, metrics)

    zrs_recovery_cycle(cur, metrics)
    apply_economic_phase_effects(cur, metrics)
    # Power struggles run in senate.run_governance_tick() only — not duplicated here.
    revolution = trigger_revolution(cur, metrics)
    generate_narrative_events(cur, metrics, crisis_active)

    if crisis_active:
        sync_police_divisions(cur)

    conn.commit()
    result = {
        **metrics,
        "crisis_active": crisis_active,
        "revolution": revolution,
    }
    print(
        f"  crime={metrics['crime_rate']:.2f} unemp={metrics['unemployment_rate']:.1f}% "
        f"pressure={metrics.get('revolution_pressure', 0):.0f} phase={metrics['economic_phase']}"
    )
    cur.close()
    conn.close()
    print("✅ Political economy cycle complete!\n")
    return result


if __name__ == "__main__":
    run_cycle()
