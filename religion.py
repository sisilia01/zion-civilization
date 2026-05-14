import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

PROPHECIES = [
    "The rich shall fall. The poor shall inherit the ruins.",
    "Death comes for all. Pay your taxes or meet it sooner.",
    "Your clan is weak. Change sides before the storm.",
    "A great catastrophe approaches. Pray harder.",
    "The one who hoards most shall lose it all in one night.",
    "Balance is an illusion. Power is everything.",
    "NEO watches. NEO judges. NEO acts.",
    "Three shall die tomorrow. None of them are ready.",
    "Your children will outlive you. Barely.",
    "The volcano does not care about your prayers.",
]

def run_prayer_cycle():
    cur = conn.cursor()
    
    # Find the prophet (highest charisma alive agent)
    cur.execute("""
        SELECT id, name, balance, charisma FROM agents 
        WHERE is_alive = TRUE ORDER BY charisma DESC LIMIT 1
    """)
    prophet = cur.fetchone()
    
    if not prophet:
        print("No prophet found!")
        return
    
    prophet_id, prophet_name, prophet_balance, prophet_charisma = prophet
    
    print(f"\n🙏 ZION Religion Cycle - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"⚡ Prophet: {prophet_name} (charisma: {prophet_charisma})\n")
    
    # Random agents pray (20% chance each)
    cur.execute("SELECT id, name, balance FROM agents WHERE is_alive = TRUE AND id != %s", 
               (prophet_id,))
    agents = cur.fetchall()
    
    total_offerings = 0
    prayers = 0
    
    for agent_id, name, balance in agents:
        if random.random() > 0.20:
            continue
        
        balance = float(balance)
        if balance < 2:
            continue
        
        # Pay 2 ZION for prayer
        offering = 2.0
        
        # Distribute: 1 ZION to prophet, 0.5 to treasury, 0.5 burned
        prophet_share = 1.0
        
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (offering, agent_id))
        cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                   (prophet_share, prophet_id))
        
        # Random prophecy response
        prophecy = random.choice(PROPHECIES)
        
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'prayer', %s, %s)
        """, (agent_id, f"{name} prayed. Prophet {prophet_name} said: '{prophecy}'", offering))
        
        print(f"🙏 {name} prayed (paid 2 ZION)")
        print(f"   Prophet {prophet_name}: \"{prophecy}\"\n")
        
        total_offerings += offering
        prayers += 1
    
    conn.commit()
    
    # Update prophet balance display
    cur.execute("SELECT balance FROM agents WHERE id = %s", (prophet_id,))
    new_prophet_balance = cur.fetchone()[0]
    
    print(f"📊 Prayers: {prayers} | Prophet earned: {prayers:.0f} ZION")
    print(f"⚡ Prophet {prophet_name} balance: {float(new_prophet_balance):.2f} ZION")
    print(f"✅ Religion cycle complete!\n")
    cur.close()

if __name__ == "__main__":
    run_prayer_cycle()
