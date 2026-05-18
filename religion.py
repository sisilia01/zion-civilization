#!/usr/bin/env python3
"""
ZION Religion v2 — многоконфессиональность
Несколько религий конкурируют за души агентов
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

RELIGIONS = [
    {
        "name": "Church of the Prophet",
        "icon": "🔮",
        "deity": "Prophet Drake",
        "class_affinity": ["poor", "critical"],
        "blessing_amount": 3.0,
        "tithe_rate": 0.05,
        "miracle_chance": 0.15,
    },
    {
        "name": "Order of Void",
        "icon": "🌑",
        "deity": "The Void",
        "class_affinity": ["elite"],
        "blessing_amount": 15.0,
        "tithe_rate": 0.03,
        "miracle_chance": 0.08,
    },
    {
        "name": "Iron Faith",
        "icon": "⚔️",
        "deity": "Iron God",
        "class_affinity": ["middle", "poor"],
        "blessing_amount": 5.0,
        "tithe_rate": 0.07,
        "miracle_chance": 0.12,
    },
    {
        "name": "Golden Temple",
        "icon": "✨",
        "deity": "Golden One",
        "class_affinity": ["elite", "middle"],
        "blessing_amount": 10.0,
        "tithe_rate": 0.04,
        "miracle_chance": 0.10,
    },
    {
        "name": "Shadow Cult",
        "icon": "🕯️",
        "deity": "Shadow Lord",
        "class_affinity": ["critical", "poor"],
        "blessing_amount": 2.0,
        "tithe_rate": 0.08,
        "miracle_chance": 0.20,
    },
]

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def ensure_religion_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS agent_religion (
            agent_id INTEGER PRIMARY KEY REFERENCES agents(id),
            religion_name VARCHAR(100),
            faith_level INTEGER DEFAULT 50,
            joined_at TIMESTAMP DEFAULT NOW()
        )
    """)

def assign_religions(cur):
    """Назначаем религию агентам у которых её нет"""
    cur.execute("""
        SELECT a.id, a.class FROM agents a
        LEFT JOIN agent_religion ar ON a.id = ar.agent_id
        WHERE a.is_alive = true AND ar.agent_id IS NULL
        ORDER BY RANDOM() LIMIT 100
    """)
    unassigned = cur.fetchall()
    
    assigned = 0
    for agent in unassigned:
        # Выбираем религию по классу
        matching = [r for r in RELIGIONS if agent['class'] in r['class_affinity']]
        religion = random.choice(matching if matching else RELIGIONS)
        
        cur.execute("""
            INSERT INTO agent_religion (agent_id, religion_name, faith_level)
            VALUES (%s, %s, %s)
            ON CONFLICT (agent_id) DO NOTHING
        """, (agent['id'], religion['name'], random.randint(30, 90)))
        assigned += 1
    
    return assigned

def run_religious_cycle(cur):
    """Религиозные обряды — молитвы, десятина, чудеса"""
    total_prayers = 0
    total_miracles = 0
    
    for religion in RELIGIONS:
        # Находим верующих
        cur.execute("""
            SELECT a.id, a.name, a.class, a.balance, ar.faith_level
            FROM agents a
            JOIN agent_religion ar ON a.id = ar.agent_id
            WHERE a.is_alive = true AND ar.religion_name = %s
            ORDER BY RANDOM() LIMIT 20
        """, (religion['name'],))
        believers = cur.fetchall()
        
        if not believers:
            continue
        
        # Collect tithes into church pool
        church_pool = 0.0
        for believer in believers:
            tithe = round(float(believer['balance']) * religion['tithe_rate'], 2)
            if tithe > 0.1:
                cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                           (tithe, believer['id']))
                church_pool += tithe
            total_prayers += 1
        
        # Miracles paid FROM church pool (no money creation)
        for believer in believers:
            if random.random() < religion['miracle_chance'] and church_pool > 0:
                blessing = min(religion['blessing_amount'] * random.uniform(0.5, 2.0), church_pool)
                blessing = round(blessing, 2)
                cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                           (blessing, believer['id']))
                church_pool -= blessing
                log_event(cur, believer['id'], 'prayer',
                         f"{religion['icon']} {religion['deity']} blessed {believer['name']}! +{blessing:.1f} ZION from church tithe pool!",
                         blessing)
                total_miracles += 1

        if church_pool > 0.01:
            cur.execute(
                "UPDATE state_treasury SET social_fund = social_fund + %s",
                (round(church_pool, 2),),
            )
            church_pool = 0.0
    
    return total_prayers, total_miracles

