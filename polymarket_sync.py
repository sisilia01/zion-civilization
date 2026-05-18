#!/usr/bin/env python3
"""
Sync top Polymarket markets into ZionBet
Pulls real questions + odds from Polymarket Gamma API
"""
import urllib.request
import json
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone

POLYMARKET_API = "https://gamma-api.polymarket.com"

conn = psycopg2.connect(
    host="localhost", database="zion_db",
    user="zion_user", password="zion2026"
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def ensure_table():
    cur.execute("""
        CREATE TABLE IF NOT EXISTS polymarket_markets (
            id SERIAL PRIMARY KEY,
            market_id TEXT UNIQUE,
            question TEXT,
            category TEXT,
            yes_price DECIMAL(5,2),
            no_price DECIMAL(5,2),
            volume DECIMAL(20,2),
            end_date TIMESTAMP,
            is_active BOOLEAN DEFAULT true,
            synced_at TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()

def fetch_top_markets(limit=20, category=None):
    url = f"{POLYMARKET_API}/markets?active=true&limit={limit}&order=volume&ascending=false"
    if category:
        url += f"&tag={category}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ZionBet/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Error fetching: {e}")
        return []

def sync_markets():
    markets = fetch_top_markets(30)
    synced = 0
    skipped = 0
    
    for m in markets:
        question = m.get('question', '')
        market_id = str(m.get('id', ''))
        
        # Skip bad markets
        if not question or len(question) < 10:
            skipped += 1
            continue
        if any(skip in question.lower() for skip in ['set 1', 'map 1', 'map 2', 'game 1', 'spread:', 'odd/even', 'completed match']):
            skipped += 1
            continue
        
        # Parse prices
        try:
            prices = json.loads(m.get('outcomePrices', '[0.5, 0.5]'))
            yes_price = round(float(prices[0]) * 100)
            no_price = 100 - yes_price
        except:
            yes_price = 50
            no_price = 50
        
        # Skip obvious settled markets
        if yes_price >= 99 or yes_price <= 1:
            skipped += 1
            continue
        
        volume = float(m.get('volume', 0) or 0)
        
        # Categorize
        q_lower = question.lower()
        if any(w in q_lower for w in ['btc', 'eth', 'bitcoin', 'crypto', 'sui', 'token', 'price', 'usd']):
            category = 'crypto'
        elif any(w in q_lower for w in ['election', 'president', 'minister', 'senator', 'vote', 'poll']):
            category = 'politics'
        elif any(w in q_lower for w in ['win', 'match', 'game', 'championship', 'tournament', 'nba', 'nfl', 'ufc', 'f1', 'wimbledon', 'roland']):
            category = 'sports'
        else:
            category = 'events'
        
        cur.execute("""
            INSERT INTO polymarket_markets 
                (market_id, question, category, yes_price, no_price, volume, synced_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (market_id) DO UPDATE SET
                yes_price = EXCLUDED.yes_price,
                no_price = EXCLUDED.no_price,
                volume = EXCLUDED.volume,
                synced_at = NOW()
        """, (market_id, question, category, yes_price, no_price, volume))
        synced += 1
    
    conn.commit()
    print(f"✅ Synced {synced} markets | Skipped {skipped}")
    
    # Show what we got
    cur.execute("SELECT category, COUNT(*) as cnt FROM polymarket_markets WHERE is_active=true GROUP BY category")
    for r in cur.fetchall():
        print(f"  {r['category']}: {r['cnt']} markets")
    
    cur.execute("SELECT question, yes_price, category FROM polymarket_markets WHERE is_active=true ORDER BY volume DESC LIMIT 10")
    print("\nTop 10 markets:")
    for r in cur.fetchall():
        print(f"  [{r['category']}] YES {r['yes_price']}¢ | {r['question'][:60]}")

if __name__ == "__main__":
    print(f"🔄 Polymarket sync — {datetime.now().strftime('%H:%M')}")
    ensure_table()
    sync_markets()
    cur.close()
    conn.close()
