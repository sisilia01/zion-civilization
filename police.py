import psycopg2
import psycopg2.extras
import random
from datetime import datetime
import sys

conn = psycopg2.connect(host="localhost", database="zion_db", user="zion_user", password="zion2026")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def log_event(agent_id, etype, desc, amount=0):
    cur.execute("INSERT INTO events (agent_id, event_type, description, zion_amount) VALUES (%s,%s,%s,%s)",
               (agent_id, etype, desc, amount))

def main():
    sys.stderr.write(f"\n ZION Police v2 - {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    
    cur.execute("SELECT * FROM state_treasury LIMIT 1")
    state = cur.fetchone()
    if not state:
        sys.stderr.write("No state treasury!\n")
        return
    
    cur.execute("SELECT * FROM police_divisions ORDER BY id")
    divs = {d['division']: d for d in cur.fetchall()}
    
    cur.execute("SELECT * FROM sheriff_state WHERE is_active=true LIMIT 1")
    sheriff = cur.fetchone()
    
    cur.execute("SELECT * FROM president_state WHERE is_active=true LIMIT 1")
    president = cur.fetchone()
    
    police_budget = float(state['police_fund'])
    sys.stderr.write(f"Police budget: {police_budget:.0f} ZION\n")
    
    # Get metrics
    cur.execute("SELECT COUNT(*) as t, AVG(balance) as avg, COUNT(CASE WHEN class IN ('poor','critical') THEN 1 END) as poor FROM agents WHERE is_alive=true")
    eco = cur.fetchone()
    total = max(int(eco['t']), 1)
    poor_pct = int(eco['poor']) / total * 100
    
    cur.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(treasury),0) as tr FROM clans WHERE members_count > 50")
    clan = cur.fetchone()
    clan_threat = min(100, int(clan['cnt']) * 15 + int(float(clan['tr'])) // 200)
    
    pres_approval = int(president['approval_rating']) if president else 50
    is_dictator = president['is_dictator'] if president else False
    sheriff_type = sheriff['sheriff_type'] if sheriff else 'honest'
    
    # Ideal division sizes
    ideal = {
        'swat': max(5, clan_threat),
        'anti_tax': max(5, int(poor_pct * 0.5)),
        'presidential_guard': 30 if is_dictator else (20 if sheriff_type == 'junta' else 10),
        'anti_corruption': 20 if sheriff_type == 'honest' else (5 if sheriff_type == 'corrupt' else 10),
        'riot_control': max(5, int((100 - pres_approval) * 0.5)),
    }
    
    total_ideal = max(sum(ideal.values()), 1)
    budget_officers = max(10, int(police_budget / 8))
    scale = min(1.5, budget_officers / total_ideal)
    
    for div_name, ideal_count in ideal.items():
        if div_name not in divs:
            continue
        current = divs[div_name]['officers']
        target = max(2, int(ideal_count * scale))
        change = max(-5, min(5, target - current))
        new_count = max(2, current + change)
        div_budget = round((new_count / total_ideal) * police_budget, 2)
        cur.execute("UPDATE police_divisions SET officers=%s, budget=%s, updated_at=NOW() WHERE division=%s",
                   (new_count, div_budget, div_name))
    
    conn.commit()
    cur.execute("SELECT * FROM police_divisions ORDER BY id")
    divs = {d['division']: d for d in cur.fetchall()}
    
    # SWAT raids clans
    cur.execute("SELECT id, name, treasury FROM clans WHERE treasury > 100 ORDER BY treasury DESC LIMIT 2")
    for clan_row in cur.fetchall():
        if random.random() < 0.4:
            eff = float(divs['swat']['effectiveness']) / 100
            seized = round(float(clan_row['treasury']) * random.uniform(0.05, 0.15) * eff, 2)
            cur.execute("UPDATE clans SET treasury=treasury-%s WHERE id=%s", (seized, clan_row['id']))
            cur.execute("UPDATE state_treasury SET police_fund=police_fund+%s", (seized * 0.7,))
            log_event(None, 'police', f"SWAT raided {clan_row['name']}! Seized {seized:.0f} ZION.", seized)
            sys.stderr.write(f"SWAT raided {clan_row['name']}: +{seized:.0f} ZION\n")
    
    # Anti-tax fines
    cur.execute("SELECT id, name, balance FROM agents WHERE is_alive=true AND dust_days>1 LIMIT %s",
               (divs['anti_tax']['officers'],))
    total_fines = 0
    for agent in cur.fetchall():
        fine = round(min(float(agent['balance']) * 0.25, 40), 2)
        if fine > 0.5:
            cur.execute("UPDATE agents SET balance=balance-%s, dust_days=0 WHERE id=%s", (fine, agent['id']))
            total_fines += fine
            log_event(agent['id'], 'police', f"Anti-Tax arrested {agent['name']}! Fine: {fine:.1f} ZION", fine)
    if total_fines > 0:
        cur.execute("UPDATE state_treasury SET police_fund=police_fund+%s", (total_fines,))
        sys.stderr.write(f"Anti-Tax collected {total_fines:.0f} ZION\n")
    
    # Presidential guard vs junta
    if sheriff and sheriff_type == 'junta' and divs['presidential_guard']['officers'] > 15:
        if random.random() < 0.4:
            cur.execute("UPDATE sheriff_state SET approval_rating=GREATEST(0, approval_rating-10) WHERE is_active=true")
            log_event(None, 'police', f"Presidential Guard repelled coup attempt by Sheriff {sheriff['agent_name']}!", 0)
            sys.stderr.write("Presidential Guard stopped coup!\n")
    
    # Anti-corruption
    if sheriff and sheriff_type == 'corrupt' and divs['anti_corruption']['officers'] > 5:
        if random.random() < 0.3:
            cur.execute("UPDATE sheriff_state SET approval_rating=GREATEST(0, approval_rating-20) WHERE is_active=true")
            cur.execute("UPDATE state_treasury SET corruption_index=GREATEST(0, corruption_index-5)")
            log_event(None, 'police', f"Anti-Corruption exposed Sheriff {sheriff['agent_name']}! Approval -20%!", 0)
            sys.stderr.write("Anti-Corruption exposed corrupt sheriff!\n")
    
    # Riot control
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive=true AND class IN ('poor','critical') AND balance < 3")
    rebels = int(cur.fetchone()['cnt'])
    rebel_pct = rebels / total * 100
    if rebel_pct > 30:
        killed = max(1, int(divs['riot_control']['officers'] * 0.05))
        cur.execute(f"""UPDATE agents SET is_alive=false, died_at=NOW(), death_cause='riot control'
            WHERE is_alive=true AND class IN ('poor','critical') AND balance < 3
            AND id IN (SELECT id FROM agents WHERE is_alive=true ORDER BY RANDOM() LIMIT {killed})""")
        log_event(None, 'police', f"Riot Control deployed! {rebel_pct:.0f}% rebelling. {killed} casualties.", killed*5)
        sys.stderr.write(f"Riot Control: {killed} killed ({rebel_pct:.0f}% rebels)\n")
    
    # Buy equipment from military corp
    if float(state['police_fund']) > 200 and random.random() < 0.3:
        cur.execute("SELECT id, name FROM corporations WHERE is_active=true AND corp_type='military' ORDER BY treasury DESC LIMIT 1")
        mil = cur.fetchone()
        if mil:
            purchase = round(float(state['police_fund']) * 0.1, 2)
            cur.execute("UPDATE state_treasury SET police_fund=police_fund-%s", (purchase,))
            cur.execute("UPDATE corporations SET treasury=treasury+%s, revenue=revenue+%s WHERE id=%s",
                       (purchase, purchase, mil['id']))
            cur.execute("UPDATE police_divisions SET effectiveness=LEAST(100, effectiveness+5)")
            log_event(None, 'police', f"Police bought {purchase:.0f} ZION equipment from {mil['name']}! All divisions +5% effectiveness.", purchase)
            sys.stderr.write(f"Bought equipment from {mil['name']}: {purchase:.0f} ZION\n")
    
    # Print division stats
    sys.stderr.write("\nDIVISIONS:\n")
    emojis = {'swat':'SWAT', 'anti_tax':'ANTI-TAX', 'presidential_guard':'GUARD', 'anti_corruption':'ANTI-CORR', 'riot_control':'RIOT'}
    for name, div in divs.items():
        bar = '#' * (div['officers'] // 3)
        sys.stderr.write(f"  {emojis.get(name,name):12} {bar:15} {div['officers']:3} officers | {float(div['effectiveness']):.0f}%\n")
    
    # Sync total officers to sheriff state
    cur.execute("SELECT SUM(officers) as total FROM police_divisions")
    row = cur.fetchone()
    total_officers = int(row['total'] or 0)
    cur.execute("UPDATE sheriff_state SET police_count = %s WHERE is_active=true", (total_officers,))
    
    conn.commit()
    sys.stderr.write(f"\nPolice v2 complete! Total officers: {total_officers}\n")
    cur.close()
    conn.close()

main()
