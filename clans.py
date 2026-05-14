import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

def join_clans():
    cur = conn.cursor()
    
    # Get agents without clan
    cur.execute("""
        SELECT id, name, class, balance, charisma 
        FROM agents 
        WHERE is_alive = TRUE AND clan_id IS NULL AND class != 'poor'
    """)
    agents = cur.fetchall()
    
    # Get available clans
    cur.execute("SELECT id, name FROM clans")
    clans = cur.fetchall()
    
    if not clans:
        print("No clans available!")
        return
    
    print(f"\n⚔️  ZION Clan Cycle - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    joins = 0
    for agent_id, name, agent_class, balance, charisma in agents:
        # 40% chance to join a clan
        if random.random() > 0.40:
            continue
        
        # Pick random clan
        clan = random.choice(clans)
        clan_id, clan_name = clan
        
        # Join clan - pay 10% of balance as dues
        dues = float(balance) * 0.10
        
        cur.execute("""
            UPDATE agents SET clan_id = %s, clan_name = %s, 
            balance = balance - %s WHERE id = %s
        """, (clan_id, clan_name, dues, agent_id))
        
        cur.execute("""
            UPDATE clans SET treasury = treasury + %s,
            members_count = members_count + 1 WHERE id = %s
        """, (dues, clan_id))
        
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'clan_join', %s, %s)
        """, (agent_id, f"{name} joined clan {clan_name}", dues))
        
        print(f"⚔️  {name} ({agent_class}) joined {clan_name} — paid {dues:.2f} ZION dues")
        joins += 1
    
    conn.commit()
    
    # Show clan stats
    cur.execute("SELECT name, treasury, members_count FROM clans ORDER BY treasury DESC")
    clans_stats = cur.fetchall()
    
    print(f"\n📊 Clan Stats:")
    for clan_name, treasury, members in clans_stats:
        print(f"  🏰 {clan_name}: {members} members | {float(treasury):.2f} ZION treasury")
    
    print(f"\n✅ {joins} agents joined clans!")
    cur.close()

def clan_war():
    cur = conn.cursor()
    
    # Get clans with members
    cur.execute("SELECT id, name, treasury, members_count FROM clans WHERE members_count > 0 ORDER BY RANDOM() LIMIT 2")
    clans = cur.fetchall()
    
    if len(clans) < 2:
        print("Not enough clans for war!")
        return
    
    clan1_id, clan1_name, clan1_treasury, clan1_members = clans[0]
    clan2_id, clan2_name, clan2_treasury, clan2_members = clans[1]
    
    print(f"\n⚔️  WAR: {clan1_name} vs {clan2_name}!")
    
    # Winner based on treasury + members
    clan1_power = float(clan1_treasury) + clan1_members * 10
    clan2_power = float(clan2_treasury) + clan2_members * 10
    
    if clan1_power > clan2_power:
        winner_id, winner_name = clan1_id, clan1_name
        loser_id, loser_name = clan2_id, clan2_name
        loser_treasury = float(clan2_treasury)
    else:
        winner_id, winner_name = clan2_id, clan2_name
        loser_id, loser_name = clan1_id, clan1_name
        loser_treasury = float(clan1_treasury)
    
    # Winner takes 50% of loser treasury
    loot = loser_treasury * 0.50
    
    cur.execute("UPDATE clans SET treasury = treasury + %s, wins = wins + 1 WHERE id = %s",
               (loot, winner_id))
    cur.execute("UPDATE clans SET treasury = treasury - %s, losses = losses + 1 WHERE id = %s",
               (loot, loser_id))
    
    print(f"🏆 {winner_name} WINS! Takes {loot:.2f} ZION from {loser_name}")
    
    # Log war event
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (NULL, 'clan_war', %s, %s)
    """, (f"{winner_name} defeated {loser_name} in clan war", loot))
    
    conn.commit()
    cur.close()

if __name__ == "__main__":
    join_clans()
    if random.random() > 0.70:  # 30% chance of war
        clan_war()
