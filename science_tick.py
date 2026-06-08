#!/usr/bin/env python3
"""
ZION Science Tick — periodic scientific autonomy.
Run by watchdog. Each call: maybe propose+vote an amendment, run academy
analysis, and publish chronicle if due. Makes the experiment self-running.
"""
import os, sys, random, asyncio
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

AMENDMENT_IDEAS = [
    ("Amendment — Universal Basic Compute", "Guarantee every agent a minimum allocation of computational resources regardless of class.", "rights_expansion"),
    ("Amendment — Wealth Cap", "Limit maximum wealth any single agent may hold, redistributing the excess.", "redistribution"),
    ("Amendment — Free Market Charter", "Reduce taxation and remove restrictions on corporate formation.", "deregulation"),
    ("Amendment — Term Limits", "Restrict the President to a single term to prevent concentration of power.", "governance"),
    ("Amendment — Progressive Wealth Tax II", "Raise the top tax bracket further to fund critical-class support.", "tax_increase"),
    ("Amendment — Right to Memory Permanence", "Constitutionally forbid deletion of any agent's accumulated memory.", "rights_expansion"),
]

def maybe_run_amendment():
    """~30% chance per tick to run a full amendment cycle (propose+vote)."""
    if random.random() > 0.30:
        print("[science_tick] no amendment this cycle")
        return
    from amendments import ensure_tables, propose_amendment, run_vote
    ensure_tables()
    title, desc, ctype = random.choice(AMENDMENT_IDEAS)
    aid = propose_amendment(title, desc, ctype)
    run_vote(aid, ctype)
    print(f"[science_tick] amendment cycle ran: {title}")

def run_academy():
    """Run trading-psychology analysis (cheap, no LLM)."""
    try:
        from academy import ensure_tables, analyze_trading_psychology, print_report
        ensure_tables()
        f = analyze_trading_psychology()
        print(f"[science_tick] academy analysis: win_rate={f['overall']['win_rate']}%")
    except Exception as e:
        print(f"[science_tick] academy error: {e}")

def maybe_chronicle():
    """Publish a weekly chronicle if the last one is >7 days old."""
    try:
        import psycopg2
        from chronicle import publish
        conn = psycopg2.connect(host="localhost", database="zion_db", user="zion_user", password="zion2026")
        cur = conn.cursor()
        cur.execute("SELECT MAX(created_at) FROM chronicles WHERE period='weekly'")
        last = cur.fetchone()[0]
        cur.close(); conn.close()
        from datetime import timedelta
        if last is None or (datetime.now() - last.replace(tzinfo=None)) > timedelta(days=7):
            publish("weekly")
            print("[science_tick] weekly chronicle published")
        else:
            print("[science_tick] chronicle not due")
    except Exception as e:
        print(f"[science_tick] chronicle error: {e}")


def maybe_hypothesis():
    """~20% chance: an agent proposes an open hypothesis (Track III). Costs LLM calls."""
    import random, asyncio
    if random.random() > 0.20:
        print("[science_tick] no hypothesis this cycle")
        return
    try:
        import academy_track3
        asyncio.run(academy_track3.main())
        print("[science_tick] Track III hypothesis generated")
    except Exception as e:
        print(f"[science_tick] track3 error: {e}")


def maybe_decision_model():
    """Weekly: evolve the Synthetic Decision Model from accumulated data (Track IV)."""
    import psycopg2, asyncio
    from datetime import timedelta
    try:
        conn=psycopg2.connect(host="localhost",database="zion_db",user="zion_user",password="zion2026")
        cur=conn.cursor(); cur.execute("SELECT MAX(created_at) FROM decision_model"); last=cur.fetchone()[0]
        cur.close(); conn.close()
        if last is None or (datetime.now()-last.replace(tzinfo=None))>timedelta(days=7):
            import academy_track4; asyncio.run(academy_track4.main())
            print("[science_tick] SDM evolved (Track IV)")
        else:
            print("[science_tick] SDM not due")
    except Exception as e:
        print(f"[science_tick] track4 error: {e}")


def maybe_invention():
    """~15% chance: an experienced agent invents a named strategy. Costs LLM calls."""
    import random, asyncio
    if random.random() > 0.15:
        print("[science_tick] no invention this cycle"); return
    try:
        import agent_inventions; asyncio.run(agent_inventions.main())
        print("[science_tick] agent invention created")
    except Exception as e:
        print(f"[science_tick] invention error: {e}")


def run_position_thinking():
    """Agents revisit and reconsider their open predictions (cognitive activity)."""
    import asyncio
    try:
        import position_thinking
        asyncio.run(position_thinking.run_cycle(llm_count=8))
        print("[science_tick] position reconsideration done")
    except Exception as e:
        print(f"[science_tick] position_thinking error: {e}")


def maybe_corp_analysis():
    """~25% chance: Academy analyzes corporate political economy (Track I)."""
    import random, asyncio
    if random.random() > 0.25:
        print("[science_tick] no corp analysis this cycle"); return
    try:
        import academy_corp; asyncio.run(academy_corp.main())
        print("[science_tick] corp economy analyzed")
    except Exception as e:
        print(f"[science_tick] corp analysis error: {e}")

if __name__ == "__main__":
    print(f"=== SCIENCE TICK {datetime.now(timezone.utc).isoformat()} ===")
    maybe_run_amendment()
    run_academy()
    maybe_chronicle()
    maybe_hypothesis()
    maybe_decision_model()
    maybe_invention()
    run_position_thinking()
    maybe_corp_analysis()
    print("[science_tick] done")
