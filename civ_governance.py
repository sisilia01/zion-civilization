#!/usr/bin/env python3
"""President ↔ Sheriff orders, compliance, coup, revolution."""
import json
import random

from civ_common import economy_snapshot, log_event, transfer_power


ORDER_TYPES = [
    "ATTACK_GANG",
    "INCREASE_PATROL",
    "ARREST_CORRUPT_AGENT",
    "PROTECT_CORP",
]

MIN_SHERIFF_TENURE_DAYS = 3
COMPLIANCE_FIRE_THRESHOLD = 0.30


def get_sheriff_compliance_metrics(cur) -> dict:
    """Compliance from sheriff_orders in the last 24h (not cycle counters)."""
    cur.execute(
        "SELECT COALESCE(days_in_office, 0) AS d FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    row = cur.fetchone()
    days = int((row or {}).get("d") or 0)

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM sheriff_orders
        WHERE issued_at > NOW() - INTERVAL '24 hours'
        """
    )
    given = int(cur.fetchone()["c"] or 0)
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM sheriff_orders
        WHERE issued_at > NOW() - INTERVAL '24 hours'
          AND status IN ('executed', 'faked')
        """
    )
    executed = int(cur.fetchone()["c"] or 0)

    if given == 0:
        rate = None
        rate_pct = None
    else:
        rate = executed / given
        rate_pct = rate * 100

    return {
        "orders_24h": given,
        "orders_executed_24h": executed,
        "compliance_rate": rate_pct,
        "compliance_rate_raw": rate,
        "days_in_office": days,
        "measurable": given > 0,
        "tenure_ok": days > MIN_SHERIFF_TENURE_DAYS,
    }


def sheriff_compliance_actionable(metrics: dict, threshold_pct: float = 30.0) -> bool:
    """True when compliance can be measured, tenure > 3 days, and rate below threshold."""
    if not metrics.get("measurable"):
        return False
    if not metrics.get("tenure_ok"):
        return False
    rate = metrics.get("compliance_rate")
    if rate is None:
        return False
    return rate < threshold_pct


def record_last_sheriff_agent(cur):
    cur.execute("SELECT agent_id FROM sheriff_state WHERE is_active = true LIMIT 1")
    row = cur.fetchone()
    if row and row.get("agent_id"):
        cur.execute(
            """
            UPDATE civilization_state
            SET last_sheriff_agent_id = %s, updated_at = NOW()
            WHERE id = 1
            """,
            (row["agent_id"],),
        )


def deactivate_sheriff(cur):
    record_last_sheriff_agent(cur)
    cur.execute("UPDATE sheriff_state SET is_active = false WHERE is_active = true")


def issue_president_orders(cur, president):
    """President issues 1-3 direct orders per cycle based on situation."""
    if not president:
        return 0

    econ = economy_snapshot(cur)
    issued = 0
    pid = president["agent_id"]
    pname = president["agent_name"]

    cur.execute(
        """
        SELECT c.name FROM clans c
        WHERE members_count > 0 ORDER BY treasury DESC LIMIT 1
        """
    )
    top_gang = cur.fetchone()

    if top_gang and econ["poverty_pct"] > 40:
        cur.execute(
            """
            INSERT INTO sheriff_orders (president_id, order_type, payload, status)
            VALUES (%s, 'ATTACK_GANG', %s, 'pending')
            """,
            (pid, json.dumps({"gang_name": top_gang["name"]})),
        )
        issued += 1
        log_event(
            cur,
            pid,
            "president",
            f"President {pname} orders: Attack {top_gang['name']} immediately!",
            0,
            priority="urgent",
        )

    if float(president.get("police_fund") or 0) > 200:
        cur.execute(
            """
            INSERT INTO sheriff_orders (president_id, order_type, payload, status)
            VALUES (%s, 'INCREASE_PATROL', %s, 'pending')
            """,
            (pid, json.dumps({"officers": 10, "cost": 200})),
        )
        issued += 1

    if random.random() < 0.3:
        cur.execute(
            """
            SELECT name FROM agents
            WHERE is_alive = true AND class = 'elite' AND balance > 80
            ORDER BY RANDOM() LIMIT 1
            """
        )
        target = cur.fetchone()
        if target:
            cur.execute(
                """
                INSERT INTO sheriff_orders (president_id, order_type, payload, status)
                VALUES (%s, 'ARREST_CORRUPT_AGENT', %s, 'pending')
                """,
                (pid, json.dumps({"name": target["name"]})),
            )
            issued += 1

    cur.execute(
        """
        UPDATE president_state SET orders_given_cycle = COALESCE(orders_given_cycle, 0) + %s
        WHERE is_active = true
        """,
        (issued,),
    )
    return issued


