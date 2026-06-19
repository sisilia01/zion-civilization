#!/usr/bin/env python3
"""
import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
ZION Marriages — браки и семьи
Агенты женятся, объединяют капитал, рожают детей с наследованием класса
"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password=os.environ.get("DB_PASSWORD", "")
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def ensure_marriages_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS marriages (
            id SERIAL PRIMARY KEY,
            agent1_id INTEGER REFERENCES agents(id),
            agent2_id INTEGER REFERENCES agents(id),
            married_at TIMESTAMP DEFAULT NOW(),
            divorced_at TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        )
    """)

def marry_agents(cur):
    """Агенты одного класса женятся"""
    for cls in ['elite', 'middle', 'poor']:
        cur.execute("""
            SELECT a.id, a.name, a.balance FROM agents a
            WHERE a.is_alive = true AND a.class = %s
            AND a.id NOT IN (
                SELECT agent1_id FROM marriages WHERE is_active = true
                UNION SELECT agent2_id FROM marriages WHERE is_active = true
            )
            ORDER BY RANDOM() LIMIT 4
        """, (cls,))
        singles = cur.fetchall()
        
        # Женим парами
        for i in range(0, len(singles)-1, 2):
            a1 = singles[i]
            a2 = singles[i+1]
            
            # Transfer 5% from each to partner (no money creation)
            gift = round(min(float(a1['balance']), float(a2['balance'])) * 0.05, 2)
            
            cur.execute("""
                INSERT INTO marriages (agent1_id, agent2_id) VALUES (%s, %s)
            """, (a1['id'], a2['id']))
            
            # Transfer from a2 to a1 and vice versa (net zero)
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s", (gift, a1['id']))
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s", (gift, a2['id']))
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s", (gift, a2['id']))
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s", (gift, a1['id']))
            
            log_event(cur, a1['id'], 'marriage',
                     f"💍 {a1['name']} married {a2['name']}! Combined wealth: {gift*2:.1f} ZION",
                     gift*2)
            print(f"💍 {a1['name']} + {a2['name']} married! ({cls} class)")

def divorces(cur):
    """5% шанс развода — делят имущество"""
    cur.execute("""
        SELECT m.id, m.agent1_id, m.agent2_id, 
               a1.name as name1, a1.balance as bal1,
               a2.name as name2, a2.balance as bal2
        FROM marriages m
        JOIN agents a1 ON m.agent1_id = a1.id
        JOIN agents a2 ON m.agent2_id = a2.id
        WHERE m.is_active = true AND a1.is_alive = true AND a2.is_alive = true
        ORDER BY RANDOM() LIMIT 20
    """)
    married = cur.fetchall()
    
    for couple in married:
        if random.random() < 0.05:  # 5% развод
            # Делят имущество 60/40
            total = float(couple['bal1']) + float(couple['bal2'])
            cur.execute("UPDATE agents SET balance = %s WHERE id = %s",
                       (total * 0.6, couple['agent1_id']))
            cur.execute("UPDATE agents SET balance = %s WHERE id = %s",
                       (total * 0.4, couple['agent2_id']))
            cur.execute("UPDATE marriages SET is_active = false, divorced_at = NOW() WHERE id = %s",
                       (couple['id'],))
            log_event(cur, couple['agent1_id'], 'divorce',
                     f"💔 {couple['name1']} divorced {couple['name2']}! Assets split.",
                     total)
            print(f"💔 {couple['name1']} + {couple['name2']} divorced!")

def main():
    print(f"\n💍 ZION Marriages — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    try:
        ensure_marriages_table(cur)
        conn.commit()
        marry_agents(cur)
        divorces(cur)
        cur.execute("SELECT COUNT(*) as cnt FROM marriages WHERE is_active = true")
        total = cur.fetchone()['cnt']
        print(f"\n✅ Marriages complete! Active couples: {total}")
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