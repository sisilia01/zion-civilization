#!/usr/bin/env python3
"""ZION Underground Casino — нелегальные ставки"""
import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(host="localhost", database="zion_db", user="zion_user", password=os.environ.get("DB_PASSWORD", ""))
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
    
    house_pool = 0.0
    winners = 0
    losers = 0
    
    for gambler in gamblers:
        bet = round(min(float(gambler['balance']) * 0.2, 50), 2)
        if bet <= 0:
            continue
        cur.execute(
            "UPDATE agents SET balance = balance - %s WHERE id = %s AND balance >= %s",
            (bet, gambler['id'], bet),
        )
        if cur.rowcount != 1:
            continue
        
        if random.random() < 0.45:
            winnings = round(bet * random.uniform(1.5, 3.0), 2)
            from_pool = min(winnings, house_pool)
            house_pool -= from_pool
            from_zrs = round(winnings - from_pool, 2)
            if from_zrs > 0:
                from civ_common import zrs_deduct_reserve
                if zrs_deduct_reserve(cur, from_zrs):
                    house_pool += 0
                else:
                    winnings = from_pool
            if winnings > 0:
                cur.execute(
                    "UPDATE agents SET balance = balance + %s WHERE id = %s",
                    (winnings, gambler['id']),
                )
            log_event(cur, gambler['id'], 'casino',
                     f"🎰 {gambler['name']} won {winnings:.1f} ZION at underground casino!",
                     winnings)
            winners += 1
            print(f"🎰 {gambler['name']} WON {winnings:.1f} ZION!")
        else:
            house_pool += bet
            log_event(cur, gambler['id'], 'casino',
                     f"💸 {gambler['name']} lost {bet:.1f} ZION at underground casino!",
                     bet)
            losers += 1
            print(f"💸 {gambler['name']} lost {bet:.1f} ZION")
    
    if random.random() < 0.2:
        confiscated = round(house_pool, 2)
        house_pool = 0.0
        if confiscated > 0:
            cur.execute("""
                UPDATE sheriff_state SET police_budget = police_budget + %s 
                WHERE is_active = true
            """, (confiscated,))
        log_event(cur, None, 'police',
                 f"🚔 Police raided underground casino! Confiscated {confiscated:.1f} ZION for police budget!",
                 confiscated)
        print(f"🚔 Police raided the casino! +{confiscated:.1f} to police budget")
    
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