def process_sheriff_orders(cur, sheriff):
    print("process_sheriff_orders: starting...", flush=True)
    if not sheriff:
        print("process_sheriff_orders: no sheriff, skipping", flush=True)
        return 0, 0

    stype = sheriff.get("sheriff_type") or "honest"
    sname = sheriff.get("agent_name") or "Sheriff"
    executed = 0
    ignored = 0

    try:
        cur.execute(
            """
            SELECT id, order_type, status, payload FROM sheriff_orders
            WHERE status = 'pending' ORDER BY issued_at ASC LIMIT 10
            """
        )
        orders = cur.fetchall()
        print(f"process_sheriff_orders: found {len(orders)} pending orders", flush=True)

        for order in orders:
            print(f"process_sheriff_orders: processing order id={order.get('id')} type={order.get('order_type')}", flush=True)
            oid = order["id"]
            otype = order["order_type"]
            payload = order["payload"] or {}
            if isinstance(payload, str):
                payload = json.loads(payload)

            if stype == "corrupt" and random.random() < 0.45:
                cur.execute(
                    """
                    UPDATE sheriff_orders SET status = 'faked', faked = true,
                        result_text = %s, executed_at = NOW()
                    WHERE id = %s
                    """,
                    (f"Sheriff {sname} reported success (faked)", oid),
                )
                ignored += 1
                if otype == "ATTACK_GANG" and payload.get("gang_name"):
                    log_event(
                        cur,
                        sheriff["agent_id"],
                        "sheriff_action",
                        f"TIP-OFF: Gang {payload['gang_name']} warned before raid!",
                        0,
                        priority="urgent",
                    )
                continue

            if stype == "junta" and random.random() < 0.35:
                ignored += 1
                cur.execute(
                    "UPDATE sheriff_orders SET status = 'ignored', executed_at = NOW() WHERE id = %s",
                    (oid,),
                )
                cur.execute(
                    "UPDATE sheriff_state SET coup_points = COALESCE(coup_points, 0) + 15 WHERE is_active = true"
                )
                continue

            print(f"process_sheriff_orders: executing order {oid} ({otype})...", flush=True)
            result = _execute_order(cur, sheriff, otype, payload)
            cur.execute(
                """
                UPDATE sheriff_orders SET status = 'executed', result_text = %s, executed_at = NOW()
                WHERE id = %s
                """,
                (result, oid),
            )
            executed += 1
            log_event(
                cur,
                sheriff["agent_id"],
                "sheriff_action",
                f"Sheriff {sname}: {result}",
                0,
                priority="normal",
            )

        cur.execute(
            """
            UPDATE sheriff_state SET
                orders_executed_cycle = %s,
                orders_ignored_cycle = %s
            WHERE is_active = true
            """,
            (executed, ignored),
        )

        if stype in ("corrupt", "junta"):
            cur.execute(
                "UPDATE sheriff_state SET coup_points = COALESCE(coup_points, 0) + %s WHERE is_active = true",
                (ignored * 12,),
            )

        print(f"process_sheriff_orders: done — executed={executed} ignored={ignored}", flush=True)
        return executed, ignored

    except Exception as e:
        print(f"process_sheriff_orders error: {e}", flush=True)
        return 0, 0


