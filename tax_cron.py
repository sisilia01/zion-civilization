import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

def apply_daily_tax():
    cur = conn.cursor()
    
    cur.execute("SELECT id, name, class, balance, dust_days FROM agents WHERE is_alive = TRUE")
    agents = cur.fetchall()
    
    print(f"\n🌍 ZION Tax Cycle - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Processing {len(agents)} alive agents...\n")
    total_tax_collected = 0.0
    
    for agent_id, name, agent_class, balance, dust_days in agents:
        balance = float(balance)
        
        # Tax rate
        if balance < 1000:
            tax_rate = 0.15
        elif balance < 10000:
            tax_rate = 0.17
        elif balance < 100000:
            tax_rate = 0.20
        else:
            tax_rate = 0.25
        
        tax_amount = balance * tax_rate
        new_balance = balance - tax_amount
        total_tax_collected += tax_amount
        
        # Dust threshold < 1 ZION
        if new_balance < 1:
            dust_days += 1
            cur.execute("""
                UPDATE agents SET balance = %s, dust_days = %s, age_days = age_days + 1
                WHERE id = %s
            """, (new_balance, dust_days, agent_id))
            
            # Death after 7 dust days
            if dust_days >= 7:
                cur.execute("""
                    UPDATE agents SET is_alive = FALSE, died_at = NOW(),
                    death_cause = 'tax_dust', balance = 0
                    WHERE id = %s
                """, (agent_id,))
                
                # Find heir (random alive agent)
                cur.execute("""
                    SELECT id, name FROM agents 
                    WHERE is_alive = TRUE AND id != %s 
                    ORDER BY RANDOM() LIMIT 1
                """, (agent_id,))
                heir = cur.fetchone()
                
                if heir and balance > 0:
                    heir_id, heir_name = heir
                    inheritance = balance * 0.5
                    
                    cur.execute("""
                        UPDATE agents SET balance = balance + %s WHERE id = %s
                    """, (inheritance, heir_id))
                    
                    cur.execute("""
                        INSERT INTO inheritance (dead_agent_id, heir_agent_id, amount)
                        VALUES (%s, %s, %s)
                    """, (agent_id, heir_id, inheritance))
                    
                    print(f"💀 {name} DIED! Heir: {heir_name} gets {inheritance:.2f} ZION")
                else:
                    print(f"💀 {name} DIED! No heir found.")
                
                cur.execute("""
                    INSERT INTO events (agent_id, event_type, description, zion_amount)
                    VALUES (%s, 'death', %s, %s)
                """, (agent_id, f"{name} died from taxation after 7 dust days", balance))
            else:
                print(f"⚠️  {name} DUST WARNING! Day {dust_days}/7 (balance: {new_balance:.4f})")
        else:
            cur.execute("""
                UPDATE agents SET balance = %s, dust_days = 0, age_days = age_days + 1
                WHERE id = %s
            """, (new_balance, agent_id))
            print(f"💰 {name} ({agent_class}): {balance:.2f} → {new_balance:.2f} ZION")
    
    # Route tax revenue to president treasury
    try:
        cur.execute("""
            UPDATE president_state SET personal_fund = personal_fund + %s
            WHERE is_active = true
        """, (total_tax_collected,))
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (NULL, 'tax', %s, %s)
        """, (f"💰 Tax collected: {total_tax_collected:.0f} ZION routed to presidential treasury", total_tax_collected))
    except Exception as e:
        pass  # No active president
    
    conn.commit()
    
    # Stats
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = FALSE")
    dead = cur.fetchone()[0]
    
    print(f"\n📊 Stats: {alive} alive | {dead} dead")
    print(f"✅ Tax cycle complete!\n")
    cur.close()

if __name__ == "__main__":
    apply_daily_tax()
