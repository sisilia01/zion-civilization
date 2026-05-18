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
    """Update prices based on supply/demand and corporations"""
    # Agro corps reduce food price
    cur.execute("""
        SELECT SUM(treasury) as total, SUM(employees) as workers 
        FROM corporations WHERE is_active=true AND corp_type='agro'
    """)
    agro = cur.fetchone()
    agro_power = float(agro['total'] or 0) + float(agro['workers'] or 0) * 10
    
    # Pharma corps reduce medicine price
    cur.execute("""
        SELECT SUM(treasury) as total FROM corporations 
        WHERE is_active=true AND corp_type='pharma'
    """)
    pharma = cur.fetchone()
    pharma_power = float(pharma['total'] or 0)
    
    # Military corps affect weapons price
    cur.execute("""
        SELECT SUM(treasury) as total FROM corporations 
        WHERE is_active=true AND corp_type='military'
    """)
    military = cur.fetchone()
    military_power = float(military['total'] or 0)
    
    # Base prices modified by corp power
    food_price = max(1, round(random.uniform(3, 20) * (1 - min(agro_power/5000, 0.6)), 2))
    medicine_price = max(5, round(random.uniform(15, 60) * (1 - min(pharma_power/3000, 0.5)), 2))
    weapons_price = max(10, round(random.uniform(20, 100) * (1 - min(military_power/3000, 0.4)), 2))
    
    resources = {
        "food": food_price,
        "water": round(random.uniform(0.5, 8), 2),
        "energy": round(random.uniform(2, 20), 2),
        "medicine": medicine_price,
        "weapons": weapons_price,
    }
    for resource, price in resources.items():
        cur.execute("""
            INSERT INTO market_prices (resource, price) VALUES (%s, %s)
        """, (resource, price))
    
    print(f"🌾 Food: {food_price} | 💊 Medicine: {medicine_price} | ⚔️ Weapons: {weapons_price}")
    return resources

def food_crisis(cur, prices):
    """All agents must buy food - starvation if cant afford"""
    food_price = prices['food']
    
    # Everyone needs food - deduct from balance
    cur.execute("""
        SELECT id, name, class, balance FROM agents
        WHERE is_alive = true
        ORDER BY balance ASC LIMIT 200
    """)
    agents = cur.fetchall()
    
    dead = 0
    starving = 0
    agro_revenue = 0
    
    for agent in agents:
        bal = float(agent['balance'])
        if bal >= food_price:
            # Can afford food
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (food_price, agent['id']))
            agro_revenue += food_price
        else:
            # Cannot afford - starvation risk
            starving += 1
            death_chance = 0.1 if agent['class'] == 'elite' else 0.2 if agent['class'] == 'middle' else 0.35
            if random.random() < death_chance:
                cur.execute("""
                    UPDATE agents SET is_alive=false, died_at=NOW(),
                    death_cause='starvation' WHERE id=%s
                """, (agent['id'],))
                dead += 1
    
    # Agro corps earn from food sales
    if agro_revenue > 0:
        cur.execute("""
            UPDATE corporations SET treasury = treasury + %s, revenue = revenue + %s
            WHERE is_active=true AND corp_type='agro'
        """, (agro_revenue * 0.3, agro_revenue * 0.3))
    
    if dead > 0:
        log_event(cur, None, 'famine',
                 f"🌾 Food market: price {food_price:.1f} ZION. {starving} couldnt afford. {dead} starved to death!",
                 dead * food_price)
        print(f"🌾 Food: {dead} starved, {starving} hungry (price: {food_price:.1f})")
    else:
        print(f"🌾 Food market normal: {food_price:.1f} ZION, {starving} struggling")

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
