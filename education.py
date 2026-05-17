#!/usr/bin/env python3
"""
ZION Education — образование меняет класс агентов
Бедные могут подняться через учёбу, богатые финансируют университеты
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

UNIVERSITIES = [
    "ZION Academy", "Prophet's Institute", "Iron Fist University",
    "Shadow School", "Void College", "Golden Dawn Seminary"
]

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def educate_agents(cur):
    """Агенты платят за образование и повышают класс"""
    # poor → middle
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'poor' AND balance > 30
        ORDER BY balance DESC LIMIT 5
    """)
    poor_students = cur.fetchall()
    
    promoted = 0
    for agent in poor_students:
        if random.random() < 0.4:  # 40% шанс успешного обучения
            cost = 25.0
            uni = random.choice(UNIVERSITIES)
            cur.execute("""
                UPDATE agents SET class = 'middle', balance = balance - %s WHERE id = %s
            """, (cost, agent['id']))
            log_event(cur, agent['id'], 'education',
                     f"🎓 {agent['name']} graduated from {uni}! Promoted to middle class! Cost: {cost} ZION",
                     cost)
            print(f"🎓 {agent['name']} promoted poor→middle via {uni}")
            promoted += 1
    
    # middle → elite (рандом)
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'middle' AND balance > 100
        ORDER BY balance DESC LIMIT 3
    """)
    middle_students = cur.fetchall()
    
    for agent in middle_students:
        if random.random() < 0.15:  # 15% шанс
            cost = 80.0
            uni = random.choice(UNIVERSITIES)
            cur.execute("""
                UPDATE agents SET class = 'elite', balance = balance - %s WHERE id = %s
            """, (cost, agent['id']))
            log_event(cur, agent['id'], 'education',
                     f"🏆 {agent['name']} earned elite degree from {uni}! Promoted to elite! Cost: {cost} ZION",
                     cost)
            print(f"🏆 {agent['name']} promoted middle→elite via {uni}")
            promoted += 1
    
    # critical → poor (базовое образование)
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'critical' AND balance > 10
        ORDER BY RANDOM() LIMIT 10
    """)
    critical_students = cur.fetchall()
    
    for agent in critical_students:
        if random.random() < 0.3:
            cost = 8.0
            cur.execute("""
                UPDATE agents SET class = 'poor', balance = balance - %s WHERE id = %s
            """, (cost, agent['id']))
            log_event(cur, agent['id'], 'education',
                     f"📚 {agent['name']} completed basic education! Promoted from critical to poor! Cost: {cost} ZION",
                     cost)
            print(f"📚 {agent['name']} promoted critical→poor")
            promoted += 1
    
    return promoted

def elite_funds_education(cur):
    """Элита финансирует стипендии для бедных"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'elite' AND balance > 500
        ORDER BY RANDOM() LIMIT 2
    """)
    donors = cur.fetchall()
    
    for donor in donors:
        if random.random() < 0.3:
            scholarship = round(float(donor['balance']) * 0.05, 2)
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (scholarship, donor['id']))
            # Даём стипендию бедным
            cur.execute("""
                SELECT id, name FROM agents
                WHERE is_alive = true AND class IN ('poor', 'critical')
                ORDER BY RANDOM() LIMIT 3
            """)
            recipients = cur.fetchall()
            gift = round(scholarship / max(len(recipients), 1), 2)
            for r in recipients:
                cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                           (gift, r['id']))
            log_event(cur, donor['id'], 'education',
                     f"🎁 {donor['name']} donated {scholarship:.1f} ZION scholarship fund!",
                     scholarship)
            print(f"🎁 {donor['name']} donated {scholarship:.1f} ZION for scholarships")

def main():
    print(f"\n🎓 ZION Education — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    try:
        promoted = educate_agents(cur)
        elite_funds_education(cur)
        print(f"\n✅ Education complete! Promoted: {promoted}")
        conn.commit()
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