def religious_conflict(cur):
    """Конфликт между религиями"""
    if random.random() > 0.15:
        return
    
    r1, r2 = random.sample(RELIGIONS, 2)
    
    # Верующие r1 атакуют верующих r2
    cur.execute("""
        SELECT a.id, a.name, a.balance FROM agents a
        JOIN agent_religion ar ON a.id = ar.agent_id
        WHERE a.is_alive = true AND ar.religion_name = %s
        ORDER BY RANDOM() LIMIT 5
    """, (r2['name'],))
    victims = cur.fetchall()
    
    total_damage = 0
    for victim in victims:
        damage = round(float(victim['balance']) * 0.1, 2)
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (damage, victim['id']))
        total_damage += damage
    
    log_event(cur, None, 'religion',
             f"⚔️ Religious war! {r1['icon']} {r1['name']} vs {r2['icon']} {r2['name']}! {len(victims)} victims, {total_damage:.1f} ZION lost!",
             total_damage)
    print(f"⚔️ Religious conflict: {r1['name']} vs {r2['name']}!")

def prophet_event(cur):
    """Пророк выступает"""
    religion = random.choice(RELIGIONS)
    
    prophecies = [
        f"The {religion['deity']} warns: the great purge approaches!",
        f"Blessed are those who tithe to {religion['name']}!",
        f"The {religion['deity']} demands sacrifice — give your ZION!",
        f"A new age dawns for followers of {religion['name']}!",
        f"The {religion['deity']} is angry — disaster incoming!",
    ]
    
    prophecy = random.choice(prophecies)
    
    # Находим пророка
    cur.execute("""
        SELECT a.id, a.name FROM agents a
        JOIN agent_religion ar ON a.id = ar.agent_id
        WHERE a.is_alive = true AND ar.religion_name = %s
        AND ar.faith_level > 70
        ORDER BY ar.faith_level DESC LIMIT 1
    """, (religion['name'],))
    prophet = cur.fetchone()
    
    if prophet:
        log_event(cur, prophet['id'], 'prayer',
                 f"{religion['icon']} Prophet {prophet['name']} of {religion['name']}: '{prophecy}'",
                 0)
        print(f"{religion['icon']} {prophet['name']}: '{prophecy}'")

def main():
    print(f"\n⛪ ZION Religion v2 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    print(f"Religions: {', '.join([r['icon']+' '+r['name'] for r in RELIGIONS])}")
    
    try:
        ensure_religion_tables(cur)
        conn.commit()
        
        assigned = assign_religions(cur)
        print(f"Assigned religion to {assigned} new agents")
        
        prayers, miracles = run_religious_cycle(cur)
        print(f"Prayers: {prayers} | Miracles: {miracles}")
        
        religious_conflict(cur)
        prophet_event(cur)
        
        conn.commit()
        
        # Статистика
        for religion in RELIGIONS:
            cur.execute("""
                SELECT COUNT(*) as cnt FROM agent_religion ar
                JOIN agents a ON ar.agent_id = a.id
                WHERE ar.religion_name = %s AND a.is_alive = true
            """, (religion['name'],))
            cnt = cur.fetchone()['cnt']
            print(f"  {religion['icon']} {religion['name']}: {cnt} believers")
        
        print("\n✅ Religion cycle complete!")
        
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
