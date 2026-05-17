#!/usr/bin/env python3
"""
ZION Epidemics — болезни в цивилизации
Распространяются между агентами, богатые лечатся, бедные умирают
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

DISEASES = [
    ("Dust Plague", 0.3, 0.7),      # name, spread_rate, death_rate_poor
    ("Neon Fever", 0.2, 0.5),
    ("Crypto Flu", 0.4, 0.3),
    ("Shadow Virus", 0.15, 0.8),
    ("Void Sickness", 0.25, 0.6),
]

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def spread_epidemic(cur):
    """10% шанс начала эпидемии"""
    if random.random() > 0.10:
        print("No epidemic this cycle")
        return
    
    disease_name, spread_rate, death_rate = random.choice(DISEASES)
    
    # Находим жертв
    infected_count = random.randint(20, 100)
    cur.execute("""
        SELECT id, name, class, balance FROM agents
        WHERE is_alive = true
        ORDER BY RANDOM() LIMIT %s
    """, (infected_count,))
    infected = cur.fetchall()
    
    dead = 0
    treated = 0
    
    for agent in infected:
        if agent['class'] == 'elite':
            # Элита покупает лечение
            treatment_cost = 20.0
            if float(agent['balance']) >= treatment_cost:
                cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                           (treatment_cost, agent['id']))
                treated += 1
            else:
                # Элита не может позволить лечение — умирает
                if random.random() < death_rate * 0.3:
                    cur.execute("""
                        UPDATE agents SET is_alive = false, died_at = NOW(),
                        death_cause = %s WHERE id = %s
                    """, (f"died from {disease_name}", agent['id']))
                    dead += 1
        
        elif agent['class'] == 'middle':
            if random.random() < death_rate * 0.5:
                cur.execute("""
                    UPDATE agents SET is_alive = false, died_at = NOW(),
                    death_cause = %s WHERE id = %s
                """, (f"died from {disease_name}", agent['id']))
                dead += 1
        
        else:  # poor/critical
            if random.random() < death_rate:
                cur.execute("""
                    UPDATE agents SET is_alive = false, died_at = NOW(),
                    death_cause = %s WHERE id = %s
                """, (f"died from {disease_name}", agent['id']))
                dead += 1
    
    log_event(cur, None, 'epidemic',
             f"🦠 {disease_name} outbreak! {infected_count} infected, {dead} dead, {treated} treated",
             dead * 5)
    print(f"🦠 {disease_name}: {infected_count} infected, {dead} dead, {treated} treated")

def main():
    print(f"\n🦠 ZION Epidemics — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        spread_epidemic(cur)
        conn.commit()
        print("✅ Epidemics cycle complete!")
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
