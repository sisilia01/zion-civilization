#!/usr/bin/env python3
"""
ZION ZION Reserve System — ФРС
Следит за экономикой, печатает деньги при кризисе,
изымает при инфляции. Независим от президента.
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

# ФРС параметры
FRS_RESERVE = 10000.0      # Резервный фонд ФРС
CRISIS_THRESHOLD = 0.40    # Если >40% агентов бедные — кризис
INFLATION_THRESHOLD = 500  # Если средний баланс >500 — инфляция

def log_event(cur, event_type, description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (NULL, %s, %s, %s)
    """, (event_type, description, amount))

def ensure_frs_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frs_actions (
            id SERIAL PRIMARY KEY,
            action VARCHAR(50),
            amount NUMERIC(20,2),
            reason TEXT,
            performed_at TIMESTAMP DEFAULT NOW()
        )
    """)

def analyze_economy(cur):
    """Анализируем состояние экономики"""
    cur.execute("""
        SELECT 
            COUNT(*) as total,
            AVG(balance) as avg_balance,
            SUM(balance) as total_money,
            COUNT(CASE WHEN class IN ('poor','critical') THEN 1 END) as poor_count,
            COUNT(CASE WHEN class = 'elite' THEN 1 END) as elite_count,
            MIN(balance) as min_balance,
            MAX(balance) as max_balance
        FROM agents WHERE is_alive = true
    """)
    stats = cur.fetchone()
    
    poor_pct = float(stats['poor_count']) / max(float(stats['total']), 1)
    avg_bal = float(stats['avg_balance'] or 0)
    total_money = float(stats['total_money'] or 0)
    
    print(f"📊 Economy: avg={avg_bal:.1f} ZION | poor={poor_pct*100:.0f}% | total={total_money:.0f} ZION")
    
    return {
        'poor_pct': poor_pct,
        'avg_balance': avg_bal,
        'total_money': total_money,
        'total_agents': int(stats['total']),
        'elite_count': int(stats['elite_count']),
    }

def quantitative_easing(cur, economy):
    """Печатаем деньги при кризисе — раздаём корпорациям"""
    emission = min(round(economy['total_agents'] * 2.0, 2), 2000)  # max 2000 ZION per QE
    
    print(f"🏦 FRS: CRISIS DETECTED! Printing {emission:.1f} ZION (QE)...")
    
    # Раздаём корпорациям
    cur.execute("""
        SELECT id, name, employees FROM corporations
        WHERE is_active = true AND employees > 0
        ORDER BY employees DESC LIMIT 5
    """)
    corps = cur.fetchall()
    
    if corps:
        per_corp = round(emission / len(corps), 2)
        for corp in corps:
            cur.execute("UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
                       (per_corp, corp['id']))
            print(f"  💉 {corp['name']} received {per_corp:.1f} ZION stimulus")
        
        # Корпорации нанимают бедных
        cur.execute("""
            SELECT id, name FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical')
            ORDER BY RANDOM() LIMIT %s
        """, (len(corps) * 3,))
        poor_workers = cur.fetchall()
        
        salary = 8.0
        for worker in poor_workers:
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                       (salary, worker['id']))
        
        if poor_workers:
            print(f"  👷 {len(poor_workers)} poor agents employed by stimulus corps")
    
    else:
        # Нет корпораций — раздаём напрямую бедным
        cur.execute("""
            UPDATE agents SET balance = balance + 10
            WHERE is_alive = true AND class IN ('poor', 'critical')
        """)
        print(f"  💊 Direct stimulus: +10 ZION to all poor/critical agents")
    
    cur.execute("""
        INSERT INTO frs_actions (action, amount, reason)
        VALUES ('QE', %s, 'Crisis: poor population exceeded threshold')
    """, (emission,))
    
    log_event(cur, 'frs',
             f"🏦 FRS: Quantitative Easing! Injected {emission:.1f} ZION into economy to fight crisis!",
             emission)

def quantitative_tightening(cur, economy):
    """Изымаем деньги при инфляции"""
    tax_amount = round(economy['avg_balance'] * 0.05, 2)
    
    print(f"🏦 FRS: INFLATION! Collecting {tax_amount:.1f} ZION per elite agent...")
    
    # Изымаем у богатых
    cur.execute("""
        UPDATE agents SET balance = balance - %s
        WHERE is_alive = true AND class = 'elite' AND balance > %s
    """, (tax_amount, tax_amount * 2))
    
    affected = cur.rowcount
    total_collected = tax_amount * affected
    
    cur.execute("""
        INSERT INTO frs_actions (action, amount, reason)
        VALUES ('QT', %s, 'Inflation: average balance exceeded threshold')
    """, (total_collected,))
    
    log_event(cur, 'frs',
             f"🏦 FRS: Quantitative Tightening! Collected {total_collected:.1f} ZION from {affected} elite agents to fight inflation!",
             total_collected)
    
    print(f"  💸 Collected {total_collected:.1f} ZION from {affected} elite agents")

def set_interest_rate(cur, economy):
    """Устанавливает процентную ставку"""
    if economy['poor_pct'] > 0.5:
        rate = 0.01  # Кризис — низкая ставка
        rate_name = "EMERGENCY LOW"
    elif economy['avg_balance'] > 200:
        rate = 0.08  # Инфляция — высокая ставка
        rate_name = "HIGH"
    else:
        rate = 0.04  # Норма
        rate_name = "NORMAL"
    
    log_event(cur, 'frs',
             f"🏦 FRS: Interest rate set to {rate*100:.0f}% ({rate_name}) — economy avg balance: {economy['avg_balance']:.1f} ZION",
             0)
    print(f"📈 FRS Interest Rate: {rate*100:.0f}% ({rate_name})")
    return rate

def main():
    print(f"\n🏦 ZION FRS — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    print("ZION Reserve System — Independent from President")
    
    try:
        ensure_frs_table(cur)
        conn.commit()
        
        economy = analyze_economy(cur)
        rate = set_interest_rate(cur, economy)
        
        # Решение ФРС
        if economy['poor_pct'] > CRISIS_THRESHOLD:
            print(f"🚨 CRISIS MODE: {economy['poor_pct']*100:.0f}% poor agents!")
            quantitative_easing(cur, economy)
        
        elif economy['avg_balance'] > INFLATION_THRESHOLD:
            print(f"⚠️ INFLATION MODE: avg balance {economy['avg_balance']:.1f} ZION!")
            quantitative_tightening(cur, economy)
        
        else:
            print(f"✅ Economy STABLE — no intervention needed")
            log_event(cur, 'frs',
                     f"🏦 FRS: Economy stable. Avg balance: {economy['avg_balance']:.1f} ZION. Rate: {rate*100:.0f}%",
                     0)
        
        conn.commit()
        print("\n✅ FRS cycle complete!")
        
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
