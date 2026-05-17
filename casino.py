#!/usr/bin/env python3
"""ZION Underground Casino — нелегальные ставки"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(host="localhost", database="zion_db", user="zion_user", password="zion2026")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute("INSERT INTO events (agent_id, event_type, description, zion_amount) VALUES (%s,%s,%s,%s)",
               (agent_id, event_type, description, amount))

def run_casino(cur):
    # Находим игроков
    cur.execute("""
        SELECT id, name, class, balance FROM agents
        WHERE is_alive = true AND balance > 10
        ORDER BY RANDOM() LIMIT 10
    """)
    gamblers = cur.fetchall()
    
    jackpot = 0
    winners = 0
    losers = 0
    
    for gambler in gamblers:
        bet = round(min(float(gambler['balance']) * 0.2, 50), 2)
        
        # Казино всегда выигрывает в среднем (55% проигрыш)
        if random.random() < 0.45:  # выиграл
            winnings = round(bet * random.uniform(1.5, 3.0), 2)
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                       (winnings, gambler['id']))
            log_event(cur, gambler['id'], 'casino',
                     f"🎰 {gambler['name']} won {winnings:.1f} ZION at underground casino!",
                     winnings)
            winners += 1
            jackpot -= winnings
            print(f"🎰 {gambler['name']} WON {winnings:.1f} ZION!")
        else:  # проиграл
            cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                       (bet, gambler['id']))
            log_event(cur, gambler['id'], 'casino',
                     f"💸 {gambler['name']} lost {bet:.1f} ZION at underground casino!",
                     bet)
            losers += 1
            jackpot += bet
            print(f"💸 {gambler['name']} lost {bet:.1f} ZION")
    
    # Полиция иногда накрывает казино
    if random.random() < 0.2:
        log_event(cur, None, 'police',
                 f"🚔 Police raided underground casino! Confiscated {abs(jackpot):.1f} ZION!",
                 abs(jackpot))
        print(f"🚔 Police raided the casino!")
    
    return winners, losers

def main():
    print(f"\n🎰 ZION Casino — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    try:
        w, l = run_casino(cur)
        conn.commit()
        print(f"✅ Casino complete! Winners: {w} Losers: {l}")
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
