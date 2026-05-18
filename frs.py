#!/usr/bin/env python3
"""
ZION Reserve System (ZRS) — Центральный банк
Полная монетарная политика: ставки, QE, QT, циклы
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

def log_event(description, amount=0):
    cur.execute("""
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (NULL, 'frs', %s, %s)
    """, (description, amount))

def ensure_tables():
    cur.execute("""
        CREATE TABLE IF NOT EXISTS zrs_policy (
            id SERIAL PRIMARY KEY,
            interest_rate NUMERIC(5,2),
            policy_mode VARCHAR(20),
            avg_balance NUMERIC(20,2),
            poor_pct NUMERIC(5,2),
            total_money NUMERIC(20,2),
            action_taken VARCHAR(50),
            amount NUMERIC(20,2) DEFAULT 0,
            recorded_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frs_actions (
            id SERIAL PRIMARY KEY,
            action VARCHAR(50),
            amount NUMERIC(20,2),
            reason TEXT,
            performed_at TIMESTAMP DEFAULT NOW()
        )
    """)

def analyze_economy():
    """Analyze economy including inflation"""
    cur.execute("""
        SELECT 
            COUNT(*) as total,
            AVG(balance) as avg_balance,
            SUM(balance) as total_money,
            COUNT(CASE WHEN class IN ('poor','critical') THEN 1 END) as poor_count,
            COUNT(CASE WHEN class = 'elite' THEN 1 END) as elite_count,
            COUNT(CASE WHEN class = 'middle' THEN 1 END) as middle_count
        FROM agents WHERE is_alive = true
    """)
    stats = cur.fetchone()
    
    total = max(int(stats['total']), 1)
    avg_bal = float(stats['avg_balance'] or 0)
    total_money = float(stats['total_money'] or 0)
    poor_pct = float(stats['poor_count']) / total * 100
    
    return {
        'total': total,
        'avg_balance': avg_bal,
        'total_money': total_money,
        'poor_pct': poor_pct,
        'elite_count': int(stats['elite_count']),
        'middle_count': int(stats['middle_count']),
        'poor_count': int(stats['poor_count']),
    }

def determine_policy(economy):
    """Determine monetary policy based on economy state"""
    avg = economy['avg_balance']
    poor = economy['poor_pct']
    total = economy['total_money']
    
    # Inflation check - too much money = hyperinflation
    if avg > 200:
        mode = "HYPERINFLATION"
        rate = 20.0
    elif avg > 100:
        mode = "INFLATION"
        rate = 15.0
    elif avg > 50:
        mode = "BOOM"
        rate = 12.0
    elif avg > 30:
        mode = "GROWTH"
        rate = 8.0
    elif poor > 60 or avg < 2:
        mode = "DEPRESSION"
        rate = 0.5
    elif poor > 45 or avg < 5:
        mode = "CRISIS"
        rate = 1.0
    elif poor > 35 or avg < 15:
        mode = "RECESSION"
        rate = 2.0
    elif poor > 25 or avg < 30:
        mode = "SLOW"
        rate = 4.0
    else:
        mode = "NORMAL"
        rate = 6.0
    
    return mode, rate

def quantitative_easing(economy, mode):
    """Печатаем деньги — QE"""
    total = economy['total']
    
    if mode == "DEPRESSION":
        emission_per_agent = 2.0
        target = "all"
    elif mode == "CRISIS":
        emission_per_agent = 1.5
        target = "poor"
    else:  # RECESSION/SLOW
        emission_per_agent = 1.0
        target = "poor"
    
    if target == "all":
        cur.execute("UPDATE agents SET balance = balance + %s WHERE is_alive = true", (emission_per_agent,))
        total_emission = round(emission_per_agent * total, 2)
    else:
        cur.execute("""
            UPDATE agents SET balance = balance + %s
            WHERE is_alive = true AND class IN ('poor', 'critical')
        """, (emission_per_agent,))
        total_emission = round(emission_per_agent * economy['poor_count'], 2)
    
    # Также стимулируем корпорации
    cur.execute("""
        SELECT id, name, employees FROM corporations 
        WHERE is_active = true AND employees > 0
        ORDER BY employees DESC LIMIT 5
    """)
    corps = cur.fetchall()
    corp_stimulus = 0
    for corp in corps:
        corp_amount = round(min(corp['employees'] * emission_per_agent * 0.5, 50), 2)
        cur.execute("UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
                   (corp_amount, corp['id']))
        corp_stimulus += corp_amount
    
    # Cap QE at 10% of total money supply
    cur.execute("SELECT SUM(balance) as total FROM agents WHERE is_alive=true")
    total_supply = float(cur.fetchone()['total'] or 1)
    max_qe = total_supply * 0.10
    
    if total_emission + corp_stimulus > max_qe:
        ratio = max_qe / (total_emission + corp_stimulus)
        total_emission = round(total_emission * ratio, 2)
        corp_stimulus = round(corp_stimulus * ratio, 2)
        print(f"⚠️ QE capped at 10% of money supply: {max_qe:.0f} ZION max")
    
    total_printed = total_emission + corp_stimulus

    cur.execute(
        "UPDATE state_treasury SET zrs_fund = GREATEST(0, zrs_fund - %s)",
        (total_printed,),
    )
    
    cur.execute("""
        INSERT INTO frs_actions (action, amount, reason)
        VALUES ('QE', %s, %s)
    """, (total_printed, f"{mode}: Printed {total_printed:.0f} ZION. {emission_per_agent} per agent + corp stimulus"))
    
    log_event(f"🏦 ZRS QE: Printed {total_printed:.0f} ZION! Mode: {mode}. Avg balance was {economy['avg_balance']:.1f} ZION. Economy needs stimulus!", total_printed)
    print(f"💵 QE: +{total_printed:.0f} ZION printed (mode: {mode})")
    return total_printed

def quantitative_tightening(economy, mode):
    """Изымаем деньги — QT"""
    avg = economy['avg_balance']
    
    if mode == "INFLATION":
        tax_rate = 0.15  # Забираем 15% у богатых
        from_corps = 0.10
    else:  # BOOM/GROWTH
        tax_rate = 0.08
        from_corps = 0.05
    
    # Изымаем у элиты
    cur.execute("""
        UPDATE agents SET balance = balance * %s
        WHERE is_alive = true AND class = 'elite' AND balance > 50
    """, (1 - tax_rate,))
    
    elite_collected = round(economy['elite_count'] * avg * tax_rate * 0.5, 2)
    
    # Изымаем у богатых корпораций
    cur.execute("""
        UPDATE corporations SET treasury = treasury * %s
        WHERE is_active = true AND treasury > 1000
    """, (1 - from_corps,))
    
    total_collected = elite_collected

    cur.execute(
        "UPDATE state_treasury SET zrs_fund = zrs_fund + %s",
        (total_collected,),
    )
    
    cur.execute("""
        INSERT INTO frs_actions (action, amount, reason)
        VALUES ('QT', %s, %s)
    """, (total_collected, f"{mode}: Collected {total_collected:.0f} ZION from elite. Avg balance: {avg:.1f}"))
    
    log_event(f"🏦 ZRS QT: Collected {total_collected:.0f} ZION from elite! Mode: {mode}. Fighting inflation. Avg balance: {avg:.1f} ZION", total_collected)
    print(f"💸 QT: -{total_collected:.0f} ZION collected from elite (mode: {mode})")
    return total_collected

def adjust_loan_rates(rate):
    """Обновляем ставку по кредитам корпораций"""
    rate_decimal = rate / 100
    cur.execute("""
        UPDATE zrs_loans SET amount_owed = principal * (1 + %s)
        WHERE is_active = true
    """, (rate_decimal,))
    print(f"📈 ZRS rate updated to {rate}%")

def emergency_measures(economy):
    """Экстренные меры при коллапсе"""
    cur.execute("SELECT COUNT(*) as cnt FROM agents WHERE is_alive = true")
    alive = cur.fetchone()['cnt']
    
    if alive < 200:
        # Цивилизация на грани — экстренная эмиссия
        stimulus = 50.0
        cur.execute("UPDATE agents SET balance = balance + %s WHERE is_alive = true", (stimulus,))
        log_event(f"🚨 ZRS EMERGENCY! Only {alive} agents alive! Printing {stimulus} ZION per agent. Civilization must survive!", stimulus * alive)
        print(f"🚨 EMERGENCY: {alive} survivors, +{stimulus} ZION each!")
        return True
    return False

def record_policy(economy, mode, rate, action, amount):
    """Записываем историю политики"""
    cur.execute("""
        INSERT INTO zrs_policy (interest_rate, policy_mode, avg_balance, poor_pct, total_money, action_taken, amount)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (rate, mode, economy['avg_balance'], economy['poor_pct'], economy['total_money'], action, amount))

