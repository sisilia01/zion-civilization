#!/usr/bin/env python3
"""
ZION Police — правопорядок цивилизации
Заменяет NEO. Арестовывает, штрафует, патрулирует.
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

POLICE_FUND = 0  # казна полиции

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def arrest_tax_evaders(cur):
    """Арестовывает агентов которые не платили налоги (dust_days > 3)"""
    cur.execute("""
        SELECT id, name, class, balance FROM agents
        WHERE is_alive = true AND dust_days > 3
        ORDER BY RANDOM() LIMIT 3
    """)
    evaders = cur.fetchall()
    arrested = 0
    for agent in evaders:
        fine = min(float(agent['balance']) * 0.3, 50)
        if fine > 0:
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (fine, agent['id']))
            log_event(cur, agent['id'], 'police',
                     f"🚔 Police arrested {agent['name']} for tax evasion! Fine: {fine:.1f} ZION",
                     fine)
            arrested += 1
            print(f"🚔 Arrested {agent['name']} — fine {fine:.1f} ZION")
    return arrested

def patrol_clans(cur):
    """Патрулирует кланы — штрафует за нарушения"""
    cur.execute("""
        SELECT id, name, treasury FROM clans
        WHERE treasury > 1000
        ORDER BY RANDOM() LIMIT 1
    """)
    clan = cur.fetchone()
    if not clan:
        return False
    
    fine = round(float(clan['treasury']) * 0.05, 2)
    cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s",
               (fine, clan['id']))
    log_event(cur, None, 'police',
             f"🚔 Police raided {clan['name']} clan! Confiscated {fine:.1f} ZION for illegal activities",
             fine)
    print(f"🚔 Raided clan {clan['name']} — {fine:.1f} ZION confiscated")
    return True

def protect_poor(cur):
    """Защищает бедных — перераспределяет конфискованное"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'critical' AND balance < 2
        ORDER BY balance ASC LIMIT 5
    """)
    poor = cur.fetchall()
    if not poor:
        return
    
    gift = 5.0
    for agent in poor:
        cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                   (gift, agent['id']))
        log_event(cur, agent['id'], 'police',
                 f"🛡️ Police social program: {agent['name']} received {gift} ZION aid",
                 gift)
        print(f"🛡️ Aid to {agent['name']}: +{gift} ZION")

def fight_corruption(cur):
    """Борется с коррупцией в элите"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'elite' AND balance > 500
        ORDER BY RANDOM() LIMIT 1
    """)
    corrupt = cur.fetchone()
    if not corrupt:
        return False
    
    # 10% шанс что полиция сама коррумпирована и берёт взятку
    if random.random() < 0.1:
        bribe = round(float(corrupt['balance']) * 0.1, 2)
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (bribe, corrupt['id']))
        log_event(cur, corrupt['id'], 'police',
                 f"💰 {corrupt['name']} paid {bribe:.1f} ZION bribe to corrupt police officer!",
                 bribe)
        print(f"💰 Corruption: {corrupt['name']} bribed police {bribe:.1f} ZION")
    else:
        fine = round(float(corrupt['balance']) * 0.15, 2)
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (fine, corrupt['id']))
        log_event(cur, corrupt['id'], 'police',
                 f"⚖️ Police busted {corrupt['name']} for corruption! Fined {fine:.1f} ZION",
                 fine)
        print(f"⚖️ Busted {corrupt['name']} for corruption — {fine:.1f} ZION")
    return True

def main():
    print(f"\n🚔 ZION Police — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        arrested = arrest_tax_evaders(cur)
        print(f"Tax evaders arrested: {arrested}")
        
        patrol_clans(cur)
        protect_poor(cur)
        fight_corruption(cur)
        
        # Статистика
        cur.execute("SELECT COUNT(*) as alive FROM agents WHERE is_alive=true")
        stats = cur.fetchone()
        print(f"\n✅ Police cycle complete! Alive agents: {stats['alive']}")
        
        conn.commit()
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
