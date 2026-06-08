#!/usr/bin/env python3
"""
ZION Corporate Political Economy.
Corporations compete for top traders, run on ZION credit (interest + bankruptcy),
poach talent from rivals, and lobby for laws. Creates capital-vs-labor conflict
as a research subject for Track I. Built on existing corporations table.
"""
import psycopg2, psycopg2.extras, random
from datetime import datetime, timezone
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)

CREDIT_INTEREST = 0.05      # 5% per cycle on outstanding ZION credit
SALARY_PREMIUM = 1.4        # corps pay 40% above a trader's own earnings

def ensure_schema():
    conn=db(); cur=conn.cursor()
    cur.execute("ALTER TABLE corporations ADD COLUMN IF NOT EXISTS zion_credit NUMERIC(20,2) DEFAULT 0")
    cur.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS employer_corp_id INTEGER")
    cur.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS corp_salary NUMERIC(20,2) DEFAULT 0")
    cur.execute("""CREATE TABLE IF NOT EXISTS corp_events (
        id SERIAL PRIMARY KEY, corp_id INTEGER, event_type VARCHAR(40),
        detail TEXT, amount NUMERIC(20,2), created_at TIMESTAMP DEFAULT NOW())""")
    conn.commit(); cur.close(); conn.close()

def trader_earnings(cur, agent_id):
    cur.execute("SELECT COALESCE(SUM(pnl),0) FROM agent_trades WHERE agent_id=%s AND status='CLOSED'",(agent_id,))
    return float(cur.fetchone()[0] or 0)

def hire_top_traders():
    """Corporations hire successful traders, paying above their own earnings."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id,name,treasury,zion_credit FROM corporations WHERE is_active=true ORDER BY treasury DESC")
    corps=[dict(r) for r in cur.fetchall()]
    # top traders not yet employed
    cur.execute("""SELECT a.id, a.name, COALESCE(SUM(t.pnl),0) net
        FROM agents a JOIN agent_trades t ON t.agent_id=a.id
        WHERE a.is_alive=true AND a.employer_corp_id IS NULL AND t.status='CLOSED'
        GROUP BY a.id,a.name HAVING COALESCE(SUM(t.pnl),0)>0
        ORDER BY net DESC LIMIT 30""")
    talents=[dict(r) for r in cur.fetchall()]
    cur2=conn.cursor()
    hired=0
    # Each corp hires a few; distribute talents so corps compete (round-robin by wealth)
    eligible=[c for c in corps if float(c['treasury'])>100]
    if not eligible:
        conn.commit(); cur.close(); cur2.close(); conn.close()
        print("[corp] no corp can afford hiring"); return
    ci=0
    for t in talents:
        corp = eligible[ci % len(eligible)]
        ci+=1
        # salary scales with trader's proven net + corp wealth, with premium
        base = max(5.0, float(t['net'])*0.1)
        wealth_bonus = min(float(corp['treasury'])/1000.0, 10.0)
        salary = round((base + wealth_bonus)*SALARY_PREMIUM, 2)
        cur2.execute("UPDATE agents SET employer_corp_id=%s, corp_salary=%s WHERE id=%s",
                     (corp['id'],salary,t['id']))
        cur2.execute("INSERT INTO corp_events (corp_id,event_type,detail,amount) VALUES (%s,%s,%s,%s)",
                     (corp['id'],'hire',f"Hired top trader {t['name']} (net {t['net']:.1f}) at salary {salary}",salary))
        hired+=1
    conn.commit(); cur.close(); cur2.close(); conn.close()
    print(f"[corp] hired {hired} top traders distributed across {len(eligible)} corporations")

def poach_talent():
    """Rich corps poach successful employees from rivals (talent war)."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id,name,treasury FROM corporations WHERE is_active=true AND treasury>500 ORDER BY treasury DESC LIMIT 5")
    rich=[dict(r) for r in cur.fetchall()]
    poached=0
    cur2=conn.cursor()
    for corp in rich:
        # find an employed top trader at a poorer corp
        cur.execute("""SELECT a.id,a.name,a.corp_salary,a.employer_corp_id FROM agents a
            WHERE a.employer_corp_id IS NOT NULL AND a.employer_corp_id<>%s AND a.is_alive=true
            ORDER BY RANDOM() LIMIT 1""",(corp['id'],))
        target=cur.fetchone()
        if target and random.random()<0.5:
            new_salary=round(float(target['corp_salary'] or 5)*1.3,2)
            cur2.execute("UPDATE agents SET employer_corp_id=%s, corp_salary=%s WHERE id=%s",
                         (corp['id'],new_salary,target['id']))
            cur2.execute("INSERT INTO corp_events (corp_id,event_type,detail,amount) VALUES (%s,%s,%s,%s)",
                         (corp['id'],'poach',f"Poached {target['name']} from corp {target['employer_corp_id']} (+30% salary)",new_salary))
            poached+=1
    conn.commit(); cur.close(); cur2.close(); conn.close()
    print(f"[corp] poached {poached} traders between corporations")

def service_credit_and_bankruptcy():
    """Corps pay interest on ZION credit; insolvent corps go bankrupt."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id,name,treasury,zion_credit FROM corporations WHERE is_active=true")
    corps=[dict(r) for r in cur.fetchall()]
    cur2=conn.cursor()
    bankrupt=0
    for c in corps:
        credit=float(c['zion_credit'] or 0)
        treasury=float(c['treasury'] or 0)
        if credit>0:
            interest=round(credit*CREDIT_INTEREST,2)
            treasury-=interest
            cur2.execute("UPDATE corporations SET treasury=%s WHERE id=%s",(treasury,c['id']))
            cur2.execute("INSERT INTO corp_events (corp_id,event_type,detail,amount) VALUES (%s,%s,%s,%s)",
                         (c['id'],'interest',f"Paid {interest:.1f} interest on ZION credit",interest))
        # bankruptcy: negative treasury and owes credit
        if treasury<0 and credit>0:
            cur2.execute("UPDATE corporations SET is_active=false WHERE id=%s",(c['id'],))
            cur2.execute("UPDATE agents SET employer_corp_id=NULL, corp_salary=0 WHERE employer_corp_id=%s",(c['id'],))
            cur2.execute("INSERT INTO corp_events (corp_id,event_type,detail,amount) VALUES (%s,%s,%s,%s)",
                         (c['id'],'bankruptcy',f"{c['name']} went bankrupt — could not service ZION credit",credit))
            bankrupt+=1
    conn.commit(); cur.close(); cur2.close(); conn.close()
    print(f"[corp] credit serviced | {bankrupt} corporations went bankrupt")

def run_cycle():
    ensure_schema()
    hire_top_traders()
    poach_talent()
    service_credit_and_bankruptcy()
    print("[corp] corporate political economy cycle complete")

if __name__=="__main__":
    run_cycle()
