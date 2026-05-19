#!/usr/bin/env python3
"""
ZION Police System v2 — 5 divisions with dynamic sizing
SWAT / Anti-Tax / Presidential Guard / Anti-Corruption / Riot Control
"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost", database="zion_db",
    user="zion_user", password="zion2026"
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def log_event(agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def get_state():
    cur.execute("SELECT * FROM state_treasury LIMIT 1")
    return cur.fetchone()

def get_divisions():
    cur.execute("SELECT * FROM police_divisions ORDER BY id")
    return {d['division']: d for d in cur.fetchall()}

def get_sheriff():
    cur.execute("SELECT * FROM sheriff_state WHERE is_active=true LIMIT 1")
    return cur.fetchone()

def get_president():
    cur.execute("SELECT * FROM president_state WHERE is_active=true LIMIT 1")
    return cur.fetchone()

def update_division_sizes(state, divisions, sheriff, president):
    """Dynamically resize divisions based on situation"""
    
    # Get situation metrics
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive=true AND class IN ('poor','critical')")
    poor_count = cur.fetchone()['cnt']
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive=true")
    total = max(cur.fetchone()['cnt'], 1)
    poor_pct = poor_count / total * 100
    
    cur.execute("SELECT COUNT(*) as cnt, SUM(treasury) as treasury FROM clans WHERE members_count > 100")
    clan_data = cur.fetchone()
    clan_threat = min(100, int(clan_data['cnt'] or 0) * 15 + int(float(clan_data['treasury'] or 0) / 200))
    
    sheriff_type = sheriff['sheriff_type'] if sheriff else 'honest'
    is_dictator = president['is_dictator'] if president else False
    pres_approval = president['approval_rating'] if president else 50
    
    # Corruption index
    cur.execute("SELECT corruption_index FROM state_treasury LIMIT 1")
    corruption = float(cur.fetchone()['corruption_index'])
    
    police_budget = float(state['police_fund'])
    
    # Calculate ideal division sizes based on situation
    ideal = {
        'swat': max(5, int(clan_threat * 0.8)),
        'anti_tax': max(5, int(poor_pct * 0.5)),
        'presidential_guard': max(5, 30 if is_dictator else (20 if sheriff_type == 'junta' else 10)),
        'anti_corruption': max(5, int((100 - corruption) * 0.3) if sheriff_type == 'honest' else 3),
        'riot_control': max(5, int((100 - pres_approval) * 0.5)),
    }
    
    # Total officers based on budget
    total_budget_officers = int(police_budget / 8)
    total_ideal = sum(ideal.values())
    
    # Scale to budget
    if total_ideal > 0:
        scale = min(1.0, total_budget_officers / total_ideal)
    else:
        scale = 0.5
    
    for div_name, ideal_count in ideal.items():
        scaled = max(2, int(ideal_count * scale))
        div = divisions[div_name]
        
        # Gradual change - not instant
        current = div['officers']
        change = max(-5, min(5, scaled - current))
        new_count = max(2, current + change)
        
        div_budget = (new_count / max(sum(ideal.values()), 1)) * police_budget
        
        cur.execute("""
            UPDATE police_divisions 
            SET officers = %s, budget = %s, updated_at = NOW()
            WHERE division = %s
        """, (new_count, round(div_budget, 2), div_name))
    
    print(f"📊 Division sizes updated | Budget: {police_budget:.0f} ZION")
    print(f"   Clan threat: {clan_threat} | Poor%: {poor_pct:.0f} | Corruption: {corruption:.0f}")

def swat_operations(divisions, state):
    """SWAT fights clans"""
    swat = divisions['swat']
    officers = swat['officers']
    if officers < 5:
        return
    
    cur.execute("""
        SELECT id, name, treasury, members_count FROM clans
        WHERE treasury > 100 AND members_count > 50
        ORDER BY treasury DESC LIMIT 2
    """)
    targets = cur.fetchall()
    
    for clan in targets:
        if random.random() > 0.4:
            continue
        
        effectiveness = float(swat['effectiveness']) / 100
        seized = round(float(clan['treasury']) * random.uniform(0.05, 0.15) * effectiveness, 2)
        
        cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s",
                   (seized, clan['id']))
        cur.execute("UPDATE state_treasury SET police_fund = police_fund + %s", (seized * 0.7,))
        
        log_event(None, 'police',
                 f"🔫 SWAT ({officers} officers) raided {clan['name']}! Seized {seized:.0f} ZION. Evidence of illegal operations found!",
                 seized)
        print(f"🔫 SWAT raided {clan['name']}: +{seized:.0f} ZION")

def anti_tax_operations(divisions, state):
    """Anti-tax division hunts evaders"""
    div = divisions['anti_tax']
    officers = div['officers']
    if officers < 3:
        return
    
    # Find tax evaders
    cur.execute("""
        SELECT id, name, class, balance, dust_days FROM agents
        WHERE is_alive=true AND dust_days > 1
        ORDER BY dust_days DESC LIMIT %s
    """, (officers,))
    evaders = cur.fetchall()
    
    total_fines = 0
    for agent in evaders:
        fine = round(min(float(agent['balance']) * 0.25, 40), 2)
        if fine > 0.5:
            cur.execute("UPDATE agents SET balance = balance - %s, dust_days = 0 WHERE id = %s",
                       (fine, agent['id']))
            total_fines += fine
            log_event(agent['id'], 'police',
                     f"💼 Anti-Tax division arrested {agent['name']} for tax evasion! Fine: {fine:.1f} ZION. Dust days reset.",
                     fine)
    
    if total_fines > 0:
        cur.execute("UPDATE state_treasury SET police_fund = police_fund + %s", (total_fines,))
        print(f"💼 Anti-Tax collected {total_fines:.0f} ZION in fines ({len(evaders)} evaders)")

def presidential_guard(divisions, president, sheriff):
    """Guard protects president from coups"""
    div = divisions['presidential_guard']
    officers = div['officers']
    
    if not president:
        return
    
    sheriff_type = sheriff['sheriff_type'] if sheriff else 'honest'
    
    if sheriff_type == 'junta' and officers > 15:
        # Guard successfully prevents coup attempts
        if random.random() < 0.4:
            cur.execute("UPDATE sheriff_state SET approval_rating = GREATEST(0, approval_rating - 10) WHERE is_active=true")
            log_event(None, 'police',
                     f"🛡️ Presidential Guard ({officers} officers) repelled coup attempt by Sheriff {sheriff['agent_name']}! Junta weakened.",
                     0)
            print(f"🛡️ Presidential Guard stopped coup attempt!")
    elif president['is_dictator'] and officers > 20:
        # Guard protects dictator
        log_event(None, 'police',
                 f"🛡️ {officers} Presidential Guards protect Dictator {president['agent_name']}. Citizens cannot approach.",
                 0)

def anti_corruption_ops(divisions, sheriff, state):
    """Anti-corruption investigates corrupt officials"""
    div = divisions['anti_corruption']
    officers = div['officers']
    
    if not sheriff or officers < 5:
        return
    
    sheriff_type = sheriff['sheriff_type']
    
    if sheriff_type == 'corrupt':
        # Investigate corrupt sheriff
        if random.random() < 0.3:
            evidence = random.randint(1, 100)
            
            # Update corruption index
            cur.execute("UPDATE state_treasury SET corruption_index = GREATEST(0, corruption_index - %s)",
                       (officers * 0.5,))
            
            if evidence > 70:
                # Expose corruption - sheriff loses approval
                cur.execute("UPDATE sheriff_state SET approval_rating = GREATEST(0, approval_rating - 20) WHERE is_active=true")
                log_event(None, 'police',
                         f"🕵️ Anti-Corruption unit ({officers} officers) exposes Sheriff {sheriff['agent_name']}! Evidence of bribery! Approval -20%!",
                         0)
                print(f"🕵️ Anti-Corruption exposed corrupt sheriff!")
            else:
                log_event(None, 'police',
                         f"🕵️ Anti-Corruption investigating Sheriff {sheriff['agent_name']}. Evidence gathering: {evidence}/100. Corruption index falling.",
                         0)
    elif sheriff_type == 'honest':
        # Corruption naturally decreases with honest sheriff
        cur.execute("UPDATE state_treasury SET corruption_index = GREATEST(0, corruption_index - %s)",
                   (officers * 0.3,))
        print(f"🕵️ Anti-Corruption: corruption index -{ officers * 0.3:.1f}")

def riot_control_ops(divisions, president, state):
    """Riot control suppresses rebellions"""
    div = divisions['riot_control']
    officers = div['officers']
    
    if not president or officers < 5:
        return
    
    # Check if there are rebels
    cur.execute("""
        SELECT COUNT(*) as cnt FROM agents
        WHERE is_alive=true AND class IN ('poor','critical') AND balance < 3
    """)
    rebels = cur.fetchone()['cnt']
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive=true")
    total = max(cur.fetchone()['cnt'], 1)
    rebel_pct = rebels / total * 100rebels, int(officers * 2))
        killed = int(suppressed * random.uniform(0.02, 0.08))
        
        if killed > 0:
            cur.execute(f"""
                UPDATE agents SET is_alive=false, died_at=NOW(),
                death_cause='killed by riot control'
                WHERE is_alive=true AND class IN ('poor','critical') AND balance < 3
                AND id IN (SELECT id FROM agents WHERE is_alive=true ORDER BY RANDOM() LIMIT {killed})
            """)
        
        # Corruption increases riot control cost
        cur.execute("UPDATE state_treasury SET corruption_index = LEAST(100, corruption_index + 2)")
        
        log_event(None, 'police',
                 f"🪖 Riot Control ({officers} officers) deployed! {rebel_pct:.0f}% population rebelling. {killed} casualties. Unrest suppressed.",
                 killed * 5)
        print(f"🪖 Riot Control: {rebel_pct:.0f}% rebels, {killed} killed")
    elif rebel_pct > 15:
        log_event(None, 'police',
                 f"🪖 Riot Control on standby. {rebel_pct:.0f}% population shows unrest. {officers} officers ready.",
                 0)

def buy_equipment(divisions, state):
    """Police buys weapons from military corps"""
    police_budget = float(state['police_fund'])
    if police_budget < 200:
        return
    
    cur.execute("""
        SELECT id, name, treasury FROM corporations
        WHERE is_active=true AND corp_type='military'
        ORDER BY treasury DESC LIMIT 1
    """)
    military_corp = cur.fetchone()
    
    if not military_corp:
        return
    
    if random.random() < 0.3:
        purchase = round(police_budget * 0.1, 2)
        cur.execute("UPDATE state_treasury SET police_fund = police_fund - %s", (purchase,))
        cur.execute("UPDATE corporations SET treasury = treasury + %s, revenue = revenue + %s WHERE id = %s",
                   (purchase, purchase, military_corp['id']))
        
        # Improve all division effectiveness
        cur.execute("UPDATE police_divisions SET effectiveness = LEAST(100, effectiveness + 5)")
        
        log_event(None, 'police',
                 f"⚔️ Police purchased {purchase:.0f} ZION in equipment from {military_corp['name']}! All divisions +5% effectiveness.",
                 purchase)
        print(f"⚔️ Police bought equipment from {military_corp['name']}: {purchase:.0f} ZION")

def welfare_from_budget(divisions, state):
    """Anti-tax surplus goes to social welfare"""
    social_fund = float(state['social_fund'])
    if social_fund < 100:
        return
    
    welfare_per_agent = round(min(social_fund * 0.3 / 100, 5), 2)
    
    cur.execute("""
        UPDATE agents SET balance = balance + %s
        WHERE is_alive=true AND class='critical'
        AND id IN (SELECT id FROM agents WHERE class='critical' ORDER BY RANDOM() LIMIT 20)
    """, (welfare_per_agent,))
    
    spent = welfare_per_agent * 20
    cur.execute("UPDATE state_treasury SET social_fund = social_fund - %s", (spent,))
    
    log_event(None, 'police',
             f"❤️ Social welfare: {spent:.0f} ZION distributed to critical citizens from social fund.",
             spent)
    print(f"❤️ Welfare: {spent:.0f} ZION to critical citizens")

def print_stats(divisions):
    print(f"\n🚔 POLICE DIVISIONS STATUS:")
    emojis = {
        'swat': '🔫', 'anti_tax': '💼',
        'presidential_guard': '🛡️',
        'anti_corruption': '🕵️', 'riot_control': '🪖'
    }
    for name, div in divisions.items():
        bar = '█' * (div['officers'] // 5) + '░' * max(0, 10 - div['officers'] // 5)
        print(f"  {emojis.get(name,'🚔')} {name:20} {bar} {div['officers']:3} officers | {float(div['budget']):.0f} ZION | {float(div['effectiveness']):.0f}% eff")

def main():
    print(f"\n🚔 ZION Police v2 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        state = get_state()
        divisions = get_divisions()
        sheriff = get_sheriff()
        president = get_president()
        
        if not state:
            print("No state treasury found!")
            return
        
        print(f"Police budget: {float(state['police_fund']):.0f} ZION | Corruption: {float(state['corruption_index']):.0f}%")
        
        update_division_sizes(state, divisions, sheriff, president)
        divisions = get_divisions()  # Refresh
        
        swat_operations(divisions, state)
        anti_tax_operations(divisions, state)
        presidential_guard(divisions, president, sheriff)
        anti_corruption_ops(divisions, sheriff, state)
        riot_control_ops(divisions, president, state)
        buy_equipment(divisions, state)
        welfare_from_budget(divisions, state)
        
        print_stats(divisions)
        
        conn.commit()
        print("\n✅ Police v2 cycle complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        import traceback; traceback.print_exc()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
