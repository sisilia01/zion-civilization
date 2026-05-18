#!/usr/bin/env python3
"""
Full Polymarket sync — all categories
Runs every 2 hours via watchdog
"""
import urllib.request, json, psycopg2, psycopg2.extras
from datetime import datetime

POLYMARKET_API = "https://gamma-api.polymarket.com"
conn = psycopg2.connect(host="localhost", database="zion_db", user="zion_user", password="zion2026")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

SKIP_WORDS = [
    'set 1','set 2','map 1','map 2','game 1','game 2',
    'spread:','odd/even','completed match','1st half','2nd half',
    'total kills','total rounds','exact score','quarter final',
    'half time','corner kick','yellow card','red card',
    'first goal','last goal','anytime scorer'
]

def categorize(question):
    q = question.lower()
    if any(w in q for w in ['bitcoin','btc','ethereum','eth','crypto','token','usd','tvl','defi','nft','blockchain','web3','sui','solana','price above','price below','market cap']):
        return 'crypto'
    if any(w in q for w in ['election','president','minister','senator','vote','party','congress','parliament','governor','mayor','campaign','ballot','democrat','republican','trump','biden','harris']):
        return 'politics'
    if any(w in q for w in ['win','champion','playoff','tournament','nba','nfl','ufc','f1','grand prix','wimbledon','roland garros','world cup','premier league','la liga','serie a','bundesliga','nhl','mlb','tennis','formula','race','match','game','score','goals']):
        return 'sports'
    if any(w in q for w in ['war','conflict','military','attack','missile','invasion','ceasefire','nato','ukraine','russia','israel','gaza','china','taiwan','sanctions','troops']):
        return 'geopolitics'
    if any(w in q for w in ['oscar','emmy','grammy','award','movie','film','album','artist','singer','actor','actress','music','box office','spotify','netflix','streaming']):
        return 'culture'
    if any(w in q for w in ['fed','interest rate','inflation','gdp','recession','unemployment','stock','s&p','nasdaq','dow','ipo','earnings','revenue','merger','acquisition','oil','gold','silver']):
        return 'finance'
    if any(w in q for w in ['ai','artificial intelligence','openai','gpt','claude','gemini','elon','spacex','tesla','apple','google','microsoft','amazon','meta','startup','launch','release']):
        return 'tech'
    return 'events'

def is_good(m):
    q = m.get('question','').lower()
    if len(q) < 15: return False
    if any(s in q for s in SKIP_WORDS): return False
    try:
        prices = json.loads(m.get('outcomePrices','[0.5,0.5]'))
        yes = float(prices[0])
        if yes >= 0.97 or yes <= 0.03: return False
    except: pass
    return True

def fetch(limit=100, offset=0):
    url = f"{POLYMARKET_API}/markets?active=true&limit={limit}&offset={offset}&order=volume&ascending=false"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ZionBet/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  Fetch error: {e}")
        return []

def sync():
    # Деактивируем старые
    cur.execute("UPDATE polymarket_markets SET is_active=false WHERE synced_at < NOW() - INTERVAL '6 hours'")
    
    all_markets = []
    for offset in [0, 100, 200]:
        batch = fetch(100, offset)
        if not batch: break
        all_markets.extend(batch)
        print(f"  Fetched {len(all_markets)} total...")
    
    good = [m for m in all_markets if is_good(m)]
    print(f"  Good markets: {len(good)}/{len(all_markets)}")
    
    synced = 0
    for m in good[:150]:
        try:
            prices = json.loads(m.get('outcomePrices','[0.5,0.5]'))
            yes = round(float(prices[0]) * 100)
            no = 100 - yes
        except:
            yes, no = 50, 50
        
        end_date = None
        for field in ['endDate','end_date_iso','endDateIso']:
            val = m.get(field)
            if val:
                try:
                    end_date = datetime.fromisoformat(val.replace('Z','+00:00'))
                    break
                except: pass
        
        vol = float(m.get('volume', 0) or 0)
        question = m.get('question','')
        cat = categorize(question)
        mid = str(m.get('id',''))
        
        cur.execute("""
            INSERT INTO polymarket_markets 
                (market_id, question, category, yes_price, no_price, volume, end_date, is_active, synced_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, true, NOW())
            ON CONFLICT (market_id) DO UPDATE SET
                yes_price=EXCLUDED.yes_price,
                no_price=EXCLUDED.no_price,
                volume=EXCLUDED.volume,
                end_date=EXCLUDED.end_date,
                is_active=true,
                synced_at=NOW()
        """, (mid, question, cat, yes, no, vol, end_date))
        synced += 1
    
    conn.commit()
    
    print(f"\n✅ Synced {synced} markets")
    cur.execute("""
        SELECT category, COUNT(*) as cnt 
        FROM polymarket_markets WHERE is_active=true 
        GROUP BY category ORDER BY cnt DESC
    """)
    total = 0
    for r in cur.fetchall():
        print(f"  {r['category']:15} {r['cnt']}")
        total += r['cnt']
    print(f"  {'TOTAL':15} {total}")

if __name__ == "__main__":
    print(f"🔄 Polymarket sync — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    sync()
    cur.close()
    conn.close()