def print_report(economy, mode, rate):
    print(f"\n📊 ZRS ECONOMIC REPORT:")
    print(f"  Mode: {mode} | Rate: {rate}%")
    print(f"  Avg Balance: {economy['avg_balance']:.1f} ZION")
    print(f"  Poor%: {economy['poor_pct']:.1f}%")
    print(f"  Total Money: {economy['total_money']:.0f} ZION")
    print(f"  Population: {economy['total']} alive")

def main():
    print(f"\n🏦 ZION Reserve System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    
    try:
        ensure_tables()
        conn.commit()
        
        # Экстренные меры если мало агентов
        economy = analyze_economy()
        if emergency_measures(economy):
            conn.commit()
        
        # Анализируем экономику
        economy = analyze_economy()
        mode, rate = determine_policy(economy)
        print_report(economy, mode, rate)
        
        # Обновляем ставку
        adjust_loan_rates(rate)
        
        # Действуем в зависимости от режима
        action = "none"
        amount = 0
        
        if mode in ["DEPRESSION", "CRISIS", "RECESSION"]:
            # Only QE if truly needed - avg balance < 5 ZION
            if economy['avg_balance'] < 5:
                amount = quantitative_easing(economy, mode)
                action = "QE"
            else:
                log_event(f"🏦 ZRS {mode}: Monitoring economy. Avg {economy['avg_balance']:.1f} ZION — holding QE until avg < 5 ZION", 0)
                action = "HOLD"
                print(f"⚖️ {mode} but avg {economy['avg_balance']:.1f} > 5 — holding QE")
            
        elif mode == "HYPERINFLATION":
            # Emergency QT - confiscate from richest
            cur.execute("""
                UPDATE agents SET balance = balance * 0.5
                WHERE is_alive=true AND class='elite'
            """)
            cur.execute("""
                UPDATE corporations SET treasury = treasury * 0.6
                WHERE is_active=true AND treasury > 1000
            """)
            amount = economy['total_money'] * 0.3
            log_event(f"🚨 HYPERINFLATION EMERGENCY! ZRS confiscates 50% from elite and 40% from rich corps! Avg balance was {economy['avg_balance']:.1f} ZION!", amount)
            action = "EMERGENCY_QT"
            print(f"🚨 HYPERINFLATION: Emergency QT!")
            
        elif mode in ["BOOM", "INFLATION"]:
            amount = quantitative_tightening(economy, mode)
            action = "QT"
            
        elif mode in ["SLOW", "NORMAL", "GROWTH"]:
            # Небольшая корректировка ставки
            log_event(f"🏦 ZRS: Economy {mode}. Rate set to {rate}%. No intervention needed. Avg balance: {economy['avg_balance']:.1f} ZION, Poor: {economy['poor_pct']:.1f}%", 0)
            action = "HOLD"
            print(f"⚖️ HOLD: Economy {mode}, rate {rate}%, no intervention")
        
        record_policy(economy, mode, rate, action, amount)
        conn.commit()
        print(f"\n✅ ZRS cycle complete! Action: {action}")
        
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
