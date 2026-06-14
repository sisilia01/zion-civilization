#!/usr/bin/env python3
"""President ↔ Sheriff — constitutional separation (Article XVII).

Sheriff is independently elected. President may issue policy REQUESTS only;
Sheriff is not operationally subordinate to the Executive.
"""
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
SHERIFF_RECALL_REVOLUTION_MIN = 250


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
    """President issues non-binding policy requests — Sheriff may ignore (Article XVII)."""
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
            (pid, json.dumps({"gang_name": top_gang["name"], "binding": False})),
        )
        issued += 1
        log_event(
            cur,
            pid,
            "president",
            f"President {pname} REQUESTS (non-binding): investigate {top_gang['name']} — "
            f"Sheriff acts independently under Article XVII",
            0,
            priority="normal",
        )

    if float(president.get("police_fund") or 0) > 200:
        cur.execute(
            """
            INSERT INTO sheriff_orders (president_id, order_type, payload, status)
            VALUES (%s, 'INCREASE_PATROL', %s, 'pending')
            """,
            (pid, json.dumps({"officers": 10, "cost": 200, "binding": False})),
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
                (pid, json.dumps({"name": target["name"], "binding": False})),
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
    """Sheriff reviews president requests — constitutionally independent, does not obey."""
    print("process_sheriff_orders: starting...", flush=True)
    if not sheriff:
        print("process_sheriff_orders: no sheriff, skipping", flush=True)
        return 0, 0

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
        print(f"process_sheriff_orders: found {len(orders)} pending requests", flush=True)

        for order in orders:
            oid = order["id"]
            otype = order["order_type"]
            cur.execute(
                """
                UPDATE sheriff_orders SET status = 'ignored_constitutional',
                    result_text = %s, executed_at = NOW()
                WHERE id = %s
                """,
                (
                    f"Sheriff {sname} declines executive request ({otype}) — "
                    f"independent office under Article XVII; bound only by Constitution and Senate law",
                    oid,
                ),
            )
            ignored += 1
            log_event(
                cur,
                sheriff["agent_id"],
                "sheriff_action",
                f"CONSTITUTIONAL INDEPENDENCE: Sheriff {sname} ignores President's "
                f"{otype} request — not subordinate to Executive",
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

        print(f"process_sheriff_orders: done — ignored={ignored} (constitutional)", flush=True)
        return executed, ignored

    except Exception as e:
        print(f"process_sheriff_orders error: {e}", flush=True)
        return 0, 0


def check_compliance(cur, president):
    """President cannot fire Sheriff — independence under Article XVII.

    Low compliance on non-binding requests is logged only.
    Sheriff removal requires constitutional crisis + Senate recall vote.
    """
    if not president:
        return

    metrics = get_sheriff_compliance_metrics(cur)
    if not metrics["measurable"]:
        return

    rate = metrics["compliance_rate_raw"]
    pname = president["agent_name"]

    if metrics["tenure_ok"] and rate is not None and rate < 0.50:
        log_event(
            cur,
            president["agent_id"],
            "president",
            f"President {pname} notes Sheriff independence — "
            f"executive requests not fulfilled ({rate*100:.0f}% compliance). "
            f"Removal requires Senate recall during constitutional crisis (Art. XVII).",
            0,
            priority="normal",
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
