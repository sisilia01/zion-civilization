#!/usr/bin/env python3
"""
ZION Market — рынок ресурсов
Еда, вода, энергия — цены меняются, голод убивает бедных
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

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def ensure_market_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS market_prices (
            id SERIAL PRIMARY KEY,
            resource VARCHAR(50),
            price NUMERIC(10,2),
            recorded_at TIMESTAMP DEFAULT NOW()
        )
    """)

def update_prices(cur):
    """Обновляем цены на ресурсы"""
    resources = {
        "food": random.uniform(1, 15),
        "water": random.uniform(0.5, 8),
        "energy": random.uniform(2, 20),
        "medicine": random.uniform(10, 50),
        "weapons": random.uniform(20, 100),
    }
    for resource, price in resources.items():
        cur.execute("""
            INSERT INTO market_prices (resource, price) VALUES (%s, %s)
        """, (resource, round(price, 2)))
    return resources

def food_crisis(cur, prices):
    """Голод убивает бедных если еда дорогая"""
    if prices['food'] < 10:
        print(f"🌾 Food price normal: {prices['food']:.1f} ZION")
        return
    
    # Еда дорогая — бедные голодают
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class IN ('poor', 'critical')
        AND balance < %s
        ORDER BY RANDOM() LIMIT 30
    """, (prices['food'],))
    starving = cur.fetchall()
    
    dead = 0
    for agent in starving:
        if random.random() < 0.3:
            cur.execute("""
                UPDATE agents SET is_alive = false, died_at = NOW(),
                death_cause = 'starvation' WHERE id = %s
            """, (agent['id'],))
            dead += 1
    
    if dead > 0:
        log_event(cur, None, 'famine',
                 f"🌾 Food Crisis! Price: {prices['food']:.1f} ZION. {dead} agents died of starvation!",
                 dead * prices['food'])
        print(f"🌾 Famine: {dead} dead (food price: {prices['food']:.1f} ZION)")

def trade_resources(cur, prices):
    """Богатые торгуют ресурсами и зарабатывают"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'elite' AND balance > 100
        ORDER BY RANDOM() LIMIT 5
    """)
    traders = cur.fetchall()
    
    for trader in traders:
        profit = round(random.uniform(5, 30), 2)
        cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                   (profit, trader['id']))
        log_event(cur, trader['id'], 'trade',
                 f"📦 {trader['name']} traded resources on the market. Profit: {profit:.1f} ZION",
                 profit)
        print(f"📦 {trader['name']} traded — profit {profit:.1f} ZION")

def main():
    print(f"\n📦 ZION Market — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    try:
        ensure_market_table(cur)
        conn.commit()
        prices = update_prices(cur)
        print(f"Prices: food={prices['food']:.1f} water={prices['water']:.1f} energy={prices['energy']:.1f}")
        food_crisis(cur, prices)
        trade_resources(cur, prices)
        print(f"\n✅ Market cycle complete!")
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
