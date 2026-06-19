#!/usr/bin/env python3
"""ZION Courts — basic judiciary (trials, corruption, impeachment support)."""
from __future__ import annotations

import random
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, log_event


def ensure_courts_schema(cur):
    ensure_schema(cur)


def file_case(cur, defendant_id: int | None, case_type: str, description: str):
    cur.execute(
        """
        INSERT INTO court_cases (defendant_agent_id, case_type, status, description)
        VALUES (%s, %s, 'pending', %s)
        """,
        (defendant_id, case_type, description[:500]),
    )


def process_pending_cases(cur) -> int:
    cur.execute(
        """
        SELECT id, defendant_agent_id, case_type, description
        FROM court_cases WHERE status = 'pending'
        ORDER BY created_at ASC LIMIT 10
        """
    )
    resolved = 0
    for case in cur.fetchall():
        guilty = random.random() < 0.55
        verdict = "guilty" if guilty else "acquitted"
        cur.execute(
            """
            UPDATE court_cases SET status = 'resolved', verdict = %s, resolved_at = NOW()
            WHERE id = %s
            """,
            (verdict, case["id"]),
        )
        desc = case.get("description") or case.get("case_type")
        if guilty and case.get("case_type") == "corruption":
            cur.execute(
                """
                UPDATE sheriff_state SET approval_rating = GREATEST(0, approval_rating - 15)
                WHERE is_active = true AND sheriff_type = 'corrupt'
                """
            )
            cur.execute(
                """
                UPDATE president_state SET approval_rating = GREATEST(0, approval_rating - 5)
                WHERE is_active = true
                """
            )
            log_event(
                cur,
                case.get("defendant_agent_id"),
                "senate",
                f"⚖️ COURT: {desc} — GUILTY. Impeachment track accelerated.",
                0,
                priority="breaking",
            )
        else:
            log_event(
                cur,
                case.get("defendant_agent_id"),
                "senate",
                f"⚖️ COURT: {desc} — {verdict.upper()}",
                0,
                priority="normal",
            )
        resolved += 1
    return resolved


def investigate_sheriff_corruption(cur) -> bool:
    cur.execute(
        "SELECT agent_id, agent_name, sheriff_type FROM sheriff_state WHERE is_active = true LIMIT 1"
    )
    sh = cur.fetchone()
    if not sh or sh.get("sheriff_type") != "corrupt":
        return False
    if random.random() > 0.25:
        return False
    file_case(
        cur,
        sh.get("agent_id"),
        "corruption",
        f"Senate investigation: Sheriff {sh.get('agent_name')} corruption evidence",
    )
    return True


def run_courts_tick(cur, ctx: dict | None = None) -> int:
    ensure_courts_schema(cur)
    if ctx and ctx.get("sheriff", {}).get("corrupt_discovered"):
        investigate_sheriff_corruption(cur)
    return process_pending_cases(cur)


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        n = run_courts_tick(cur)
        conn.commit()
        print(f"\n⚖️ Courts — resolved {n} cases — {datetime.now().strftime('%H:%M')}\n")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
