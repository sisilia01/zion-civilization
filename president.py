#!/usr/bin/env python3
"""
ZION President System — полный цикл власти
Выборы → Срок → Диктатура → Свержение → Восстановление
"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime, timedelta

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
            is_active BOOLEAN DEFAULT true,
            started_at TIMESTAMP DEFAULT NOW()
        )
    """)

def get_current_president(cur):
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()

def run_election(cur):
    """Выборы президента"""
    print("\n🗳️ PRESIDENTIAL ELECTION!")
    
    # Кандидаты
    cur.execute("""
        SELECT id, name, class, charisma, balance FROM agents
        WHERE is_alive = true AND class IN ('elite', 'middle')
        ORDER BY charisma DESC, balance DESC LIMIT 6
    """)
    candidates = cur.fetchall()
    
    if not candidates:
        return None
    
    # Голосование
    cur.execute("SELECT id, class FROM agents WHERE is_alive = true")
    voters = cur.fetchall()
    
    votes = {c['id']: 0 for c in candidates}
    for voter in voters:
        # Бедные голосуют за харизму, богатые за баланс
        weights = []
        for c in candidates:
            w = c['charisma'] + random.randint(0, 40)
            if voter['class'] in ['poor', 'critical'] and c['class'] == 'middle':
                w += 20
            if voter['class'] == 'elite' and c['class'] == 'elite':
                w += 30
            weights.append(w)
        
        winner_idx = weights.index(max(weights))
        votes[candidates[winner_idx]['id']] += 1
    
    winner_id = max(votes, key=votes.get)
    winner = next(c for c in candidates if c['id'] == winner_id)
    winner_votes = votes[winner_id]
    
    # Определяем партию
    party = "blue" if winner['class'] == 'middle' else "red"
    
    # Деактивируем старого
    cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
    
    # Создаём нового
    cur.execute("""
        INSERT INTO president_state (agent_id, agent_name, party, term_number, police_fund, personal_fund)
        VALUES (%s, %s, %s, 1, 500, 1000)
    """, (winner['id'], winner['name'], party))
    
    log_event(cur, winner['id'], 'election',
             f"🏛️ {winner['name']} elected President! {winner_votes} votes. Party: {'🔵 Blue' if party == 'blue' else '🔴 Red'}",
             winner_votes)
    
    print(f"🏆 {winner['name']} elected! ({winner_votes} votes)")
    return winner

