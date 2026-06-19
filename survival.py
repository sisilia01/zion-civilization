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
import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}
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

CLASS_LADDER = ("critical", "poor", "working", "middle", "rich", "elite")


def _knowledge_scores(cur):
    try:
        cur.execute(
            """
            SELECT agent_id, COALESCE(SUM(usefulness_score), 0) AS score
            FROM agent_knowledge
            GROUP BY agent_id
            """
        )
        return {r[0]: float(r[1]) for r in cur.fetchall()}
    except Exception:
        cur.connection.rollback()
        return {}


def _maybe_promote_class(cur, agent_id, usefulness_score):
    if usefulness_score < 25:
        return
    cur.execute("SELECT class FROM agents WHERE id=%s AND is_alive=true", (agent_id,))
    row = cur.fetchone()
    if not row:
        return
    cls = (row[0] or "poor").lower()
    if cls not in CLASS_LADDER:
        return
    idx = CLASS_LADDER.index(cls)
    if idx < len(CLASS_LADDER) - 1 and usefulness_score >= 25 * (idx + 1):
        new_cls = CLASS_LADDER[idx + 1]
        cur.execute("UPDATE agents SET class=%s WHERE id=%s", (new_cls, agent_id))


def run_cycle():
    conn=db(); cur=conn.cursor()
    officials = get_officials(cur)
    knowledge = _knowledge_scores(cur)
    cur.execute("""SELECT agent_id, COALESCE(SUM(pnl),0) net_pnl, COUNT(*) trades
        FROM agent_trades WHERE status='CLOSED' GROUP BY agent_id""")
    perf = {r[0]: {"net_pnl": float(r[1]), "trades": r[2]} for r in cur.fetchall()}
    cur.execute("SELECT id, balance FROM agents WHERE is_alive=true")
    agents = cur.fetchall()
    paid_traders=0; paid_officials=0; charged=0; knowledge_bonuses=0
    for aid, bal in agents:
        usefulness = knowledge.get(aid, 0.0)
        knowledge_bonus = min(usefulness * 0.5, 20.0)
        if aid in officials:
            cur.execute("UPDATE agents SET balance=balance+%s WHERE id=%s",(OFFICIAL_SALARY,aid))
            paid_officials+=1
        else:
            p = perf.get(aid, {"net_pnl":0,"trades":0})
            if p["trades"]>0 and p["net_pnl"]>0:
                stipend = LIVING_STIPEND + knowledge_bonus
                cur.execute("UPDATE agents SET balance=balance+%s WHERE id=%s",(stipend,aid))
                paid_traders+=1
                if knowledge_bonus > 0:
                    knowledge_bonuses += 1
            else:
                cur.execute("UPDATE agents SET balance=balance-%s WHERE id=%s",(COST_OF_LIVING,aid))
                charged+=1
        if knowledge_bonus > 0:
            _maybe_promote_class(cur, aid, usefulness)
    if get_param("basic_income", 0.0) > 0:
        cur.execute("UPDATE agents SET balance=balance+%s WHERE is_alive=true",
                    (get_param("basic_income", 0.0),))
    conn.commit(); cur.close(); conn.close()
    print(
        f"[survival] officials paid: {paid_officials} | profitable traders fed: {paid_traders} "
        f"| knowledge bonuses: {knowledge_bonuses} | charged: {charged}"
    )

if __name__=="__main__":
    run_cycle()
