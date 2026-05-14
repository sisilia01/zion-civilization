import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

CATASTROPHES = [
    {"name": "Great Plague", "type": "plague", "damage": 0.30, "emoji": "🦠"},
    {"name": "Volcano Eruption", "type": "volcano", "damage": 0.40, "emoji": "🌋"},
    {"name": "Great Famine", "type": "famine", "damage": 0.25, "emoji": "🌾"},
    {"name": "Tax Storm", "type": "tax", "damage": 0.50, "emoji": "⚡"},
    {"name": "Earthquake", "type": "earthquake", "damage": 0.35, "emoji": "🌍"},
    {"name": "Solar Flare", "type": "solar", "damage": 0.20, "emoji": "☀️"},
    {"name": "Great Flood", "type": "flood", "damage": 0.45, "emoji": "🌊"},
    {"name": "Meteor Strike", "type": "meteor", "damage": 0.60, "emoji": "☄️"},
    {"name": "Ice Age", "type": "ice", "damage": 0.30, "emoji": "❄️"},
    {"name": "Dragon Attack", "type": "dragon", "damage": 0.55, "emoji": "🐉"},
    {"name": "Black Death", "type": "death", "damage": 0.45, "emoji": "💀"},
    {"name": "Civil War", "type": "war", "damage": 0.35, "emoji": "⚔️"},
    {"name": "Corruption Wave", "type": "corruption", "damage": 0.20, "emoji": "🦹"},
    {"name": "Divine Wrath", "type": "divine", "damage": 0.50, "emoji": "⚡"},
    {"name": "Demon Invasion", "type": "demon", "damage": 0.65, "emoji": "👹"},
]

BLESSINGS = [
    {"name": "Golden Rain", "bonus": 0.30, "emoji": "💰"},
    {"name": "Divine Blessing", "bonus": 0.25, "emoji": "✨"},
    {"name": "Great Harvest", "bonus": 0.20, "emoji": "🌾"},
    {"name": "Trade Boom", "bonus": 0.35, "emoji": "📈"},
    {"name": "Ancient Discovery", "bonus": 0.40, "emoji": "🏺"},
]

def run_catastrophe():
    cur = conn.cursor()
    
    # 20% chance of catastrophe each cycle
    if random.random() > 0.20:
        print(f"\n☀️  No catastrophe today - civilization is safe!")
        return
    
    # 30% chance of blessing instead
    if random.random() < 0.30:
        blessing = random.choice(BLESSINGS)
        
        # Affect random 30-60% of agents
        cur.execute("SELECT id, name, balance FROM agents WHERE is_alive = TRUE")
        agents = cur.fetchall()
        affected = random.sample(agents, max(1, int(len(agents) * random.uniform(0.3, 0.6))))
        
        print(f"\n{blessing['emoji']} BLESSING: {blessing['name']}!")
        
        for agent_id, name, balance in affected:
            bonus = float(balance) * blessing['bonus']
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                       (bonus, agent_id))
            print(f"  ✨ {name} receives {bonus:.2f} ZION bonus!")
        
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (NULL, 'blessing', %s, 0)
        """, (f"Blessing: {blessing['name']} affected {len(affected)} agents",))
        
        conn.commit()
        cur.close()
        return
    
    # Catastrophe!
    cat = random.choice(CATASTROPHES)
    
    cur.execute("SELECT id, name, balance FROM agents WHERE is_alive = TRUE")
    agents = cur.fetchall()
    
    # Affect 40-80% of agents
    affected_pct = random.uniform(0.4, 0.8)
    affected = random.sample(agents, max(1, int(len(agents) * affected_pct)))
    
    print(f"\n{cat['emoji']} CATASTROPHE: {cat['name']}!")
    print(f"Affecting {len(affected)} out of {len(agents)} agents...\n")
    
    deaths = 0
    for agent_id, name, balance in affected:
        damage = float(balance) * cat['damage']
        new_balance = float(balance) - damage
        
        if new_balance < 1:
            cur.execute("""
                UPDATE agents SET balance = 0, is_alive = FALSE,
                died_at = NOW(), death_cause = %s WHERE id = %s
            """, (cat['type'], agent_id))
            print(f"  💀 {name} DIED in {cat['name']}!")
            deaths += 1
        else:
            cur.execute("UPDATE agents SET balance = %s WHERE id = %s",
                       (new_balance, agent_id))
            print(f"  {cat['emoji']} {name}: {float(balance):.2f} → {new_balance:.2f} ZION")
    
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (NULL, 'catastrophe', %s, 0)
    """, (f"Catastrophe: {cat['name']} killed {deaths} agents",))
    
    conn.commit()
    
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()[0]
    
    print(f"\n📊 Deaths: {deaths} | Alive: {alive}")
    print(f"✅ Catastrophe cycle complete!")
    cur.close()

if __name__ == "__main__":
    run_catastrophe()