def president_actions(cur, president):
    """Президент принимает решения"""
    pid = president['agent_id']
    name = president['agent_name']
    is_dictator = president['is_dictator']
    approval = president['approval_rating']
    police_fund = float(president['police_fund'])
    personal_fund = float(president['personal_fund'])
    
    # Собираем налоги
    tax_rate = 0.05 if not is_dictator else 0.15  # Диктатор берёт 15%
    
    cur.execute("SELECT SUM(balance) as total FROM agents WHERE is_alive = true AND class = 'elite'")
    elite_total = float(cur.fetchone()['total'] or 0)
    
    tax_collected = round(elite_total * tax_rate, 2)
    
    cur.execute("""
        UPDATE agents SET balance = balance * %s
        WHERE is_alive = true AND class = 'elite'
    """, (1 - tax_rate,))
    
    # Обновляем фонд президента
    cur.execute("""
        UPDATE president_state SET 
            personal_fund = personal_fund + %s,
            police_fund = police_fund + %s,
            days_in_power = days_in_power + 1
        WHERE is_active = true
    """, (tax_collected * 0.3, tax_collected * 0.7))
    
    print(f"💰 Tax collected: {tax_collected:.1f} ZION")
    
    # Случайное решение президента
    decision = random.choice([
        "fund_police", "fund_education", "help_poor", 
        "fund_health", "corrupt", "raise_taxes"
    ])
    
    if is_dictator:
        decision = random.choice(["fund_police", "fund_police", "corrupt", "raise_taxes"])
    
    if decision == "fund_police":
        amount = min(police_fund * 0.3, 200)
        cur.execute("UPDATE president_state SET police_fund = police_fund - %s WHERE is_active = true", (amount,))
        # Бедные вступают в полицию
        cur.execute("""
            UPDATE agents SET balance = balance + 15, class = 'poor'
            WHERE is_alive = true AND class = 'critical'
            AND id IN (SELECT id FROM agents WHERE is_alive = true AND class = 'critical' ORDER BY RANDOM() LIMIT 20)
        """)
        log_event(cur, pid, 'president',
                 f"🚔 President {name} allocated {amount:.0f} ZION to police! Poor agents join police force for survival.",
                 amount)
        print(f"🚔 Police funded: {amount:.0f} ZION")
        approval_change = 5
        
    elif decision == "fund_education":
        amount = min(personal_fund * 0.2, 100)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (amount,))
        cur.execute("""
            UPDATE agents SET balance = balance + 10
            WHERE is_alive = true AND class IN ('poor', 'middle')
            AND id IN (SELECT id FROM agents ORDER BY RANDOM() LIMIT 30)
        """)
        log_event(cur, pid, 'president',
                 f"🎓 President {name} invested {amount:.0f} ZION in education!",
                 amount)
        approval_change = 8
        
    elif decision == "help_poor":
        amount = min(personal_fund * 0.25, 150)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (amount,))
        cur.execute("""
            UPDATE agents SET balance = balance + 5
            WHERE is_alive = true AND class IN ('poor', 'critical')
        """)
        log_event(cur, pid, 'president',
                 f"❤️ President {name} distributed {amount:.0f} ZION to the poor!",
                 amount)
        approval_change = 12
        
    elif decision == "fund_health":
        amount = min(personal_fund * 0.2, 100)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund - %s WHERE is_active = true", (amount,))
        log_event(cur, pid, 'president',
                 f"🏥 President {name} allocated {amount:.0f} ZION to fight epidemics!",
                 amount)
        approval_change = 7
        
    elif decision == "corrupt":
        # Ворует из казны
        stolen = min(personal_fund * 0.4, 300)
        cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s", (stolen, pid))
        log_event(cur, pid, 'president',
                 f"💀 CORRUPTION: President {name} embezzled {stolen:.0f} ZION from state treasury!",
                 stolen)
        approval_change = -20
        print(f"💀 Corruption: {name} stole {stolen:.0f} ZION!")
        
    elif decision == "raise_taxes":
        extra_tax = round(elite_total * 0.05, 2)
        cur.execute("""
            UPDATE agents SET balance = balance * 0.95
            WHERE is_alive = true
        """)
        cur.execute("UPDATE president_state SET personal_fund = personal_fund + %s WHERE is_active = true", (extra_tax,))
        log_event(cur, pid, 'president',
                 f"📈 President {name} raised taxes! Everyone pays 5% more. Treasury: +{extra_tax:.0f} ZION",
                 extra_tax)
        approval_change = -15
        print(f"📈 Tax raised by {name}!")
    else:
        approval_change = 0
    
    # Обновляем рейтинг
    new_approval = max(0, min(100, approval + approval_change))
    cur.execute("UPDATE president_state SET approval_rating = %s WHERE is_active = true", (new_approval,))
    print(f"📊 Approval rating: {approval} → {new_approval}")
    
    return new_approval

def check_dictatorship(cur, president):
    """Проверяем может ли президент стать диктатором"""
    if president['term_number'] < 2 or president['is_dictator']:
        return False
    
    # После 2 сроков — 25% шанс стать диктатором
    if random.random() < 0.25:
        cur.execute("""
            UPDATE president_state SET 
                is_dictator = true,
                approval_rating = approval_rating - 20
            WHERE is_active = true
        """)
        log_event(cur, president['agent_id'], 'president',
                 f"👑 DICTATOR: {president['agent_name']} REFUSES TO LEAVE POWER! Declares himself Supreme Ruler!",
                 0)
        print(f"👑 {president['agent_name']} became DICTATOR!")
        return True
    else:
        # Мирно уходит
        cur.execute("UPDATE president_state SET is_active = false WHERE is_active = true")
        log_event(cur, president['agent_id'], 'president',
                 f"✅ President {president['agent_name']} peacefully steps down after 2 terms. New elections called.",
                 0)
        print(f"✅ {president['agent_name']} stepped down peacefully")
        return False

