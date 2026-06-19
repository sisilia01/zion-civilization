import random
import psycopg2
import psycopg2.extras
from civ_common import get_conn, get_cursor, log_event

DISASTERS = [
    {
        "name": "EPIDEMIC",
        "emoji": "🦠",
        "description": "Deadly epidemic sweeps through ZION! Agents dying rapidly.",
        "effect": "kill_poor",
        "severity": 0.02,  # 2% of poor die
    },
    {
        "name": "DROUGHT",
        "emoji": "☀️",
        "description": "Severe drought! Agricultural corporations lose 50% revenue.",
        "effect": "corp_damage",
        "sector": "AGRO",
        "severity": 0.5,
    },
    {
        "name": "GANG_WAR",
        "emoji": "⚔️",
        "description": "Full scale gang war erupts! Crime spikes, economy suffers.",
        "effect": "gang_war",
        "severity": 2.0,
    },
    {
        "name": "RELIGIOUS_CRISIS",
        "emoji": "⛪",
        "description": "Religious uprising! Workers refuse to work for 24 hours.",
        "effect": "work_stoppage",
        "severity": 0.3,
    },
    {
        "name": "FINANCIAL_CRASH",
        "emoji": "📉",
        "description": "Market crash! All agents lose 20% of balance.",
        "effect": "wealth_loss",
        "severity": 0.2,
    },
    {
        "name": "TECH_BOOM",
        "emoji": "🚀",
        "description": "Technology boom! TECH corporations double revenue for 48 hours.",
        "effect": "corp_boost",
        "sector": "TECH",
        "severity": 2.0,
    },
    {
        "name": "CRIME_WAVE",
        "emoji": "🔫",
        "description": "Massive crime wave! Police overwhelmed.",
        "effect": "crime_spike",
        "severity": 3.0,
    },
]


def run_disaster_check():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur2 = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur2.execute("SELECT COUNT(*) c FROM agents WHERE is_alive=true")
    population = cur2.fetchone()["c"]
    if population < 50000:
        print("Population too low, skipping disaster")
        conn.close()
        return
    cur2.execute("SELECT COALESCE(police_count,0) as pc FROM sheriff_state WHERE is_active=true LIMIT 1")
    row = cur2.fetchone()
    if row and row["pc"] < 10:
        print("Police too weak, skipping disaster")
        conn.close()
        return

    # 15% chance of disaster per run
    if random.random() > 0.15:
        print("No disaster this cycle")
        conn.close()
        return

    disaster = random.choice(DISASTERS)
    print(f"DISASTER: {disaster['emoji']} {disaster['name']}")

    if disaster["effect"] == "kill_poor":
        cur.execute(
            """
            UPDATE agents SET is_alive = false
            WHERE is_alive = true AND class IN ('poor','critical')
            AND id IN (SELECT id FROM agents WHERE is_alive=true AND class IN ('poor','critical')
                      ORDER BY RANDOM() LIMIT (SELECT CAST(COUNT(*)*%s AS INT) FROM agents WHERE is_alive=true AND class='poor'))
            """,
            (disaster["severity"],),
        )
        killed = cur.rowcount
        log_event(cur, None, "disaster", f"🦠 EPIDEMIC: {killed} poor agents died! {disaster['description']}", killed)

    elif disaster["effect"] == "corp_damage":
        cur.execute(
            """
            UPDATE corporations SET treasury = treasury * %s
            WHERE is_active = true AND UPPER(COALESCE(corp_type, '')) = %s
            """,
            (1 - disaster["severity"], disaster.get("sector", "AGRO")),
        )
        log_event(cur, None, "disaster", f"☀️ DROUGHT: Agricultural corporations devastated! {disaster['description']}", 0)

    elif disaster["effect"] == "gang_war":
        cur.execute("SELECT id FROM clans WHERE members_count > 0")
        for row in cur.fetchall():
            clan_id = row["id"]
            cur.execute(
                """
                UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'gang_war'
                WHERE id IN (
                    SELECT id FROM agents
                    WHERE clan_id = %s AND is_alive = true
                    ORDER BY RANDOM()
                    LIMIT GREATEST(1, (
                        SELECT CAST(COUNT(*) * 0.25 AS INT)
                        FROM agents WHERE clan_id = %s AND is_alive = true
                    ))
                )
                """,
                (clan_id, clan_id),
            )
        cur.execute(
            """
            UPDATE clans c SET members_count = (
                SELECT COUNT(*) FROM agents WHERE clan_id = c.id AND is_alive = true
            )
            """
        )
        cur.execute("UPDATE civilization_state SET revolution_meter = LEAST(100, revolution_meter + 20) WHERE id = 1")
        log_event(cur, None, "disaster", f"⚔️ GANG WAR: Clans fight each other! {disaster['description']}", 0)

    elif disaster["effect"] == "work_stoppage":
        cur.execute(
            """
            UPDATE agents SET job_status = 'unemployed'
            WHERE is_alive = true AND employer_corp_id IS NOT NULL
              AND id IN (
                  SELECT id FROM agents
                  WHERE is_alive = true AND employer_corp_id IS NOT NULL
                  ORDER BY RANDOM()
                  LIMIT (SELECT CAST(COUNT(*) * %s AS INT) FROM agents WHERE is_alive = true AND employer_corp_id IS NOT NULL)
              )
            """,
            (disaster["severity"],),
        )
        log_event(cur, None, "disaster", f"⛪ RELIGIOUS CRISIS: Work stoppage hit the labor force! {disaster['description']}", 0)

    elif disaster["effect"] == "wealth_loss":
        cur.execute("UPDATE agents SET balance = balance * %s WHERE is_alive = true AND balance > 10", (1 - disaster["severity"],))
        log_event(cur, None, "disaster", f"📉 FINANCIAL CRASH: All agents lost {int(disaster['severity']*100)}% wealth! {disaster['description']}", 0)

    elif disaster["effect"] == "corp_boost":
        cur.execute(
            """
            UPDATE corporations SET treasury = treasury * %s
            WHERE is_active = true AND UPPER(COALESCE(corp_type, '')) = %s
            """,
            (disaster["severity"], disaster.get("sector", "TECH")),
        )
        log_event(cur, None, "disaster", f"🚀 TECH BOOM: Technology sector booming! {disaster['description']}", 0)

    elif disaster["effect"] == "crime_spike":
        recruit_each = max(1, int(disaster["severity"]))
        cur.execute("SELECT id FROM clans WHERE members_count > 0")
        for row in cur.fetchall():
            clan_id = row["id"]
            cur.execute(
                """
                UPDATE agents SET clan_id = %s, clan_name = (SELECT name FROM clans WHERE id = %s)
                WHERE id IN (
                    SELECT id FROM agents
                    WHERE is_alive = true AND clan_id IS NULL
                      AND class IN ('poor', 'critical', 'working')
                    ORDER BY RANDOM() LIMIT %s
                )
                """,
                (clan_id, clan_id, recruit_each),
            )
        cur.execute(
            """
            UPDATE clans c SET members_count = (
                SELECT COUNT(*) FROM agents WHERE clan_id = c.id AND is_alive = true
            )
            """
        )
        log_event(cur, None, "disaster", f"🔫 CRIME WAVE: Gang power tripled! {disaster['description']}", 0)

    cur.execute("UPDATE sheriff_state SET police_budget = police_budget + 500 WHERE is_active = true AND police_budget < 2000")
    conn.commit()
    conn.close()
    print(f"Disaster {disaster['name']} executed successfully")


if __name__ == "__main__":
    run_disaster_check()
