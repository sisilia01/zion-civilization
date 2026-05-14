import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

NAMES_ELITE = ["Kael", "Raze", "Dorn", "Vex", "Zorn", "Axel", "Drake", "Cain"]
NAMES_MIDDLE = ["Vess", "Olan", "Mire", "Sera", "Lena", "Orin", "Tara", "Bram"]
NAMES_POOR = ["Ash", "Grim", "Mox", "Finn", "Pip", "Wick", "Bex", "Cob"]

# Match genesis.py so births are "First Surname", not single-token names (avoids "Samira B" style tags).
SURNAMES_ELITE = [
    "Voltaire", "Blackwood", "Sterling", "Ashford", "Ravenswood", "Coldwell", "Stormborn", "Ironside",
    "Goldstein", "Castellan", "Drakon", "Vexlar", "Thornton", "Whitmore", "Blackstone",
]
SURNAMES_MIDDLE = [
    "Parker", "Loginov", "Kapoor", "Tanaka", "Santos", "Mueller", "Okafor", "Nguyen",
    "Petrov", "Garcia", "Yamamoto", "Kowalski", "Mbeki", "Rossi", "Diallo",
]
SURNAMES_POOR = [
    "Gray", "Stone", "Marsh", "Field", "Brook", "Wood", "Hill", "Cross",
    "Banks", "Reed", "Mills", "Ford", "Lane", "West", "Nash",
]


def unique_child_name(cur, first: str, surnames: list) -> str:
    """First + random surname; if taken, retry then append a numeric suffix (same idea as genesis)."""
    for _ in range(120):
        name = f"{first} {random.choice(surnames)}"
        cur.execute("SELECT 1 FROM agents WHERE name = %s LIMIT 1", (name,))
        if not cur.fetchone():
            return name
    base = f"{first} {random.choice(surnames)}"
    n = 2
    while n < 999999:
        candidate = f"{base} {n}"
        cur.execute("SELECT 1 FROM agents WHERE name = %s LIMIT 1", (candidate,))
        if not cur.fetchone():
            return candidate
        n += 1
    return f"{base} {random.randint(1000000, 9999999)}"


def can_reproduce(balance, agent_class, base_balance):
    """Check if agent can reproduce based on balance"""
    if agent_class == "poor":
        # Social mobility - poor can reproduce if rich enough
        return balance > 1.2 * base_balance
    elif agent_class == "middle":
        return balance > 1.2 * base_balance
    elif agent_class == "elite":
        return balance > 12.0 * base_balance
    return False

def get_child_balance(parent_balance, parent_class):
    """Child gets 70% of birth cost"""
    if parent_class == "elite":
        birth_cost = 2.0 * (parent_balance / 10)
    else:
        birth_cost = 0.8 * parent_balance
    return birth_cost * 0.70

def run_birth_cycle(base_balance=50):
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, name, class, balance FROM agents 
        WHERE is_alive = TRUE AND balance > 0
        ORDER BY balance DESC
    """)
    agents = cur.fetchall()
    
    print(f"\n👶 ZION Birth Cycle - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    births = 0
    for agent_id, name, agent_class, balance in agents:
        balance = float(balance)
        
        if not can_reproduce(balance, agent_class, base_balance):
            continue
        
        # 30% chance to reproduce each cycle
        if random.random() > 0.30:
            continue
        
        # Get child balance
        child_balance = get_child_balance(balance, agent_class)
        
        # Deduct birth cost from parent
        birth_cost = child_balance / 0.70
        new_parent_balance = balance - birth_cost
        
        # Pick child name and class (full name with surname, aligned with genesis.py)
        if agent_class == "elite":
            child_class = random.choice(["elite", "middle"])
            child_first = random.choice(NAMES_ELITE)
            surnames = SURNAMES_ELITE if child_class == "elite" else SURNAMES_MIDDLE
        else:
            child_class = agent_class
            child_first = random.choice(NAMES_MIDDLE if agent_class == "middle" else NAMES_POOR)
            surnames = SURNAMES_MIDDLE if agent_class == "middle" else SURNAMES_POOR
        child_name = unique_child_name(cur, child_first, surnames)
        
        # Create child
        cur.execute("""
            INSERT INTO agents (name, class, balance, parent_id, charisma, aggression, faith, ambition, loyalty)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 50)
        """, (
            child_name, child_class, child_balance, agent_id,
            random.randint(30, 80),
            random.randint(20, 80),
            random.randint(20, 80),
            random.randint(30, 90)
        ))
        
        # Update parent balance
        cur.execute("UPDATE agents SET balance = %s WHERE id = %s", 
                   (new_parent_balance, agent_id))
        
        # Log event
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'birth', %s, %s)
        """, (agent_id, f"{name} gave birth to {child_name}", child_balance))
        
        print(f"👶 {name} ({agent_class}) → {child_name} ({child_class}) born with {child_balance:.2f} ZION")
        births += 1
    
    conn.commit()
    
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()[0]
    
    print(f"\n📊 Births this cycle: {births} | Total alive: {alive}")
    print("✅ Birth cycle complete!\n")
    cur.close()

if __name__ == "__main__":
    run_birth_cycle(base_balance=10)