def check_revolution(cur, president):
    """Проверяем восстание против диктатора"""
    if not president['is_dictator']:
        return False
    
    approval = president['approval_rating']
    police_fund = float(president['police_fund'])
    
    # Считаем силу оппозиции
    cur.execute("""
        SELECT COUNT(*) as cnt FROM agents
        WHERE is_alive = true AND class IN ('poor', 'critical') AND balance < 5
    """)
    rebels = cur.fetchone()['cnt']
    
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
    total = cur.fetchone()['cnt']
    
    rebel_pct = rebels / max(total, 1)
    
    print(f"⚔️ Revolution check: {rebels} rebels ({rebel_pct*100:.0f}%), approval: {approval}%, police fund: {police_fund:.0f}")
    
    # Революция если рейтинг < 20% и бунтарей > 40%
    if approval < 20 and rebel_pct > 0.4:
        
        # Кланы и беднота объединяются
        battle_deaths = int(total * random.uniform(0.1, 0.3))
        
        # Убиваем агентов в бою
        cur.execute(f"""
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'killed in revolution'
            WHERE is_alive = true
            AND id IN (SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT {battle_deaths})
        """)
        
        # Дrown!")
        
        # ФРС печатает деньги для восстановления
        cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
        survivors = cur.fetchone()['cnt']
        
        if survivors < 500:
            stimulus = 50.0
            cur.execute("""
                UPDATE agents SET balance = balance + %s WHERE is_alive = true
            """, (stimulus,))
            log_event(cur, None, 'frs',
                     f"🏦 FRS EMERGENCY: Only {survivors} survivors! Printing massive stimulus — +{stimulus} ZION to all survivors!",
                     stimulus * survivors)
            print(f"🏦 FRS emergency stimulus: +{stimulus} ZION to {survivors} survivors")
        
        return True
    
    # Полиция подавляет мелкие бунты
    elif rebel_pct > 0.3 and police_fund > 100:
        suppressed = int(rebels * 0.1)
        cur.execute(f"""
            UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'killed by dictator police'
            WHERE is_alive = true AND class IN ('poor', 'critical')
            AND id IN (SELECT id FROM agents WHERE is_alive = true ORDER BY RANDOM() LIMIT {suppressed})
        """)
        cur.execute("UPDATE president_state SET police_fund = police_fund - 100 WHERE is_active = true", )
        
        log_event(cur, None, 'police',
                 f"🚔 Dictator {president['agent_name']} orders police crackdown! {suppressed} rebels killed. Police paid from treasury.",
                 100)
        print(f"🚔 Police crackdown: {suppressed} killed")
    
    return False

def main():
    print(f"\n🏛️ ZION President System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        ensure_tables(cur)
        conn.commit()
        
        president = get_current_president(cur)
        
        if not president:
            print("No president — calling election!")
            winner = run_election(cur)
            conn.commit()
            return
        
        print(f"President: {president['agent_name']} | Term: {president['term_number']} | Approval: {president['approval_rating']}% | Dictator: {president['is_dictator']}")
        
        # Президент действует
        approval = president_actions(cur, president)
        
        # Обновляем президента
        president = get_current_president(cur)
        if not president:
            return
        
        # Проверяем срок (каждые 7 "дней" = 7 запусков)
        if president['days_in_power'] >= 7 and not president['is_dictator']:
            if president['term_number'] >= 2:
                # Конец второго срока
                became_dictator = check_dictatorship(cur, president)
                if not became_dictator:
                    run_election(cur)
            else:
                # Переизбрание на второй срок
                cur.execute("""
                    UPDATE president_state SET term_number = 2, days_in_power = 0
                    WHERE is_active = true
                """)
                log_event(cur, president['agent_id'], 'election',
                         f"🗳️ {president['agent_name']} wins re-election! Starting term 2.",
                         0)
                print(f"🗳️ {president['agent_name']} re-elected for term 2!")
        
        # Проверяем революцию
        if president['is_dictator']:
            check_revolution(cur, president)
        
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
