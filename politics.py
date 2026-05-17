#!/usr/bin/env python3
"""
ZION Politics v2 — Две партии, президент, законы, сенат
"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Две партии
PARTIES = {
    "blue": {
        "name": "Blue Alliance",
        "ideology": "progressive",
        "color": "🔵",
        "tax_modifier": 1.2,      # Высокие налоги
        "welfare_modifier": 1.5,   # Высокие соцвыплаты
        "corp_tax": 1.3,           # Высокий корпоративный налог
        "base": ["poor", "middle"] # Электоральная база
    },
    "red": {
        "name": "Red Coalition", 
        "ideology": "conservative",
        "color": "🔴",
        "tax_modifier": 0.8,       # Низкие налоги
        "welfare_modifier": 0.7,   # Низкие соцвыплаты
        "corp_tax": 0.7,           # Низкий корпоративный налог
        "base": ["elite"]          # Электоральная база
    }
}

LAWS = {
    "blue": [
        "Universal Basic Income — all agents receive 5 ZION/cycle",
        "Corporate Tax Hike — corporations pay 30% more",
        "Free Healthcare — epidemic deaths reduced 50%",
        "Wealth Redistribution — elite pay 20% more tax",
        "Workers Rights — minimum salary increased",
    ],
    "red": [
        "Tax Cuts — all tax rates reduced 20%",
        "Corporate Freedom — no corporation regulations",
        "Strong Police — double police enforcement",
        "Elite Investment Act — elite get 10% income bonus",
        "Open Markets — market profits increased 30%",
    ]
}

def ensure_politics_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS presidents (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            agent_name VARCHAR(100),
            party VARCHAR(10),
            votes INTEGER,
            term_start TIMESTAMP DEFAULT NOW(),
            term_end TIMESTAMP,
            laws_passed TEXT[],
            is_active BOOLEAN DEFAULT true
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS active_laws (
            id SERIAL PRIMARY KEY,
            law_text TEXT,
            party VARCHAR(10),
            passed_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        )
    """)

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def run_election(cur):
    """Президентские выборы"""
    print("\n🗳️  PRESIDENTIAL ELECTION!")
    
    # Кандидаты от каждой партии
    candidates = {}
    for party_id, party in PARTIES.items():
        # Ищем кандидата из электоральной базы партии
        base_classes = "','".join(party['base'])
        cur.execute(f"""
            SELECT id, name, class, balance, charisma FROM agents
            WHERE is_alive = true AND class IN ('{base_classes}')
            ORDER BY charisma DESC, balance DESC LIMIT 1
        """)
        candidate = cur.fetchone()
        if candidate:
            candidates[party_id] = candidate
            print(f"  {party['color']} {party['name']}: {candidate['name']} ({candidate['class']})")

    if len(candidates) < 2:
        print("Not enough candidates!")
        return None, None

    # Голосование
    cur.execute("SELECT id, class, charisma FROM agents WHERE is_alive = true")
    voters = cur.fetchall()
    
    votes = {p: 0 for p in candidates}
    
    for voter in voters:
        # Голосуют по классу + случайность
        blue_weight = 50
        red_weight = 50
        
        if voter['class'] in ['poor', 'critical']:
            blue_weight += 30  # Бедные голосуют за синих
        elif voter['class'] == 'elite':
            red_weight += 30   # Богатые голосуют за красных
        elif voter['class'] == 'middle':
            blue_weight += 10
        
        blue_weight += random.randint(0, 30)
        red_weight += random.randint(0, 30)
        
        if blue_weight > red_weight and 'blue' in candidates:
            votes['blue'] += 1
        elif 'red' in candidates:
            votes['red'] += 1

    # Победитель
    winner_party = max(votes, key=votes.get)
    winner = candidates[winner_party]
    party_info = PARTIES[winner_party]
    winner_votes = votes[winner_party]
    total_votes = sum(votes.values())

    print(f"\n📊 Results:")
    for p, v in votes.items():
        print(f"  {PARTIES[p]['color']} {PARTIES[p]['name']}: {v} votes")
    print(f"\n🏆 {winner['name']} ({party_info['name']}) WINS!")

    # Деактивируем старого президента
    cur.execute("UPDATE presidents SET is_active = false, term_end = NOW() WHERE is_active = true")

    # Новый президент
    cur.execute("""
        INSERT INTO presidents (agent_id, agent_name, party, votes, laws_passed)
        VALUES (%s, %s, %s, %s, %s)
    """, (winner['id'], winner['name'], winner_party, winner_votes, []))

    # Награда победителю
    cur.execute("UPDATE agents SET balance = balance + 50 WHERE id = %s", (winner['id'],))

    log_event(cur, winner['id'], 'election',
             f"🏛️ {winner['name']} elected President! {party_info['color']} {party_info['name']} wins with {winner_votes}/{total_votes} votes!",
             50)

    return winner, winner_party

