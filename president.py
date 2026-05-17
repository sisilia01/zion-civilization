#!/usr/bin/env python3
"""
ZION President System v2 — полный политический цикл
День 1-5: Правление → День 6-7: Кампания → День 8: Выборы
→ Срок 2 → Диктатура → Революция → ЗРС восстановление
"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
    """, (agent_id, event_type, description, amount))

def ensure_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS president_state (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id),
            agent_name VARCHAR(100),
            party VARCHAR(10),
            term_number INTEGER DEFAULT 1,
            is_dictator BOOLEAN DEFAULT false,
            approval_rating INTEGER DEFAULT 60,
            police_fund NUMERIC(20,2) DEFAULT 500,
            personal_fund NUMERIC(20,2) DEFAULT 1000,
            days_in_power INTEGER DEFAULT 0,
            phase VARCHAR(20) DEFAULT 'ruling',
            is_active BOOLEAN DEFAULT true,
            started_at TIMESTAMP DEFAULT NOW()
        )
    """)
    # Добавляем phase если нет
    try:
        cur.execute("ALTER TABLE president_state ADD COLUMN IF NOT EXISTS phase VARCHAR(20) DEFAULT 'ruling'")
    except:
        pass

def get_president(cur):
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()

def run_election(cur, forced=False):
    """Выборы — 1 агент = 1 голос, богатые могут подкупать"""
    reason = "forced early election" if forced else "regular election"
    print(f"\n🗳️ ELECTION ({reason})!")
    
    # Кандидаты — топ по харизме
    cur.execute("""
        SELECT id, name, class, charisma, balance FROM agents
        WHERE is_alive = true
        ORDER BY charisma DESC, balance DESC LIMIT 8
    """)
    candidates = cur.fetchall()
    
    if len(candidates) < 2:
        return None
    
    # Подкуп голосов — богатые дают ZION бедным
    cur.execute("""
        SELECT id, balance FROM agents
        WHERE is_alive = true AND class = 'elite' AND balance > 100
        ORDER BY RANDOM() LIMIT 10
    """)
    rich_voters = cur.fetchall()
    
    bribe_total = 0
    for rich in rich_voters:
        if random.random() < 0.4:  # 40% богатых подкупают
            bribe = round(min(float(rich['balance']) * 0.05, 20), 2)
            cur.execute("""
                UPDATE agents SET balance = balance + %s
                WHERE is_alive = true AND class IN ('poor', 'critical')
                AND id IN (SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT 5)
            """, (bribe,))
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (bribe * 5, rich['id']))
            bribe_total += bribe * 5
    
    if bribe_total > 0:
        log_event(cur, None, 'election',
                 f"💰 VOTE BUYING! Elite spent {bribe_total:.1f} ZION bribing poor voters during campaign!",
                 bribe_total)
        print(f"💰 Bribery: {bribe_total:.1f} ZION spent on votes")
    
    # Голосование
    cur.execute("SELECT id, class, balance FROM agents WHERE is_alive = true")
    voters = cur.fetchall()
    
    votes = {c['id']: 0 for c in candidates}
    
    for voter in voters:
        weights = []
        for c in candidates:
            w = c['charisma'] + random.randint(0, 40)
            # Классовые предпочтения
            if voter['class'] in ['poor', 'critical']:
                if c['class'] == 'middle':
                    w += 25
                elif c['class'] == 'poor':
                    w += 15
            elif voter['class'] == 'elite':
                if c['class'] == 'elite':
                    w += 35
            elif voter['class'] == 'middle':
                w += 10
            weights.append(w)
        
        winner_idx = weights.index(max(weights))
        votes[candidates[winner_idx]['id']] += 1
    
    winner_id = max(votes, key=votes.get)
    winner = next(c for c in candidates if c['id'] == winner_id)
    winner_votes = votes[winner_id]
    total_votes = len(voters)
    
    party = "blue" if winner['class'] in ['middle', 'poor'] else "red"
    party_name = "🔵 Blue Alliance" if party == "blue" else "🔴 Red Coalition"
    
    # Деактивируем старого
    cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
    
    # Создаём нового
    cur.execute("""
        INSERT INTO president_state (agent_id, agent_name, party, term_number, police_fund, personal_fund, phase, days_in_power)
        VALUES (%s, %s, %s, 1, 500, 1000, 'ruling', 0)
    """, (winner['id'], winner['name'], party))
    
    # Награда победителю
    cur.execute("UPDATE agents SET balance = balance + 100 WHERE id = %s", (winner['id'],))
    
    log_event(cur, winner['id'], 'election',
             f"🏛️ ELECTION RESULTS: {winner['name']} ({party_name}) wins with {winner_votes}/{total_votes} votes! New President inaugurated.",
             winner_votes)
    
    print(f"🏆 {winner['name']} ({party_name}) — {winner_votes}/{total_votes} votes")
    return winner

def campaign_phase(cur, president):
    """Предвыборная кампания — агенты агитируют"""
    print(f"\n📣 CAMPAIGN PHASE — Day {president['days_in_power']}")
    
    # Incumbent агитирует
    pid = president['agent_id']
    name = president['agent_name']
    
    # Тратит из казны на рекламу
    ad_spend = min(float(president['personal_fund']) * 0.2, 100)
    cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (ad_spend,))
    
    # Повышает рейтинг
    approval_boost = random.randint(3, 10)
    cur.execute("""
        UPDATE president_state SET approval_rating = LEAST(100, approval_rating + %s)
        WHERE is_active = true
    """, (approval_boost,))
    
    log_event(cur, pid, 'election',
             f"📣 President {name} launches re-election campaign! Spent {ad_spend:.0f} ZION on ads. Approval +{approval_boost}%",
             ad_spend)
    print(f"📣 {name} campaigns: spent {ad_spend:.0f} ZION, approval +{approval_boost}%")

def president_actions(cur, president):
    """Президент принимает решения"""
    pid = president['agent_id']
    name = president['agent_name']
    is_dictator = president['is_dictator']
    approval = president['approval_rating']
    police_fund = float(president['police_fund'])
    personal_fund = float(president['personal_fund'])
    
    # Собираем налоги
    tax_rate = 0.05 if not is_dictator else 0.20
    
    cur.execute("SELECT SUM(balance) as total FROM agents WHERE is_alive = true")
    total_balance = float(cur.fetchone()['total'] or 0)
    tax_collected = round(total_balance * tax_rate * 0.1, 2)
    
    cur.execute("""
        UPDATE agents SET balance = balance * %s
        WHERE is_alive = true AND class = 'elite'
    """, (1 - tax_rate,))
    
    cur.execute("""
        UPDATE president_state SET 
            personal_fund = personal_fund + %s,
            police_fund = police_fund + %s,
            days_in_power = days_in_power + 1
        WHERE is_active = true
    """, (tax_collected * 0.3, tax_collected * 0.7))
    
    print(f"💰 Tax: {tax_collected:.1f} ZION")
    
    # Досрочные выборы если рейтинг упал ниже 15%
    if approval < 15 and not is_dictator:
        log_event(cur, pid, 'election',
                 f"🚨 CRISIS: President {name} approval collapsed to {approval}%! Early elections called!",
                 0)
        print(f"🚨 Early election! Approval: {approval}%")
        return "early_election"
    
    # Решение президента
    if is_dictator:
        decisions = ["fund_police", "fund_police", "corrupt", "raise_taxes", "raise_taxes"]
    else:
        decisions = ["fund_police", "fund_education", "help_poor", "fund_health", "corrupt", "raise_taxes", "do_nothing"]
    
    decision = random.choice(decisions)
    approval_change = 0
    
    if decision == "fund_police":
        amount = min(police_fund * 0.25, 150)
        cur.execute("UPDATE president_state SET police_fund = police_fund - %s WHERE is_active = true", (amount,))
        # Бедные вступают в полицию чтобы выжить
        cur.execute("""
            UPDATE agents SET balance = balance + 12, class = 'poor'
            WHERE is_alive = true AND class = 'critical'
            AND id IN (SELECT id FROM agents WHERE class='critical' ORDER BY RANDOM() LIMIT 15)
        """)
        log_event(cur, pid, 'president',
                 f"🚔 President {name} allocated {amount:.0f} ZION to police! Desperate poor join police force to survive.",
                 amount)
        approval_change = 3
        print(f"🚔 Police funded: {amount:.0f} ZION")
        
    elif decision == "fund_education":
        amount = min(personal_fund * 0.2, 80)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (amount,))
        cur.execute("""
            UPDATE agents SET balance = balance + 8
            WHERE is_alive = true AND class IN ('poor', 'middle')
            AND id IN (SELECT id FROM agents ORDER BY RANDOM() LIMIT 25)
        """)
        log_event(cur, pid, 'president',
                 f"🎓 President {name} invested {amount:.0f} ZION in education! Students benefit.",
                 amount)
        approval_change = 8
        
    elif decision == "help_poor":
        amount = min(personal_fund * 0.3, 120)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (amount,))
        cur.execute("""
            UPDATE agents SET balance = balance + 4
            WHERE is_alive = true AND class IN ('poor', 'critical')
        """)
        log_event(cur, pid, 'president',
                 f"❤️ President {name} distributed {amount:.0f} ZION welfare to the poor!",
                 amount)
        approval_change = 12
        
    elif decision == "fund_health":
        amount = min(personal_fund * 0.2, 80)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (amount,))
        log_event(cur, pid, 'president',
                 f"🏥 President {name} allocated {amount:.0f} ZION to fight epidemics and improve healthcare!",
                 amount)
        approval_change = 7
        
    elif decision == "corrupt":
        stolen = min(personal_fund * 0.5, 400)
        cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s", (stolen, pid))
        log_event(cur, pid, 'president',
                 f"💀 CORRUPTION EXPOSED: President {name} embezzled {stolen:.0f} ZION from state treasury! Citizens outraged!",
                 stolen)
        approval_change = -25
        print(f"💀 Corruption: {name} stole {stolen:.0f} ZION!")
        
    elif decision == "raise_taxes":
        cur.execu
    
    new_approval = max(0, min(100, approval + approval_change))
    cur.execute("UPDATE president_state SET approval_rating = %s WHERE is_active = true", (new_approval,))
    print(f"📊 Approval: {approval} → {new_approval}")
    
    return "continue"

def check_dictatorship(cur, president):
    """Конец второго срока — уйти или стать диктатором"""
    name = president['agent_name']
    
    if random.random() < 0.30:  # 30% шанс диктатуры
        cur.execute("""
            UPDATE president_state SET 
                is_dictator = true,
                approval_rating = GREATEST(0, approval_rating - 25),
                phase = 'dictatorship'
            WHERE is_active = true
        """)
        log_event(cur, president['agent_id'], 'president',
                 f"👑 COUP! President {name} REFUSES TO LEAVE! Declares DICTATORSHIP! Police deployed to suppress opposition!",
                 0)
        print(f"👑 {name} declared DICTATORSHIP!")
        return True
    else:
        cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
        log_event(cur, president['agent_id'], 'president',
                 f"✅ President {name} peacefully steps down after 2 terms. Democracy prevails. New elections called.",
                 0)
        print(f"✅ {name} stepped down peacefully")
        return False

def check_revolution(cur, president):
    """Революция против диктатора"""
    approval = president['approval_rating']
    police_fund = float(president['police_fund'])
    name = president['agent_name']
    
    cur.execute("""
        SELECT COUNT(*) as cnt FROM agents
        WHERE is_alive = true AND class IN ('poor', 'critical') AND balance < 5
    """)
    rebels = cur.fetchone()['cnt']
    
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
    total = cur.fetchone()['cnt']
    rebel_pct = rebels / max(total, 1)
    
    print(f"⚔️ Revolution check: {rebels} rebels ({rebel_pct*100:.0f}%), approval: {approval}%, police: {police_fund:.0f}")
    
    # Полиция слабеет без денег
    if police_fund < 50:
        cur.execute("""
            UPDATE president_state SET approval_rating = GREATEST(0, approval_rating - 15)
            WHERE is_active = true
        """)
        log_event(cur, None, 'police',
                 f"⚠️ Police underfunded! Officers deserting dictator {name}. Opposition grows stronger!",
                 0)
        print(f"⚠️ Police defecting!")
    
    if approval < 20 and rebel_pct > 0.35:
        # РЕВОЛЮЦИЯ!
        battle_deaths = int(total * random.uniform(0.15, 0.35))
        
        cur.execute(f"""
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'killed in revolution'
            WHERE is_alive = true
            AND id IN (SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT {battle_deaths})
        """)
        
        # Диктатор казнён
        cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
        cur.execute("""
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'executed by revolutionaries'
            WHERE id = %s
        """, (president['agent_id'],))
        
        log_event(cur, None, 'rebellion',
                 f"🔥 REVOLUTION SUCCESS! Dictator {name} EXECUTED! {battle_deaths} agents died in the uprising! Clans united with the poor to restore democracy!",
                 battle_deaths * 10)
        
        print(f"🔥 REVOLUTION! Dictator {name} executed! {battle_deaths} dead!")
        
        # ЗРС экстренная помощь
        cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
        survivors = cur.fetchone()['cnt']
        
        stimulus = max(20, round(500 / max(survivors, 1), 1))
        cur.execute("UPDATE agents SET balance = balance + %s WHERE is_alive = true", (stimulus,))
        
        log_event(cur, None, 'frs',
                 f"🏦 ZRS EMERGENCY PROTOCOL: Only {survivors} survivors! Printing {stimulus} ZION per agent. Civilization must survive!",
                 stimulus * survivors)
        print(f"🏦 ZRS emergency: +{stimulus} ZION to {survivors} survivors")
        return True
    
    elif rebel_pct > 0.30 and police_fund > 80:
        # Полиция подавляет
        suppressed = max(1, int(rebels * 0.08))
        cur.execute(f"""
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'killed suppressing rebellion'
            WHERE is_alive = true AND class IN ('poor', 'critical')
            AND id IN (SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT {suppressed})
        """)
        cur.execute("UPDATE president_state SET police_fund = police_fund - 80 WHERE is_active = true")
        
        log_event(cur, None, 'police',
                 f"🚔 Dictator {name} orders brutal crackdown! {suppressed} rebels killed. Police paid {80} ZION from treasury.",
                 80)
        print(f"🚔 Crackdown: {suppressed} killed")
    
    return False

def main():
    print(f"\n🏛️ ZION President v2 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        ensure_tables(cur)
        conn.commit()
        
        president = get_president(cur)
        
        if not president:
            print("No president — calling election!")
            run_election(cur)
            conn.commit()
            return
        days = president['days_in_power']
        phase = president.get('phase', 'ruling')
        is_dictator = president['is_dictator']
        print(f"President: {president['agent_name']} | Day {days} | Phase: {phase} | Approval: {president['approval_rating']}% | Dictator: {is_dictator}")
        
        if is_dictator:
            # Диктатор — действует и проверяем революцию
            result = president_actions(cur, president)
            president = get_president(cur)
            if president:
                check_revolution(cur, president)
        
        elif days >= 6 and days <= 7:
            # Предвыборная кампания (дни 6-7)
            cur.execute("UPDATE president_state SET phase = 'campaign' WHERE is_active = true")
            campaign_phase(cur, president)
        
        elif days >= 8 and president['term_number'] == 1:
            # Выборы после первого срока
            run_election(cur)
        
        elif days >= 13 and president['term_number'] == 2:
            # Конец второго срока
            became_dictator = check_dictatorship(cur, president)
            if not became_dictator:
                run_election(cur)
        
        else:
            # Обычное правление
            cur.execute("UPDATE president_state SET phase = 'ruling' WHERE is_active = true")
            result = president_actions(cur, president)
            if result == "early_election":
                run_election(cur, forced=True)
        
        conn.commit()
        print("\n✅ President cycle complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
