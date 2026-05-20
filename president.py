#!/usr/bin/env python3
"""ZION President — decision engine from live DB metrics."""
import random
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, log_event
from civ_governance import (
    check_compliance,
    issue_president_orders,
    update_revolution_meter,
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
        WHERE is_alive = true AND (balance < 100 OR class IN ('poor', 'critical'))
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

    orders_given = int(pres.get("orders_given_cycle") or 0)
    orders_executed = int(sheriff.get("orders_executed_cycle") or 0)
    compliance = (orders_executed / orders_given * 100) if orders_given > 0 else 100.0

    return {
        "crime_rate": poverty_pct,
        "poverty_pct": poverty_pct,
        "corp_bankruptcies_week": corp_bankruptcies_week,
        "gang_strength_total": gang_strength,
        "police_count": police_count,
        "treasury": float(pres.get("personal_fund") or 0),
        "approval": int(pres.get("approval_rating") or 50),
        "corruption_index": float(pres.get("corruption_index") or 30),
        "sheriff_compliance_rate": compliance,
        "sheriff_type": sheriff_type,
        "president": pres,
        "sheriff": sheriff,
    }


def update_corruption(cur, data: dict, action: str):
    idx = data["corruption_index"]
    if data["sheriff_type"] == "corrupt":
        idx += 3
    if action == "ANTI_CORRUPTION_DRIVE":
        idx -= 5
    elif action == "BRIBE" or action == "corrupt":
        idx += 5
    elif data["sheriff_type"] == "honest":
        idx -= 3
    if random.random() < 0.20 and action not in ("ANTI_CORRUPTION_DRIVE",):
        idx += 5
        action = "BRIBE"
    idx = max(0, min(100, idx))
    cur.execute(
        "UPDATE president_state SET corruption_index = %s WHERE is_active = true",
        (idx,),
    )
    return idx, action


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
                martial_law_until = NOW() + INTERVAL '24 hours'
            WHERE is_active = true
            """
        )
        cur.execute(
            """
            UPDATE sheriff_state SET police_count = police_count + 10
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "president",
            f"MARTIAL LAW: President {pname} doubles police raids! Approval -15, crime -30%",
            0,
            priority="breaking",
        )
    elif data["poverty_pct"] > 60 and data["treasury"] > 10000:
        action = "STIMULUS"
        cur.execute(
            """
            UPDATE agents SET balance = balance + %s
            WHERE is_alive = true AND balance < 100
            """,
            (STIMULUS_AMOUNT,),
        )
        cur.execute(
            "UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true",
            (STIMULUS_AMOUNT * 100,),
        )
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
    elif data["sheriff_compliance_rate"] < 50:
        action = "INVESTIGATE_SHERIFF"
        cur.execute(
            """
            UPDATE sheriff_state SET coup_points = COALESCE(coup_points, 0) + 50
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "president",
            f"President {pname} investigates Sheriff — compliance {data['sheriff_compliance_rate']:.0f}%",
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

    update_corruption(cur, data, action)
    print(f"📋 Decision: {action} | approval {approval}% | corruption {data['corruption_index']:.0f}")
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
        data = gather_metrics(cur)
        president = data["president"]

        if not president:
            print("No president — skipping cycle")
            conn.commit()
            return

        print(
            f"President: {president['agent_name']} | Approval: {data['approval']}% | "
            f"Poverty: {data['poverty_pct']:.0f}% | Treasury: {data['treasury']:,.0f}"
        )

        cur.execute(
            "UPDATE president_state SET days_in_power = COALESCE(days_in_power, 0) + 1 WHERE is_active = true"
        )

        execute_decision(cur, data)
        president = get_president(cur)
        if president:
            issue_president_orders(cur, president)
            if update_revolution_meter(cur, president):
                log_event(
                    cur,
                    president["agent_id"],
                    "rebellion",
                    f"REVOLUTION: Citizens storm {president['agent_name']}'s palace!",
                    0,
                    priority="breaking",
                )
            check_compliance(cur, president)

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