def pass_law(cur, president, party_id):
    """Президент принимает закон"""
    if not president:
        return
    
    party_laws = LAWS[party_id]
    law = random.choice(party_laws)
    
    # Деактивируем старые законы
    cur.execute("UPDATE active_laws SET is_active = false WHERE is_active = true")
    
    # Новый закон действует 24 часа
    cur.execute("""
        INSERT INTO active_laws (law_text, party, expires_at)
        VALUES (%s, %s, NOW() + INTERVAL '24 hours')
    """, (law, party_id))

    # Применяем эффект закона
    apply_law_effects(cur, law, party_id)

    log_event(cur, president['id'], 'law',
             f"📜 President {president['name']} signed: '{law}'",
             0)
    print(f"📜 New law: {law}")

def apply_law_effects(cur, law, party_id):
    """Применяем эффекты закона"""
    if "Universal Basic Income" in law:
        cur.execute("""
            UPDATE agents SET balance = balance + 5
            WHERE is_alive = true AND class IN ('poor', 'critical')
        """)
        print("💰 UBI: +5 ZION to poor/critical agents")
    
    elif "Corporate Tax Hike" in law:
        cur.execute("""
            UPDATE corporations SET treasury = treasury * 0.7
            WHERE is_active = true
        """)
        print("🏢 Corporate tax collected!")
    
    elif "Tax Cuts" in law:
        cur.execute("""
            UPDATE agents SET balance = balance * 1.05
            WHERE is_alive = true AND class = 'elite'
        """)
        print("💸 Tax cuts: +5% to elite balance")
    
    elif "Elite Investment Act" in law:
        cur.execute("""
            UPDATE agents SET balance = balance * 1.10
            WHERE is_alive = true AND class = 'elite'
        """)
        print("📈 Elite investment bonus: +10%")
    
    elif "Strong Police" in law:
        # Полиция активнее
        cur.execute("""
            UPDATE agents SET balance = balance - balance * 0.1
            WHERE is_alive = true AND dust_days > 2
        """)
        print("🚔 Strong police enforcement!")

def run_rebellion(cur):
    """Восстание если народ недоволен"""
    cur.execute("""
        SELECT COUNT(*) as cnt FROM agents 
        WHERE is_alive = true AND balance < 3 AND class IN ('poor', 'critical')
    """)
    angry = cur.fetchone()['cnt']
    
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
    total = cur.fetchone()['cnt']
    
    if total == 0:
        return
    
    pct = angry / total
    
    if pct >= 0.15 and random.random() < 0.4:
        # Восстание!
        cur.execute("""
            SELECT id, name, balance FROM agents
            WHERE is_alive = true AND class = 'elite'
            ORDER BY balance DESC LIMIT 5
        """)
        rich = cur.fetchall()
        
        total_stolen = 0
        for agent in rich:
            damage = round(float(agent['balance']) * 0.2, 2)
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (damage, agent['id']))
            total_stolen += damage
        
        log_event(cur, None, 'rebellion',
                 f"✊ REBELLION! {angry} agents ({pct*100:.0f}%) rose up! Elite lost {total_stolen:.1f} ZION!",
                 total_stolen)
        print(f"✊ REBELLION! {angry} angry agents ({pct*100:.0f}%)")
    else:
        print(f"☮️ No rebellion ({angry} angry = {pct*100:.0f}%)")

def main():
    print(f"\n🏛️ ZION Politics v2 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        ensure_politics_tables(cur)
        conn.commit()
        
        # Проверяем есть ли активный президент
        cur.execute("SELECT * FROM presidents WHERE is_active = true LIMIT 1")
        current_president = cur.fetchone()
        
        if not current_president:
            # Нет президента — выборы!
            print("No president — calling election!")
            president, party_id = run_election(cur)
            if president and party_id:
                pass_law(cur, president, party_id)
        else:
            print(f"Current President: {current_president['agent_name']} ({PARTIES[current_president['party']]['color']} {PARTIES[current_president['party']]['name']})")
            
            # 20% шанс новых выборов
            if random.random() < 0.20:
                president, party_id = run_election(cur)
                if president and party_id:
                    pass_law(cur, president, party_id)
            else:
                # Президент принимает новый закон
                if random.random() < 0.5:
                    cur.execute("SELECT id, name FROM agents WHERE id = %s", (current_president['agent_id'],))
                    pres_agent = cur.fetchone()
                    if pres_agent:
                        pass_law(cur, pres_agent, current_president['party'])
        
        run_rebellion(cur)
        conn.commit()
        print("\n✅ Politics cycle complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
