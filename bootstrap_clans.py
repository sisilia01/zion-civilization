#!/usr/bin/env python3
"""One-time clan bootstrap utility to break zero-member deadlock."""

from civ_common import ensure_schema, get_conn, get_cursor, log_event


def bootstrap_clans(cur):
    """Revive 2 clans with minimal treasury and founding members."""
    cur.execute(
        """
        SELECT id, name
        FROM clans
        WHERE UPPER(COALESCE(status, '')) = 'DISBANDED'
           OR COALESCE(members_count, 0) = 0
        ORDER BY id
        LIMIT 2
        """
    )
    clans_to_revive = cur.fetchall()
    revived = 0

    for clan in clans_to_revive:
        clan_id = clan["id"]
        clan_name = clan["name"]

        cur.execute(
            """
            SELECT id
            FROM agents
            WHERE is_alive = true
              AND clan_id IS NULL
            ORDER BY COALESCE(aggression, 0) DESC, COALESCE(faith, 100) ASC
            LIMIT 3
            """
        )
        founders = [row["id"] for row in cur.fetchall()]
        if not founders:
            print(f"Skip {clan_name}: no available founders")
            continue

        cur.execute(
            """
            UPDATE clans
            SET status = 'ACTIVE',
                treasury = 200,
                members_count = %s
            WHERE id = %s
            """,
            (len(founders), clan_id),
        )

        cur.execute(
            """
            UPDATE agents
            SET clan_id = %s,
                clan_name = %s
            WHERE id = ANY(%s)
            """,
            (clan_id, clan_name, founders),
        )

        log_event(
            cur,
            None,
            "clan",
            f"Bootstrap: revived {clan_name} with {len(founders)} founders and 200 ZION treasury",
            200,
            priority="urgent",
        )
        print(f"Revived {clan_name} with {len(founders)} founders")
        revived += 1

    return revived


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()
    try:
        revived = bootstrap_clans(cur)
        conn.commit()
        print(f"Bootstrap complete: revived {revived} clan(s)")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
