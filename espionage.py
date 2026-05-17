#!/usr/bin/env python3
"""ZION Espionage — шпионаж между кланами"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(host="localhost", database="zion_db", user="zion_user", password="zion2026")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("INSERT INTO events (agent_id, event_type, description, zion_amount) VALUES (%s,%s,%s,%s)",
               (agent_id, event_type, description, amount))

def run_espionage(cur):
    cur.execute("SELECT id, name, treasury FROM clans WHERE treasury > 100 ORDER BY RANDOM() LIMIT 2")
    clans = cur.fetchall()
    if len(clans) < 2:
        return

    attacker = clans[0]
    victim = clans[1]

    # Находим шпиона
    cur.execute("""
        SELECT id, name FROM agents
        WHERE is_alive = true AND clan_id = %s
        ORDER BY RANDOM() LIMIT 1
    """, (attacker['id'],))
    spy = cur.fetchone()
    if not spy:
        return

    # 40% успех
    if random.random() < 0.4:
        stolen = round(float(victim['treasury']) * random.uniform(0.05, 0.2), 2)
        cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s", (stolen, victim['id']))
        cur.execute("UPDATE clans SET treasury = treasury + %s WHERE id = %s", (stolen, attacker['id']))
        cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s", (stolen * 0.1, spy['id']))
        log_event(cur, spy['id'], 'espionage',
                 f"🕵️ {spy['name']} infiltrated {victim['name']}! Stole {stolen:.1f} ZION for {attacker['name']}!",
                 stolen)
        print(f"🕵️ {spy['name']} stole {stolen:.1f} ZION from {victim['name']}")
    else:
        # Провал — шпиона поймали
        fine = 10.0
        if fine > 0:
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s", (fine, spy['id']))
        log_event(cur, spy['id'], 'espionage',
                 f"🚨 Spy {spy['name']} caught by {victim['name']}! Fined {fine:.1f} ZION",
                 fine)
        print(f"🚨 Spy {spy['name']} caught! Fine: {fine:.1f} ZION")

def main():
    print(f"\n🕵️ ZION Espionage — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    try:
        for _ in range(3):
            run_espionage(cur)
        conn.commit()
        print("✅ Espionage cycle complete!")
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
