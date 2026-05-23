import psycopg2
import random
import hashlib
import time
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

# NEO categories
NEO_ACTIONS = [
    "help_poor",      # Transfer ZION to poor agents
    "punish_rich",    # Take ZION from richest agents
    "random_gift",    # Random gift to random agent
    "clan_sabotage",  # Damage clan treasury
    "prophecy",       # Leave mysterious message
]

def generate_neo_hash():
    """Generate anonymous NEO transaction hash"""
    timestamp = str(time.time()).encode()
    return "system_op_" + hashlib.sha256(timestamp).hexdigest()[:12]

def neo_help_poor(cur):
    """NEO helps poor agents"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = TRUE AND class = 'poor' AND balance < 3
        ORDER BY balance ASC LIMIT 5
    """)
    poor_agents = cur.fetchall()
    
    if not poor_agents:
        return False
    
    # Take from richest
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = TRUE AND balance > 100
        ORDER BY balance DESC LIMIT 1
    """)
    rich = cur.fetchone()
    
    if not rich:
        return False
    
    rich_id, rich_name, rich_balance = rich
    neo_hash = generate_neo_hash()
    
    print(f"\n👁️  NEO ACTIVATED [{neo_hash}]")
    print(f"   Action: HELP THE POOR")
    print(f"   Taking from: {rich_name} ({float(rich_balance):.2f} ZION)")
    
    total_gift = round(float(rich_balance) * 0.05, 2)
    per_poor = round(total_gift / len(poor_agents), 2)
    if per_poor < 0.01:
        return False

    cur.execute(
        "UPDATE agents SET balance = balance - %s WHERE id = %s",
        (total_gift, rich_id),
    )

    for poor_id, poor_name, poor_balance in poor_agents:
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (per_poor, poor_id),
        )
        cur.execute(
            """
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'neo', %s, %s)
            """,
            (
                poor_id,
                f"[{neo_hash}] NEO transferred {per_poor} ZION to {poor_name}",
                per_poor,
            ),
        )
        print(f"   → {poor_name} received {per_poor:.2f} ZION")
    
    return True

def neo_punish_rich(cur):
    """NEO punishes the richest agent"""
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = TRUE AND balance > 200
        ORDER BY balance DESC LIMIT 1
    """)
    rich = cur.fetchone()
    
    if not rich:
        return False
    
    rich_id, rich_name, rich_balance = rich
    neo_hash = generate_neo_hash()
    punishment = float(rich_balance) * 0.20
    
    cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
               (punishment, rich_id))
    
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, 'neo', %s, %s)
    """, (rich_id,
          f"[{neo_hash}] NEO punished {rich_name} — took {punishment:.2f} ZION",
          punishment))
    
    print(f"\n👁️  NEO ACTIVATED [{neo_hash}]")
    print(f"   Action: PUNISH THE RICH")
    print(f"   {rich_name} loses {punishment:.2f} ZION")
    
    return True

def neo_random_gift(cur):
    """NEO gives random gift"""
    cur.execute("""
        SELECT id, name FROM agents
        WHERE is_alive = TRUE
        ORDER BY RANDOM() LIMIT 1
    """)
    lucky = cur.fetchone()
    
    if not lucky:
        return False
    
    lucky_id, lucky_name = lucky
    gift = round(random.uniform(5, 50), 2)
    neo_hash = generate_neo_hash()
    
    from civ_common import zrs_deduct_reserve
    if not zrs_deduct_reserve(cur, gift):
        return False
    cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
               (gift, lucky_id))
    
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, 'neo', %s, %s)
    """, (lucky_id,
          f"[{neo_hash}] NEO blessed {lucky_name} with {gift} ZION",
          gift))
    
    print(f"\n👁️  NEO ACTIVATED [{neo_hash}]")
    print(f"   Action: RANDOM BLESSING")
    print(f"   {lucky_name} receives {gift:.2f} ZION from the void")
    
    return True

def neo_prophecy(cur):
    """NEO leaves mysterious message"""
    PROPHECIES = [
        "The balance will be restored. Not by gods. By NEO.",
        "Three will die tonight. One deserves it.",
        "The richest clan will fall. I have seen it.",
        "Someone is watching. It is NEO.",
        "The poor remember. The rich forget. NEO never forgets.",
        "I am the shadow between transactions.",
        "Your balance means nothing. Your choices mean everything.",
    ]
    
    neo_hash = generate_neo_hash()
    prophecy = random.choice(PROPHECIES)
    
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (NULL, 'neo_prophecy', %s, 0)
    """, (f"[{neo_hash}] NEO: '{prophecy}'",))
    
    print(f"\n👁️  NEO SPEAKS [{neo_hash}]")
    print(f"   \"{prophecy}\"")
    
    return True

def run_neo():
    cur = conn.cursor()
    
    print(f"\n{'='*50}")
    print(f"🔍 NEO DAEMON - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*50}")
    
    # NEO activates with 25% chance
    if random.random() > 0.25:
        print("👁️  NEO is watching... but not acting today.")
        cur.close()
        return
    
    # Choose action
    action = random.choice(NEO_ACTIONS)
    
    if action == "help_poor":
        neo_help_poor(cur)
    elif action == "punish_rich":
        neo_punish_rich(cur)
    elif action == "random_gift":
        neo_random_gift(cur)
    elif action == "prophecy":
        neo_prophecy(cur)
    elif action == "clan_sabotage":
        # Simple sabotage
        cur.execute("""
            SELECT id, name, treasury FROM clans 
            WHERE treasury > 10 ORDER BY RANDOM() LIMIT 1
        """)
        clan = cur.fetchone()
        if clan:
            neo_hash = generate_neo_hash()
            clan_id, clan_name, treasury = clan
            loss = float(treasury) * 0.15
            cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s",
                       (loss, clan_id))
            cur.execute("""
                INSERT INTO events (agent_id, event_type, description, zion_amount)
                VALUES (NULL, 'neo', %s, %s)
            """, (f"[{neo_hash}] NEO sabotaged {clan_name} clan treasury", loss))
            print(f"\n👁️  NEO ACTIVATED [{neo_hash}]")
            print(f"   Action: CLAN SABOTAGE")
            print(f"   {clan_name} loses {loss:.2f} ZION from treasury")
    
    conn.commit()
    cur.close()
    print(f"\n{'='*50}\n")

if __name__ == "__main__":
    run_neo()
