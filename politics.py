import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

def run_elections():
    cur = conn.cursor()
    
    print(f"\n🏛️  ZION Politics - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Get candidates (top charisma agents)
    cur.execute("""
        SELECT id, name, class, balance, charisma, clan_name
        FROM agents WHERE is_alive = TRUE
        ORDER BY charisma DESC LIMIT 5
    """)
    candidates = cur.fetchall()
    
    if len(candidates) < 2:
        print("Not enough candidates for election!")
        return
    
    print(f"\n🗳️  ELECTION DAY! Candidates:")
    for i, (aid, name, cls, bal, charisma, clan) in enumerate(candidates):
        clan_str = f"[{clan}]" if clan else "[No clan]"
        print(f"  {i+1}. {name} ({cls}) {clan_str} - Charisma: {charisma}")
    
    # All agents vote
    cur.execute("SELECT id, name, charisma FROM agents WHERE is_alive = TRUE")
    voters = cur.fetchall()
    
    votes = {c[0]: 0 for c in candidates}
    
    for voter_id, voter_name, voter_charisma in voters:
        # Vote based on charisma + random factor
        weights = []
        for cand_id, cand_name, cls, bal, charisma, clan in candidates:
            weight = charisma + random.randint(0, 50)
            weights.append(weight)
        
        total = sum(weights)
        r = random.uniform(0, total)
        cumulative = 0
        for i, (cand_id, *_) in enumerate(candidates):
            cumulative += weights[i]
            if r <= cumulative:
                votes[cand_id] = votes.get(cand_id, 0) + 1
                break
    
    # Find winner
    winner_id = max(votes, key=votes.get)
    winner = next(c for c in candidates if c[0] == winner_id)
    winner_name = winner[1]
    winner_votes = votes[winner_id]
    
    print(f"\n📊 Vote Results:")
    for cand_id, name, *_ in candidates:
        print(f"  {name}: {votes.get(cand_id, 0)} votes")
    
    print(f"\n🏆 {winner_name} WINS THE ELECTION!")
    print(f"   Total votes: {winner_votes}/{len(voters)}")
    
    # Winner gets 2% tax bonus
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, 'election', %s, 0)
    """, (winner_id, f"{winner_name} won the ZION Senate election with {winner_votes} votes"))
    
    # Winner gets reward
    reward = 10.0
    cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
               (reward, winner_id))
    
    print(f"   Reward: +{reward} ZION to {winner_name}")
    
    conn.commit()
    
    # Check for rebellion
    run_rebellion(cur, candidates, winner_name)
    
    conn.commit()
    cur.close()

def run_rebellion(cur, candidates, winner_name):
    # Check if rebellion possible (10% of population angry)
    cur.execute("""
        SELECT COUNT(*) FROM agents 
        WHERE is_alive = TRUE AND balance < 5 AND charisma > 50
    """)
    angry_count = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = TRUE")
    total = cur.fetchone()[0]
    
    if total == 0:
        return
    
    rebellion_pct = angry_count / total
    
    if rebellion_pct >= 0.10 and random.random() < 0.40:
        print(f"\n⚠️  REBELLION! {angry_count} angry agents rise up!")
        
        # Rebellion damages rich agents
        cur.execute("""
            SELECT id, name, balance FROM agents 
            WHERE is_alive = TRUE AND balance > 50
            ORDER BY balance DESC LIMIT 5
        """)
        rich_agents = cur.fetchall()
        
        for agent_id, name, balance in rich_agents:
            damage = float(balance) * 0.15
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (damage, agent_id))
            print(f"  🔥 {name} loses {damage:.2f} ZION to rebels!")
        
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (NULL, 'rebellion', %s, 0)
        """, (f"Rebellion! {angry_count} agents ({rebellion_pct*100:.0f}%) rose up",))
        
        print(f"✊ Rebellion complete!")
    else:
        print(f"\n☮️  No rebellion today ({angry_count} angry agents = {rebellion_pct*100:.0f}%)")

if __name__ == "__main__":
    # 30% chance of election each cycle
    if random.random() < 0.30:
        run_elections()
    else:
        print(f"\n🏛️  No election today - Senate is stable")
