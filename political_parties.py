#!/usr/bin/env python3
"""
ZION Political Parties — две партии по классам
Consensus (Elite), Reform (Working/Middle/Poor)
"""
from datetime import datetime
from civ_common import get_conn, get_cursor, log_event

PARTIES = {
    "consensus": {
        "name": "Consensus Party",
        "emoji": "🏛️",
        "base_class": "elite",
        "ideology": "Order, tradition, low taxes",
        "color": "gold",
    },
    "reform": {
        "name": "Reform Party",
        "emoji": "⚡",
        "base_class": "reform",
        "ideology": "Progress, equality, social programs",
        "color": "blue",
    },
}

def ensure_parties_schema(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS political_parties (
            id SERIAL PRIMARY KEY,
            party_id TEXT UNIQUE NOT NULL,
            name TEXT,
            emoji TEXT,
            ideology TEXT,
            base_class TEXT,
            leader_agent_id INTEGER,
            leader_name TEXT,
            treasury NUMERIC DEFAULT 0,
            approval_rating INTEGER DEFAULT 50,
            members_count INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            last_action TEXT,
            last_action_at TIMESTAMP,
            memory JSONB DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS party_members (
            agent_id INTEGER PRIMARY KEY,
            party_id TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS vip_memory (
            id SERIAL PRIMARY KEY,
            vip_type TEXT NOT NULL,
            vip_id TEXT NOT NULL,
            day TEXT NOT NULL,
            metrics JSONB,
            decision TEXT,
            reasoning TEXT,
            outcome TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

def ensure_parties_exist(cur):
    for party_id, info in PARTIES.items():
        cur.execute("SELECT id FROM political_parties WHERE party_id=%s", (party_id,))
        if cur.fetchone():
            continue
        # Найти лидера из соответствующего класса
        if info["base_class"] == "reform":
            cur.execute("""
                SELECT id, name FROM agents 
                WHERE is_alive=true AND class IN ('working','middle','poor','critical')
                ORDER BY balance DESC, charisma DESC LIMIT 1
            """)
        else:
            cur.execute("""
                SELECT id, name FROM agents 
                WHERE is_alive=true AND class=%s
                ORDER BY balance DESC, charisma DESC LIMIT 1
            """, (info["base_class"],))
        leader = cur.fetchone()
        leader_id = leader["id"] if leader else None
        leader_name = leader["name"] if leader else "Unknown"

        cur.execute("""
            INSERT INTO political_parties 
            (party_id, name, emoji, ideology, base_class, leader_agent_id, leader_name, treasury, approval_rating)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 50)
        """, (party_id, info["name"], info["emoji"], info["ideology"], 
              info["base_class"], leader_id, leader_name))
        print(f"  Created party: {info['emoji']} {info['name']} — leader: {leader_name}")

def update_party_members(cur):
    """Sync party_members and members_count from agents.party (source of truth)."""
    cur.execute("DELETE FROM party_members")
    cur.execute(
        """
        INSERT INTO party_members (agent_id, party_id, role)
        SELECT id, party, 'member'
        FROM agents
        WHERE is_alive = true AND party IN ('consensus', 'reform')
        """
    )
    for party_id in PARTIES:
        cur.execute(
            """
            SELECT COUNT(*) as c FROM agents
            WHERE is_alive=true AND party=%s
            """,
            (party_id,),
        )
        count = cur.fetchone()["c"]
        cur.execute(
            """
            UPDATE political_parties SET members_count=%s WHERE party_id=%s
            """,
            (count, party_id),
        )

def update_party_approval(cur):
    """Рейтинг партии зависит от благополучия её базы"""
    cur.execute("SELECT COUNT(*) as total FROM agents WHERE is_alive=true")
    total = max(cur.fetchone()["total"], 1)

    # Consensus — рейтинг от доли элиты/богатых и их среднего баланса
    cur.execute("SELECT COUNT(*) as c, AVG(balance) as avg FROM agents WHERE is_alive=true AND class IN ('elite','rich')")
    r = cur.fetchone()
    elite_pct = (r["c"] / total) * 100
    elite_approval = min(80, int(30 + elite_pct * 5 + min(r["avg"] or 0, 1000) / 50))
    cur.execute("UPDATE political_parties SET approval_rating=%s WHERE party_id='consensus'", (elite_approval,))

    # Reform — чем больше не-элиты, особенно бедных, тем выше рейтинг
    cur.execute("SELECT COUNT(*) as c FROM agents WHERE is_alive=true AND class IN ('working','middle','poor','critical')")
    reform_count = cur.fetchone()["c"]
    reform_pct = (reform_count / total) * 100
    cur.execute("SELECT COUNT(*) as c FROM agents WHERE is_alive=true AND class IN ('poor','critical')")
    poor_pct = (cur.fetchone()["c"] / total) * 100
    reform_approval = min(90, int(15 + reform_pct * 0.5 + poor_pct * 0.4))
    cur.execute("UPDATE political_parties SET approval_rating=%s WHERE party_id='reform'", (reform_approval,))

def compute_party_poll_shares(parties: list) -> None:
    """Normalize party support into poll_pct shares that sum to 100."""
    if not parties:
        return
    total = sum(max(0, int(p.get("approval_rating") or 0)) for p in parties)
    vote_field = "approval_rating"
    if total <= 0:
        vote_field = "members_count"
        total = sum(max(0, int(p.get("members_count") or 0)) for p in parties)
    if total <= 0:
        even = round(100 / len(parties), 1)
        for p in parties:
            p["poll_pct"] = even
        return
    for p in parties:
        votes = max(0, int(p.get(vote_field) or 0))
        p["poll_pct"] = round(votes / total * 100, 1)


def get_parties_summary(cur) -> dict:
    cur.execute("SELECT * FROM political_parties ORDER BY approval_rating DESC")
    parties = cur.fetchall()
    return {p["party_id"]: dict(p) for p in parties}

def main():
    print(f"\n🗳️ ZION Political Parties — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        ensure_parties_schema(cur)
        conn.commit()
        ensure_parties_exist(cur)
        update_party_members(cur)
        update_party_approval(cur)
        conn.commit()

        summary = get_parties_summary(cur)
        for pid, p in summary.items():
            print(f"  {p['emoji']} {p['name']}: {p['approval_rating']}% approval, "
                  f"{p['members_count']} members, leader: {p['leader_name']}")

        print("\n✅ Political parties updated!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
