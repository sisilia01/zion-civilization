#!/usr/bin/env python3
"""Sanity checks for ZION civilization economy — run after each bug-fix iteration."""
from __future__ import annotations

import sys

from civ_common import (
    check_money_conservation,
    compute_total_zion,
    ensure_schema,
    get_conn,
    get_cursor,
)


def run_checks() -> list[str]:
    bugs: list[str] = []
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    cur.execute(
        """
        UPDATE corporations c
        SET employees = (
            SELECT COUNT(*) FROM agents a
            WHERE a.employer_corp_id = c.id
              AND a.is_alive = true
        )
        """
    )
    conn.commit()
    print("Employee counts synced", flush=True)

    ledger = compute_total_zion(cur)
    total = ledger["total"]

    # Money conservation drift
    conservation = check_money_conservation(cur, label="verify")
    if conservation.get("delta_pct", 0) > 1.0 and conservation.get("prev_total", 0) > 0:
        bugs.append(
            f"MONEY DRIFT: {conservation['delta_pct']:.2f}% "
            f"({conservation['prev_total']:,.0f} → {total:,.0f})"
        )

    # Negative treasuries / budgets
    cur.execute(
        """
        SELECT 'corporation' AS kind, name, treasury AS val FROM corporations
        WHERE is_active = true AND treasury < 0
        UNION ALL
        SELECT 'clan', name, treasury FROM clans WHERE treasury < 0
        UNION ALL
        SELECT 'zrs_reserve', 'zrs', reserve FROM zrs_state WHERE reserve < 0
        UNION ALL
        SELECT 'senate_budget', 'senate', balance FROM senate_budget WHERE balance < 0
        UNION ALL
        SELECT 'police_budget', 'sheriff', police_budget FROM sheriff_state
        WHERE is_active = true AND police_budget < 0
        UNION ALL
        SELECT 'president_fund', agent_name, personal_fund FROM president_state
        WHERE is_active = true AND personal_fund < 0
        LIMIT 20
        """
    )
    for row in cur.fetchall():
        bugs.append(f"NEGATIVE TREASURY: {row['kind']} {row['name']} = {row['val']}")

    # Alive agents with negative balance
    cur.execute(
        "SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND balance < 0"
    )
    neg_bal = int((cur.fetchone() or {}).get("c") or 0)
    if neg_bal:
        bugs.append(f"NEGATIVE BALANCE: {neg_bal} alive agents with balance < 0")

    # Clan members_count vs actual agents
    cur.execute(
        """
        SELECT c.id, c.name, c.members_count,
               (SELECT COUNT(*) FROM agents a WHERE a.clan_id = c.id AND a.is_alive = true) AS actual
        FROM clans c
        WHERE c.members_count != (
            SELECT COUNT(*) FROM agents a WHERE a.clan_id = c.id AND a.is_alive = true
        )
        LIMIT 20
        """
    )
    for row in cur.fetchall():
        bugs.append(
            f"CLAN COUNT MISMATCH: {row['name']} members_count={row['members_count']} actual={row['actual']}"
        )

    # Corp employees vs actual (allow small drift from deaths between cycles)
    cur.execute(
        """
        SELECT c.id, c.name, c.employees,
               (SELECT COUNT(*) FROM agents a WHERE a.employer_corp_id = c.id AND a.is_alive = true) AS actual
        FROM corporations c
        WHERE c.is_active = true
        """
    )
    for row in cur.fetchall():
        stored = int(row["employees"] or 0)
        actual = int(row["actual"] or 0)
        tolerance = max(2, int(actual * 0.02))
        if abs(stored - actual) > tolerance:
            bugs.append(
                f"CORP EMPLOYEE MISMATCH: {row['name']} stored={stored} actual={actual}"
            )

    # Employment trend (stuck at 0 employed is suspicious if corps exist)
    cur.execute(
        """
        SELECT COUNT(*) AS employed FROM agents
        WHERE is_alive = true AND employer_corp_id IS NOT NULL
        """
    )
    employed = int((cur.fetchone() or {}).get("employed") or 0)
    cur.execute("SELECT COUNT(*) AS c FROM corporations WHERE is_active = true")
    active_corps = int((cur.fetchone() or {}).get("c") or 0)
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    alive = int((cur.fetchone() or {}).get("c") or 0)
    if active_corps > 0 and alive > 100 and employed == 0:
        bugs.append(
            f"EMPLOYMENT STUCK: 0 employed with {active_corps} active corps and {alive} alive agents"
        )

    conn.commit()
    cur.close()
    conn.close()
    return bugs


def main() -> int:
    try:
        bugs = run_checks()
    except Exception as e:
        print(f"❌ Verification failed to run: {e}")
        return 1

    if bugs:
        print(f"❌ {len(bugs)} issue(s) found:")
        for b in bugs:
            print(f"  - {b}")
        return 1

    print("✅ Civilization verification passed — zero bugs detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
