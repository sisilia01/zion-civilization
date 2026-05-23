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
    """10% chance of epidemic"""
    if random.random() > 0.10:
        print("No epidemic this cycle")
        return
    
    disease_name, spread_rate, death_rate = random.choice(DISEASES)
    infected_count = random.randint(20, 100)
    
    # Check pharma corps - they reduce death rate
    cur.execute("""
        SELECT SUM(treasury) as total FROM corporations 
        WHERE is_active=true AND corp_type='pharma'
    """)
    pharma = cur.fetchone()
    pharma_treasury = float(pharma['total'] or 0)
    if pharma_treasury > 500:
        death_rate *= 0.6  # Pharma reduces deaths 40%
        # Pharma earns revenue from epidemic
        pharma_bonus = round(infected_count * 2.0, 2)
        from civ_common import zrs_deduct_reserve
        if pharma_bonus > 0 and zrs_deduct_reserve(cur, pharma_bonus):
            cur.execute(
                """
                UPDATE corporations SET treasury = treasury + %s, revenue = revenue + %s
                WHERE is_active=true AND corp_type='pharma'
                """,
                (pharma_bonus, pharma_bonus),
            )
            print(f"💊 Pharma corps profit from epidemic: +{pharma_bonus:.0f} ZION (ZRS-backed)")
    
    # Check if president funded healthcare
    cur.execute("SELECT police_fund FROM president_state WHERE is_active=true LIMIT 1")
    pres = cur.fetchone()
    if pres and float(pres['police_fund']) > 200:
        death_rate *= 0.8  # Healthcare funding reduces deaths 20%
    
    cur.execute("""
        SELECT id, name, class, balance FROM agents
        WHERE is_alive = true ORDER BY RANDOM() LIMIT %s
    """, (infected_count,))
    infected = cur.fetchall()
    
    dead = 0
    treated = 0
    
    # Get medicine price from market
    cur.execute("""
        SELECT price FROM market_prices WHERE resource='medicine' 
        ORDER BY recorded_at DESC LIMIT 1
    """)
    med_price_row = cur.fetchone()
    treatment_cost = float(med_price_row['price']) if med_price_row else 20.0
    
    for agent in infected:
        bal = float(agent['balance'])
        
        if bal >= treatment_cost:
            # Can afford treatment
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (treatment_cost, agent['id']))
            treated += 1
            # Revenue to pharma
            pharma_share = round(treatment_cost * 0.5, 2)
            zrs_share = round(treatment_cost - pharma_share, 2)
            cur.execute(
                """
                UPDATE corporations SET treasury = treasury + %s
                WHERE is_active=true AND corp_type='pharma'
                ORDER BY treasury DESC LIMIT 1
                """,
                (pharma_share,),
            )
            if zrs_share > 0:
                from civ_common import zrs_add_reserve
                zrs_add_reserve(cur, zrs_share)
        else:
            # Cannot afford - death based on class
            dr = death_rate * (0.3 if agent['class']=='elite' else 
                              0.5 if agent['class']=='middle' else 1.0)
            if random.random() < dr:
                from civ_common import settle_agent_death
                settle_agent_death(cur, agent["id"])
                cur.execute(
                    """
                    UPDATE agents SET is_alive=false, died_at=NOW(),
                    death_cause=%s WHERE id=%s
                    """,
                    (f"died from {disease_name}", agent["id"]),
                )
                dead += 1
    
    log_event(cur, None, 'epidemic',
             f"🦠 {disease_name} outbreak! {infected_count} infected, {dead} dead, {treated} treated (pharma: {'active' if pharma_treasury>500 else 'none'})",
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
