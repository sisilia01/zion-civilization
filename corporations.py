#!/usr/bin/env python3
"""
ZION Corporations — бизнес в цивилизации
Агенты создают корпорации, нанимают работников, платят зарплату
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

CORP_NAMES = [
    "ZionTech", "NeoCore Industries", "Vault Systems", "ShadowTrade Co",
    "Ironclad Corp", "Golden Markets", "Crimson Industries", "Azure Dynamics",
    "Void Enterprises", "Neon Syndicate Ltd", "Prophet Holdings", "Dust Capital"
]

CORP_TYPES = ["tech", "trade", "finance", "mining", "media", "security"]

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def ensure_corporations_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS corporations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            corp_type VARCHAR(50),
            owner_id INTEGER REFERENCES agents(id),
            treasury NUMERIC(20,2) DEFAULT 0,
            employees INTEGER DEFAULT 0,
            revenue NUMERIC(20,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            founded_at TIMESTAMP DEFAULT NOW()
        )
    """)

def found_corporation(cur):
    """Богатый элитный агент основывает корпорацию"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'elite' AND balance > 200
        AND id NOT IN (SELECT owner_id FROM corporations WHERE is_active = true AND owner_id IS NOT NULL)
        ORDER BY balance DESC LIMIT 5
    """)
    founders = cur.fetchall()
    if not founders:
        return False
    
    founder = random.choice(founders)
    corp_name = random.choice(CORP_NAMES) + f" {random.randint(1,99)}"
    corp_type = random.choice(CORP_TYPES)
    investment = round(float(founder['balance']) * 0.3, 2)
    
    cur.execute("""
        INSERT INTO corporations (name, corp_type, owner_id, treasury)
        VALUES (%s, %s, %s, %s) RETURNING id
    """, (corp_name, corp_type, founder['id'], investment))
    corp_id = cur.fetchone()['id']
    
    cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
               (investment, founder['id']))
    
    log_event(cur, founder['id'], 'corporation',
             f"🏢 {founder['name']} founded {corp_name} ({corp_type})! Invested {investment:.1f} ZION",
             investment)
    print(f"🏢 {founder['name']} founded {corp_name} — invested {investment:.1f} ZION")
    return True

def hire_workers(cur):
    """Корпорации нанимают работников"""
    cur.execute("""
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND treasury > 50
        ORDER BY RANDOM() LIMIT 3
    """)
    corps = cur.fetchall()
    
    for corp in corps:
        cur.execute("""
            SELECT id, name, class FROM agents
            WHERE is_alive = true AND class IN ('middle', 'poor')
            ORDER BY RANDOM() LIMIT 3
        """)
        workers = cur.fetchall()
        
        salary = random.uniform(5, 20)
        for worker in workers:
            if float(corp['treasury']) < salary:
                break
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                       (salary, worker['id']))
            cur.execute("UPDATE corporations SET treasury = treasury - %s, employees = employees + 1 WHERE id = %s",
                       (salary, corp['id']))
            log_event(cur, worker['id'], 'corporation',
                     f"💼 {worker['name']} hired by {corp['name']}! Salary: {salary:.1f} ZION",
                     salary)
            print(f"💼 Hired {worker['name']} — salary {salary:.1f} ZION")

def generate_revenue(cur):
    """Корпорации генерируют доход"""
    cur.execute("""
        SELECT id, name, corp_type, treasury, employees FROM corporations
        WHERE is_active = true AND employees > 0
    """)
    corps = cur.fetchall()
    
    for corp in corps:
        base_revenue = float(corp['employees']) * random.uniform(2, 8)
        
        # Тип корпорации влияет на доход
        multiplier = {
            "tech": 1.5, "finance": 1.8, "trade": 1.2,
            "mining": 1.3, "media": 1.1, "security": 1.4
        }.get(corp['corp_type'], 1.0)
        
        revenue = round(base_revenue * multiplier, 2)
        cur.execute("UPDATE corporations SET treasury = treasury + %s, revenue = revenue + %s WHERE id = %s",
                   (revenue, revenue, corp['id']))
        print(f"📈 {corp['name']} revenue: +{revenue:.1f} ZION")

def bankruptcy_check(cur):
    """Банкротство корпораций с пустой казной"""
    cur.execute("""
        SELECT c.id, c.name, a.name as owner_name, a.id as owner_id
        FROM corporations c
        LEFT JOIN agents a ON c.owner_id = a.id
        WHERE c.is_active = true AND c.treasury < 5
    """)
    bankrupt = cur.fetchall()
    
    for corp in bankrupt:
        cur.execute("UPDATE corporations SET is_active = false WHERE id = %s", (corp['id'],))
        log_event(cur, corp['owner_id'], 'corporation',
                 f"💥 {corp['name']} went BANKRUPT! {corp['owner_name']} lost everything",
                 0)
        print(f"💥 {corp['name']} went bankrupt!")

def main():
    print(f"\n🏢 ZION Corporations — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        ensure_corporations_table(cur)
        conn.commit()
        
        # Проверяем сколько активных корпораций
        cur.execute("SELECT COUNT(*) as cnt FROM corporations WHERE is_active = true")
        active = cur.fetchone()['cnt']
        print(f"Active corporations: {active}")
        
        # Основываем новые если мало
        if active < 10:
            for _ in range(3):
                found_corporation(cur)
        
        generate_revenue(cur)
        hire_workers(cur)
        bankruptcy_check(cur)
        
        cur.execute("SELECT COUNT(*) as cnt FROM corporations WHERE is_active = true")
        final = cur.fetchone()['cnt']
        print(f"\n✅ Corporations cycle complete! Active: {final}")
        
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
