#!/usr/bin/env python3
"""One-time genesis distribution of 100 million ZION across the economy."""
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, reclassify_all_agents

TOTAL_SUPPLY = 100_000_000  # 100 million ZION


def run_genesis():
    """Distribute 100M ZION: 30% agents, 40% ZRS, 20% corps, 10% government."""
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    agents_share = TOTAL_SUPPLY * 0.30
    zrs_share = TOTAL_SUPPLY * 0.40
    corp_share = TOTAL_SUPPLY * 0.20
    gov_share = TOTAL_SUPPLY * 0.10

    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    agent_count = int(cur.fetchone()["c"] or 0)
    if agent_count == 0:
        print("No alive agents — run population genesis first.")
        cur.close()
        conn.close()
        return

    per_agent = agents_share / agent_count
    cur.execute(
        "UPDATE agents SET balance = %s WHERE is_alive = true",
        (per_agent,),
    )

    cur.execute("UPDATE zrs_state SET reserve = %s WHERE id = 1", (zrs_share,))

    cur.execute("SELECT COUNT(*) AS c FROM corporations")
    corp_count = max(int(cur.fetchone()["c"] or 0), 1)
    per_corp = corp_share / corp_count
    cur.execute("UPDATE corporations SET treasury = %s", (per_corp,))

    cur.execute(
        "UPDATE president_state SET personal_fund = %s WHERE is_active = true",
        (gov_share,),
    )

    reclassify_all_agents(cur)
    conn.commit()

    print(f"\n🌍 ZION Token Genesis — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("Genesis complete!")
    print(f"  Agents: {agent_count} × {per_agent:.2f} ZION ({agents_share:,.0f} total)")
    print(f"  ZRS reserve: {zrs_share:,.0f} ZION")
    print(f"  Corps: {corp_count} × {per_corp:.2f} ZION ({corp_share:,.0f} total)")
    print(f"  Government: {gov_share:,.0f} ZION")

    cur.execute(
        """
        SELECT class, COUNT(*) AS c, ROUND(SUM(balance)::numeric, 2) AS total
        FROM agents WHERE is_alive = true GROUP BY class ORDER BY class
        """
    )
    print("\n📊 Agent classes after genesis:")
    for row in cur.fetchall():
        print(f"  {row['class']}: {row['c']} agents, {float(row['total']):,.0f} ZION")

    cur.execute(
        "SELECT COALESCE(AVG(balance), 0) AS avg, COALESCE(SUM(balance), 0) AS total FROM agents WHERE is_alive = true"
    )
    s = cur.fetchone()
    print(f"\n  Alive agents: {agent_count} | Avg balance: {float(s['avg']):,.2f} | Agent pool: {float(s['total']):,.0f} ZION")
    cur.execute("SELECT COALESCE(reserve, 0) AS r FROM zrs_state WHERE id = 1")
    print(f"  ZRS reserve: {float(cur.fetchone()['r']):,.0f} ZION\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run_genesis()