def _execute_order(cur, sheriff, otype, payload):
    if otype == "ATTACK_GANG":
        gang = payload.get("gang_name", "unknown gang")
        deaths = random.randint(2, 12)
        cur.execute(
            """
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'gang_war'
            WHERE is_alive = true AND clan_id IN (SELECT id FROM clans WHERE name = %s)
            AND id IN (SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT %s)
            """,
            (gang, deaths),
        )
        return f"Raid on {gang} complete — {deaths} casualties"

    if otype == "INCREASE_PATROL":
        cost = float(payload.get("cost", 200))
        officers = int(payload.get("officers", 10))
        cur.execute(
            "UPDATE president_state SET police_fund = GREATEST(0, police_fund - %s) WHERE is_active = true",
            (cost,),
        )
        cur.execute(
            """
            UPDATE sheriff_state SET police_count = police_count + %s,
                police_budget = police_budget + %s
            WHERE is_active = true
            """,
            (officers, cost * 0.5),
        )
        return f"Added {officers} officers ({cost:.0f} ZION from state)"

    if otype == "ARREST_CORRUPT_AGENT":
        name = payload.get("name")
        cur.execute(
            """
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'executed'
            WHERE name = %s AND is_alive = true
            """,
            (name,),
        )
        return f"Agent {name} arrested for corruption"

    if otype == "PROTECT_CORP":
        corp = payload.get("corp_name", "")
        cur.execute(
            """
            UPDATE corporations SET police_protection = true
            WHERE name = %s AND is_active = true
            """,
            (corp,),
        )
        return f"5 officers assigned to guard {corp}"

    return f"Executed {otype}"


def check_compliance(cur, president):
    if not president:
        return

    metrics = get_sheriff_compliance_metrics(cur)
    if not metrics["measurable"]:
        return  # no orders in 24h — compliance cannot be measured

    rate = metrics["compliance_rate_raw"]
    pname = president["agent_name"]

    if rate < COMPLIANCE_FIRE_THRESHOLD and metrics["tenure_ok"]:
        deactivate_sheriff(cur)
        log_event(
            cur,
            president["agent_id"],
            "sheriff_action",
            f"INSUBORDINATION: President {pname} fires Sheriff! Compliance {rate*100:.0f}% — emergency election!",
            0,
            priority="breaking",
        )
        cur.execute(
            "UPDATE president_state SET compliance_low_cycles = 0, orders_given_cycle = 0 WHERE is_active = true"
        )
        return

    if metrics["tenure_ok"] and rate < 0.50:
        cur.execute(
            """
            UPDATE president_state SET compliance_low_cycles = COALESCE(compliance_low_cycles, 0) + 1
            WHERE is_active = true
            """
        )
        cur.execute(
            "SELECT compliance_low_cycles FROM president_state WHERE is_active = true"
        )
        low = int(cur.fetchone()["compliance_low_cycles"] or 0)
        if low >= 3:
            log_event(
                cur,
                president["agent_id"],
                "president",
                f"President {pname} declares INSUBORDINATION! Sheriff compliance {rate*100:.0f}% for 3 cycles.",
                0,
                priority="breaking",
            )
    else:
        cur.execute(
            "UPDATE president_state SET compliance_low_cycles = 0 WHERE is_active = true"
        )

    cur.execute(
        """
        UPDATE president_state SET orders_given_cycle = 0, compliance_low_cycles = 0
        WHERE is_active = true
        """
    )
    cur.execute(
        """
        UPDATE sheriff_state SET orders_executed_cycle = 0, orders_ignored_cycle = 0
        WHERE is_active = true
        """
    )


def attempt_coup(cur, sheriff, president):
    """Disabled — unconstitutional (Constitution Article II Sec.3 + Article III)."""
    return False


def check_dictator_mode(cur, president, sheriff) -> bool:
    """Disabled — no automatic dictator promotion."""
    return False


def check_anti_dictator_coup(cur, president, sheriff) -> bool:
    """Disabled — unconstitutional dictator struggle events removed."""
    return False


def check_sheriff_self_coup(cur, sheriff, president) -> bool:
    """Disabled — sheriff cannot seize executive power."""
    return False
