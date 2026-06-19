import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password=os.environ.get("DB_PASSWORD", "")
)

def create_tables():
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS nft_legends (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            agent_name VARCHAR(50) NOT NULL,
            class VARCHAR(20) NOT NULL,
            age_days INTEGER NOT NULL,
            death_cause VARCHAR(100),
            max_balance DECIMAL(20,2),
            rarity VARCHAR(20) NOT NULL,
            minted_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lottery_tickets (
            id SERIAL PRIMARY KEY,
            holder_address VARCHAR(100) NOT NULL,
            agent_name VARCHAR(50),
            tickets INTEGER DEFAULT 1,
            rarity VARCHAR(20) DEFAULT 'common',
            purchased_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lottery_draws (
            id SERIAL PRIMARY KEY,
            winner_address VARCHAR(100),
            prize_zion DECIMAL(20,2),
            total_tickets INTEGER,
            drawn_at TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()
    cur.close()

def mint_legend(agent_id):
    cur = conn.cursor()
    
    cur.execute("""
        SELECT name, class, age_days, death_cause, balance
        FROM agents WHERE id = %s
    """, (agent_id,))
    agent = cur.fetchone()
    
    if not agent:
        return
    
    name, cls, age_days, death_cause, balance = agent
    
    # Determine rarity
    if age_days > 40:
        rarity = "legendary"
    elif age_days > 25:
        rarity = "epic"
    elif age_days > 15:
        rarity = "rare"
    else:
        rarity = "common"
    
    cur.execute("""
        INSERT INTO nft_legends (agent_id, agent_name, class, age_days, death_cause, max_balance, rarity)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (agent_id, name, cls, age_days, death_cause, balance, rarity))
    
    nft_id = cur.fetchone()[0]
    
    print(f"🏆 NFT Legend minted! {name} ({cls})")
    print(f"   Age: {age_days} days | Rarity: {rarity.upper()}")
    print(f"   Death: {death_cause or 'still alive'}")
    
    conn.commit()
    cur.close()
    return nft_id

def run_lottery():
    cur = conn.cursor()
    
    print(f"\n🎰 ZION Lottery - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Collect prize pool from alive agents (1% of balance)
    cur.execute("SELECT id, name, balance FROM agents WHERE is_alive = TRUE AND balance > 10")
    agents = cur.fetchall()
    
    prize_pool = 0
    participants = []
    
    for agent_id, name, balance in agents:
        if random.random() > 0.30:
            continue
        
        ticket_cost = float(balance) * 0.01
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (ticket_cost, agent_id))
        
        prize_pool += ticket_cost
        participants.append((agent_id, name, ticket_cost))
        
        # Determine ticket rarity
        if ticket_cost > 5:
            rarity = "rare"
            tickets = 3
        elif ticket_cost > 2:
            rarity = "uncommon"
            tickets = 2
        else:
            rarity = "common"
            tickets = 1
        
        print(f"🎫 {name} bought {tickets} ticket(s) ({ticket_cost:.2f} ZION)")
    
    if not participants:
        print("No participants this round!")
        conn.commit()
        cur.close()
        return
    
    # Draw winner (weighted by tickets)
    weights = [p[2] for p in participants]
    winner = random.choices(participants, weights=weights, k=1)[0]
    winner_id, winner_name, _ = winner
    
    # Winner gets 99% of prize pool (1% treasury)
    prize = prize_pool * 0.99
    cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
               (prize, winner_id))
    
    cur.execute("""
        INSERT INTO lottery_draws (winner_address, prize_zion, total_tickets)
        VALUES (%s, %s, %s)
    """, (winner_name, prize, len(participants)))
    
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, 'lottery', %s, %s)
    """, (winner_id, f"{winner_name} won the ZION lottery!", prize))
    
    print(f"\n🏆 LOTTERY WINNER: {winner_name}!")
    print(f"   Prize: {prize:.2f} ZION")
    print(f"   Participants: {len(participants)}")
    print(f"✅ Lottery complete!\n")
    
    conn.commit()
    cur.close()

def mint_dead_legends():
    cur = conn.cursor()
    
    # Mint NFTs for recently dead agents not yet minted
    cur.execute("""
        SELECT a.id FROM agents a
        LEFT JOIN nft_legends n ON a.id = n.agent_id
        WHERE a.is_alive = FALSE AND n.id IS NULL
        AND a.age_days > 5
    """)
    dead_agents = cur.fetchall()
    
    cur.close()
    
    for (agent_id,) in dead_agents:
        mint_legend(agent_id)

if __name__ == "__main__":
    create_tables()
    mint_dead_legends()
    run_lottery()