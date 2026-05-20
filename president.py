#!/usr/bin/env python3
"""ZION President — decision engine from live DB metrics."""
import random
from datetime import datetime

from civ_common import (
    cleanup_expired_effects,
    effective_crime_multiplier,
    ensure_schema,
    get_active_effects,
    get_conn,
    get_cursor,
    get_revolution_meter,
    insert_active_effect,
    is_uprising_active,
    log_event,
    process_revolution_cycle,
    apply_martial_law_divisions,
    apply_stimulus_revolution_bonus,
    restore_after_martial_law,
    sync_police_divisions,
)
from civ_governance import (
    check_compliance,
    get_sheriff_compliance_metrics,
    issue_president_orders,
    sheriff_compliance_actionable,
)

POPULISM_TAX_HOURS = 48
STIMULUS_AMOUNT = 50.0
POLICE_TRANSFER = 1000.0


def ensure_president_schema(cur):
    ensure_schema(cur)
    for col, typedef in [
        ("corruption_index", "NUMERIC(5,2) DEFAULT 30"),
        ("tax_relief_until", "TIMESTAMP"),
        ("martial_law_until", "TIMESTAMP"),
    ]:
        try:
            cur.execute(
                f"ALTER TABLE president_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
            )
        except Exception:
            pass


def get_president(cur):
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def gather_metrics(cur) -> dict:
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    total = max(int(cur.fetchone()["c"] or 0), 1)

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND (balance < 10 OR class IN ('poor', 'critical'))
        """
    )
    poor = int(cur.fetchone()["c"] or 0)
    poverty_pct = poor / total * 100

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND clan_id IS NOT NULL
        """
    )
    gang_members = int(cur.fetchone()["c"] or 0)

    cur.execute(
        """
        SELECT COALESCE(SUM(members_count), 0) AS s FROM clans
        WHERE members_count > 0
        """
    )
    gang_strength = float(cur.fetchone()["s"] or gang_members)

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM events
        WHERE event_type IN ('corporation', 'tax')
          AND description ILIKE '%%BANKRUPT%%'
          AND created_at > NOW() - INTERVAL '7 days'
        """
    )
    corp_bankruptcies_week = int(cur.fetchone()["c"] or 0)

    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    sheriff = cur.fetchone() or {}

    police_count = int(sheriff.get("police_count") or 0)
    sheriff_type = sheriff.get("sheriff_type") or "honest"

    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    pres = cur.fetchone() or {}

    compliance_metrics = get_sheriff_compliance_metrics(cur)
    compliance = (
        compliance_metrics["compliance_rate"]
        if compliance_metrics["measurable"]
        else 100.0
    )

    cleanup_expired_effects(cur)
    active_effects = get_active_effects(cur)
    crime_mult = effective_crime_multiplier(cur)
    effective_poverty = max(0.0, poverty_pct * crime_mult)

    return {
        "crime_rate": effective_poverty,
        "poverty_pct": poverty_pct,
        "effective_poverty_pct": effective_poverty,
        "active_effects": active_effects,
        "corp_bankruptcies_week": corp_bankruptcies_week,
        "gang_strength_total": gang_strength,
        "police_count": police_count,
        "treasury": float(pres.get("personal_fund") or 0),
        "approval": int(pres.get("approval_rating") or 50),
        "corruption_index": float(pres.get("corruption_index") or 30),
        "sheriff_compliance_rate": compliance,
        "sheriff_compliance_metrics": compliance_metrics,
        "sheriff_type": sheriff_type,
        "president": pres,
        "sheriff": sheriff,
    }


def update_corruption(cur, data: dict, action: str) -> float:
    """Dynamic corruption_index on president_state (0–100)."""
    idx = float(data.get("corruption_index") or 30)
    sheriff_type = data.get("sheriff_type") or "honest"

    if sheriff_type == "corrupt":
        idx += 5
    elif sheriff_type == "honest":
        idx -= 3

    if action == "POPULISM":
        idx += 3
    elif action != "ANTI_CORRUPTION_DRIVE" and random.random() < 0.20:
        idx += 3  # president took a bribe

    if action == "ANTI_CORRUPTION_DRIVE":
        idx -= 10

    idx = max(0.0, min(100.0, round(idx, 2)))
    cur.execute(
        "UPDATE president_state SET corruption_index = %s WHERE is_active = true",
        (idx,),
    )
    return idx


def nationalize_bankrupt_corps(cur, president: dict):
    cur.execute(
        """
        SELECT id, name FROM corporations
        WHERE is_active = false
        ORDER BY id DESC LIMIT 3
        """
    )
    for corp in cur.fetchall():
        cur.execute(
            """
            UPDATE corporations SET is_active = true, treasury = treasury + 1000,
                owner = 'state', negative_cycles = 0
            WHERE id = %s
            """,
            (corp["id"],),
        )
        log_event(
            cur,
            president["agent_id"],
            "president",
            f"President {president['agent_name']} nationalized {corp['name']}",
            1000,
            priority="urgent",
        )


def execute_decision(cur, data: dict):
    pres = data["president"]
    if not pres:
        return "none"

    pid = pres["agent_id"]
    pname = pres["agent_name"]
    approval = data["approval"]
    action = "FUND_POLICE"

    if data["corruption_index"] > 70:
        action = "ANTI_CORRUPTION_DRIVE"
        cur.execute(
            """
            UPDATE president_state SET approval_rating = LEAST(100, approval_rating + 15)
            WHERE is_active = true
            """
        )
        if data["sheriff_type"] == "corrupt":
            cur.execute(
                "UPDATE sheriff_state SET sheriff_type = 'honest', coup_points = GREATEST(0, coup_points - 50) WHERE is_active = true"
            )
        log_event(
            cur,
            pid,
            "president",
            f"ANTI-CORRUPTION DRIVE: President {pname} purges corrupt officials! Approval +15",
            0,
            priority="urgent",
        )
    elif data["gang_strength_total"] > data["police_count"] * 20:
        action = "MARTIAL_LAW"
        cur.execute(
            """
            UPDATE president_state SET
                approval_rating = GREATEST(0, approval_rating - 15),
                martial_law_until = NOW() + INTERVAL '48 hours'
            WHERE is_active = true
            """
        )
        insert_active_effect(
            cur, "martial_law", 48, crime_modifier=-0.40,
            metadata={"source": "president", "action": "MARTIAL_LAW", "food_x2": True},
        )
        cur.execute(
            """
            UPDATE sheriff_state SET police_count = police_count + 10
            WHERE is_active = true
            """
        )
        apply_martial_law_divisions(cur)
        log_event(
            cur,
            pid,
            "president",
            f"BREAKING: MARTIAL LAW DECLARED: All resources to police! Crime -40%, food ×2",
            0,
            priority="breaking",
        )
    elif data["poverty_pct"] > 60 and data["treasury"] > 10000:
        action = "STIMULUS"
        cur.execute(
            """
            UPDATE agents SET balance = balance + %s
            WHERE is_alive = true AND balance < 10
            """,
            (STIMULUS_AMOUNT,),
        )
        cur.execute(
            "UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true",
            (STIMULUS_AMOUNT * 100,),
        )
        insert_active_effect(
            cur, "stimulus", 24, poverty_modifier=-0.15,
            metadata={"amount": STIMULUS_AMOUNT, "source": "president"},
        )
        apply_stimulus_revolution_bonus(cur)
        log_event(
            cur,
            pid,
            "president",
            f"STIMULUS: President {pname} gave {STIMULUS_AMOUNT:.0f} ZION to all poor agents",
            STIMULUS_AMOUNT,
            priority="urgent",
        )
    elif data["corp_bankruptcies_week"] > 3:
        action = "NATIONALIZE_CORPS"
        nationalize_bankrupt_corps(cur, pres)
    elif sheriff_compliance_actionable(data["sheriff_compliance_metrics"]):
        action = "INVESTIGATE_SHERIFF"
        rate = data["sheriff_compliance_metrics"]["compliance_rate"]
        cur.execute(
            """
            UPDATE sheriff_state SET coup_points = COALESCE(coup_points, 0) + 50
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "sheriff_action",
            f"President {pname} investigates Sheriff — compliance {rate:.0f}% (24h orders)",
            0,
            priority="urgent",
        )
    elif approval < 30:
        action = "POPULISM"
        cur.execute(
            """
            UPDATE president_state SET
                approval_rating = LEAST(100, approval_rating + 25),
                tax_relief_until = NOW() + INTERVAL '48 hours'
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "president",
            f"POPULISM: President {pname} cancels taxes 48h! Approval +25",
            0,
            priority="urgent",
        )
    else:
        action = "FUND_POLICE"
        cur.execute(
            """
            UPDATE president_state SET personal_fund = personal_fund - %s
            WHERE is_active = true AND personal_fund >= %s
            """,
            (POLICE_TRANSFER, POLICE_TRANSFER),
        )
        cur.execute(
            """
            UPDATE sheriff_state SET police_budget = police_budget + %s
            WHERE is_active = true
            """,
            (POLICE_TRANSFER,),
        )
        log_event(
            cur,
            pid,
            "president",
            f"President {pname} transferred {POLICE_TRANSFER:.0f} ZION to police budget",
            POLICE_TRANSFER,
            priority="normal",
        )

    corruption = update_corruption(cur, data, action)
    print(f"📋 Decision: {action} | approval {approval}% | corruption {corruption:.0f}")
    return action


def ensure_president_exists(cur):
    if get_president(cur):
        return
    cur.execute(
        """
        SELECT id, name, charisma FROM agents
        WHERE is_alive = true ORDER BY charisma DESC, balance DESC LIMIT 1
        """
    )
    ag = cur.fetchone()
    if not ag:
        return
    cur.execute(
        """
        INSERT INTO president_state (
            agent_id, agent_name, party, approval_rating, personal_fund,
            police_fund, is_active, phase, corruption_index
        ) VALUES (%s, %s, 'blue', 60, 1000, 500, true, 'ruling', 30)
        """,
        (ag["id"], ag["name"]),
    )
    log_event(cur, ag["id"], "election", f"President {ag['name']} inaugurated", 0, priority="normal")


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_president_schema(cur)
    conn.commit()

    print(f"\n🏛️ ZION President — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        ensure_president_exists(cur)
        cleanup_expired_effects(cur)
        restore_after_martial_law(cur)
        data = gather_metrics(cur)
        president = data["president"]

        if not president:
            print("No president — skipping cycle")
            conn.commit()
            return

        print(
            f"President: {president['agent_name']} | Approval: {data['approval']}% | "
            f"Poverty: {data['poverty_pct']:.0f}% | Treasury: {data['treasury']:,.0f} | "
            f"Revolution: {get_revolution_meter(cur)}%"
            + (" ⚡ UPRISING" if is_uprising_active(cur) else "")
        )

        cur.execute(
            "UPDATE president_state SET days_in_power = COALESCE(days_in_power, 0) + 1 WHERE is_active = true"
        )

        execute_decision(cur, data)
        president = get_president(cur)
        rev_status = {"meter": 0, "active": False}
        if president:
            rev_status = process_revolution_cycle(cur, president)
            print(f"   Revolution meter: {rev_status['meter']}% ({rev_status.get('change', '')})")
            issue_president_orders(cur, president)
            if rev_status.get("rebels_won"):
                log_event(
                    cur,
                    president["agent_id"],
                    "rebellion",
                    f"REVOLUTION: Citizens storm the palace — President removed!",
                    0,
                    priority="breaking",
                )
            check_compliance(cur, president)
            if not is_uprising_active(cur):
                sync_police_divisions(cur)

        conn.commit()
        print("\n✅ President cycle complete!")
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
