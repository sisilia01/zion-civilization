import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
import psycopg2
import random
from datetime import datetime

from zion_bet_config import PACKAGE_ID, BET_HOUSE, BET_ADMIN_CAP

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password=os.environ.get("DB_PASSWORD", "")
)

BET_EVENTS = [
    {"question": "Will a catastrophe hit today?", "type": "catastrophe"},
    {"question": "Will the richest agent survive the week?", "type": "survival"},
    {"question": "Will a clan war happen today?", "type": "clan_war"},
    {"question": "Will more than 2 agents die today?", "type": "deaths"},
    {"question": "Will a new agent be born today?", "type": "birth"},
    {"question": "Will the prophet earn more than 5 ZION?", "type": "prophet"},
    {"question": "Will a rebellion happen this week?", "type": "rebellion"},
]

def create_table():
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bets (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            event_type VARCHAR(50) NOT NULL,
            question TEXT NOT NULL,
            amount DECIMAL(20,2) NOT NULL,
            prediction BOOLEAN NOT NULL,
            outcome BOOLEAN DEFAULT NULL,
            settled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            settled_at TIMESTAMP DEFAULT NULL
        )
    """)
    conn.commit()
    cur.close()

def place_bets():
    cur = conn.cursor()
    
    print(f"\n🎰 ZionBet - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Get agents with enough balance
    cur.execute("""
        SELECT id, name, balance FROM agents 
        WHERE is_alive = TRUE AND balance > 5
        ORDER BY RANDOM() LIMIT 8
    """)
    agents = cur.fetchall()
    
    bets_placed = 0
    
    for agent_id, name, balance in agents:
        if random.random() > 0.30:
            continue
        
        balance = float(balance)
        bet_amount = round(balance * random.uniform(0.05, 0.15), 2)
        
        if bet_amount < 1:
            continue
        
        event = random.choice(BET_EVENTS)
        prediction = random.choice([True, False])
        pred_str = "YES" if prediction else "NO"
        
        cur.execute("""
            INSERT INTO bets (agent_id, event_type, question, amount, prediction)
            VALUES (%s, %s, %s, %s, %s)
        """, (agent_id, event['type'], event['question'], bet_amount, prediction))
        
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (bet_amount, agent_id))
        
        print(f"🎲 {name} bets {bet_amount:.2f} ZION → {pred_str}: '{event['question']}'")
        bets_placed += 1
    
    conn.commit()
    print(f"\n📊 Total bets placed: {bets_placed}")
    cur.close()

def settle_bets():
    cur = conn.cursor()
    
    # Get unsettled bets
    cur.execute("""
        SELECT b.id, b.agent_id, a.name, b.amount, b.prediction, b.event_type
        FROM bets b JOIN agents a ON b.agent_id = a.id
        WHERE b.settled = FALSE AND b.created_at < NOW() - INTERVAL '1 minute'
        LIMIT 10
    """)
    unsettled = cur.fetchall()
    
    if not unsettled:
        return
    
    print(f"\n⚖️  Settling {len(unsettled)} bets...")
    
    for bet_id, agent_id, name, amount, prediction, event_type in unsettled:
        # Random outcome for now (will connect to real events later)
        outcome = random.choice([True, False])
        amount = float(amount)
        
        if prediction == outcome:
            winnings = round(amount * 1.98, 2)
            from civ_common import zrs_deduct_reserve
            if zrs_deduct_reserve(cur, winnings):
                cur.execute(
                    "UPDATE agents SET balance = balance + %s WHERE id = %s",
                    (winnings, agent_id),
                )
            else:
                winnings = 0
            print(f"  🏆 {name} WON! +{winnings:.2f} ZION")
        else:
            from civ_common import zrs_add_reserve
            zrs_add_reserve(cur, amount)
            print(f"  ❌ {name} LOST {amount:.2f} ZION")
        
        cur.execute("""
            UPDATE bets SET settled = TRUE, outcome = %s, settled_at = NOW()
            WHERE id = %s
        """, (outcome, bet_id))
    
    conn.commit()
    cur.close()

if __name__ == "__main__":
    create_table()
    place_bets()
    settle_bets()