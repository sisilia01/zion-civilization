#!/usr/bin/env python3
"""
ZION Political Parties — три партии по классам
Conservatives (Elite), Centrists (Middle), Populists (Poor)
"""
from datetime import datetime
from civ_common import get_conn, get_cursor, log_event

PARTIES = {
    "conservatives": {
        "name": "Conservative Party",
        "emoji": "🎩",
        "base_class": "elite",
        "ideology": "Low taxes, free market, protect capital",
        "color": "gold",
    },
    "centrists": {
        "name": "Centrist Alliance", 
        "emoji": "⚖️",
        "base_class": "middle",
        "ideology": "Stability, business growth, balanced taxes",
        "color": "blue",
    },
    "populists": {
        "name": "People's Front",
        "emoji": "✊",
        "base_class": "poor",
        "ideology": "Wealth redistribution, worker rights, free food",
        "color": "red",
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
            approval_rating INTEGER DEFAULT 33,
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
            VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 33)
        """, (party_id, info["name"], info["emoji"], info["ideology"], 
              info["base_class"], leader_id, leader_name))
        print(f"  Created party: {info['emoji']} {info['name']} — leader: {leader_name}")

def update_party_members(cur):
    """Обновляем членство — агенты автоматически в партии своего класса"""
    for party_id, info in PARTIES.items():
        base_class = info["base_class"]
        if base_class == "poor":
            cur.execute("""
                SELECT COUNT(*) as c FROM agents
                WHERE is_alive=true AND class IN ('poor','critical')
            """)
        elif party_id == "centrists":
            cur.execute("""
                SELECT COUNT(*) as c FROM agents
                WHERE is_alive=true AND class IN ('working','middle')
            """)
        else:
            cur.execute("""
                SELECT COUNT(*) as c FROM agents
                WHERE is_alive=true AND class=%s
            """, (base_class,))
        count = cur.fetchone()["c"]
        cur.execute("""
            UPDATE political_parties SET members_count=%s WHERE party_id=%s
        """, (count, party_id))

def update_party_approval(cur):
    """Рейтинг партии зависит от благополучия её базы"""
    cur.execute("SELECT COUNT(*) as total FROM agents WHERE is_alive=true")
    total = max(cur.fetchone()["total"], 1)

    # Conservatives — рейтинг от доли элиты и их среднего баланса
    cur.execute("SELECT COUNT(*) as c, AVG(balance) as avg FROM agents WHERE is_alive=true AND class='elite'")
    r = cur.fetchone()
    elite_pct = (r["c"] / total) * 100
    elite_approval = min(80, int(30 + elite_pct * 5 + min(r["avg"] or 0, 1000) / 50))
    cur.execute("UPDATE political_parties SET approval_rating=%s WHERE party_id='conservatives'", (elite_approval,))

    # Centrists — стабильный средний
    cur.execute("SELECT COUNT(*) as c FROM agents WHERE is_alive=true AND class='middle'")
    mid_pct = (cur.fetchone()["c"] / total) * 100
    mid_approval = min(70, int(25 + mid_pct * 0.8))
    cur.execute("UPDATE political_parties SET approval_rating=%s WHERE party_id='centrists'", (mid_approval,))

    # Populists — чем больше бедных тем выше рейтинг
    cur.execute("SELECT COUNT(*) as c FROM agents WHERE is_alive=true AND class IN ('poor','critical')")
    poor_pct = (cur.fetchone()["c"] / total) * 100
    pop_approval = min(90, int(10 + poor_pct * 0.7))
    cur.execute("UPDATE political_parties SET approval_rating=%s WHERE party_id='populists'", (pop_approval,))

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
