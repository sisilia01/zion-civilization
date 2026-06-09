#!/usr/bin/env python3
"""
ZION Survival & Selection (new core logic).
Evolutionary selection of traders + protection of officials.
- Profitable traders receive a living stipend from the bank (ZRS) -> survive.
- Unprofitable traders receive nothing -> deplete balance -> eventually die.
- Officials receive a salary and are shielded from starvation (they govern).
- Successful traders resist death by old age (success = longevity).
"""
import psycopg2, psycopg2.extras
from amendment_enforcer import get_param
DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")
def db(): return psycopg2.connect(**DB)

LIVING_STIPEND = 5.0
OFFICIAL_SALARY = 50.0
COST_OF_LIVING = 3.0

def get_officials(cur):
    ids=set()
    for tbl in ("president_state", "sheriff_state"):
        try:
            cur.execute(f"SELECT agent_id FROM {tbl} WHERE is_active=true")
            for r in cur.fetchall():
                if r[0]:
                    ids.add(r[0])
        except Exception:
            cur.connection.rollback()
    try:
        cur.execute("SELECT agent_id FROM senate WHERE is_active=true")
        for r in cur.fetchall():
            if r[0]:
                ids.add(r[0])
    except Exception:
        cur.connection.rollback()
    return ids

def run_cycle():
    conn=db(); cur=conn.cursor()
    officials = get_officials(cur)
    cur.execute("""SELECT agent_id, COALESCE(SUM(pnl),0) net_pnl, COUNT(*) trades
        FROM agent_trades WHERE status='CLOSED' GROUP BY agent_id""")
    perf = {r[0]: {"net_pnl": float(r[1]), "trades": r[2]} for r in cur.fetchall()}
    cur.execute("SELECT id, balance FROM agents WHERE is_alive=true")
    agents = cur.fetchall()
    paid_traders=0; paid_officials=0; charged=0
    for aid, bal in agents:
        if aid in officials:
            cur.execute("UPDATE agents SET balance=balance+%s WHERE id=%s",(OFFICIAL_SALARY,aid))
            paid_officials+=1
        else:
            p = perf.get(aid, {"net_pnl":0,"trades":0})
            if p["trades"]>0 and p["net_pnl"]>0:
                cur.execute("UPDATE agents SET balance=balance+%s WHERE id=%s",(LIVING_STIPEND,aid))
                paid_traders+=1
            else:
                cur.execute("UPDATE agents SET balance=balance-%s WHERE id=%s",(COST_OF_LIVING,aid))
                charged+=1
    if get_param("basic_income", 0.0) > 0:
        cur.execute("UPDATE agents SET balance=balance+%s WHERE is_alive=true",
                    (get_param("basic_income", 0.0),))
    conn.commit(); cur.close(); conn.close()
    print(f"[survival] officials paid: {paid_officials} | profitable traders fed: {paid_traders} | charged: {charged}")

if __name__=="__main__":
    run_cycle()
