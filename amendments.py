#!/usr/bin/env python3
"""
ZION Amendment Voting System (Article VII)
Agents propose and vote on constitutional amendments.
Deterministic vote counting + Merkle root proof for on-chain recording.
"""
import os, json, hashlib, random
import psycopg2, psycopg2.extras
from datetime import datetime, timezone

DB = dict(host="localhost", database="zion_db", user="zion_user", password="zion2026")

def db():
    return psycopg2.connect(**DB)

def ensure_tables():
    conn = db(); cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS amendments (
            id SERIAL PRIMARY KEY,
            proposal_number INTEGER,
            title VARCHAR(200),
            description TEXT,
            change_type VARCHAR(50),
            proposed_by INTEGER,
            status VARCHAR(20) DEFAULT 'voting',
            votes_for INTEGER DEFAULT 0,
            votes_against INTEGER DEFAULT 0,
            votes_abstain INTEGER DEFAULT 0,
            merkle_root VARCHAR(64),
            blob_id VARCHAR(100),
            sui_tx VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW(),
            closed_at TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS amendment_votes (
            id SERIAL PRIMARY KEY,
            amendment_id INTEGER,
            agent_id INTEGER,
            agent_name VARCHAR(50),
            vote VARCHAR(10),
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(amendment_id, agent_id)
        )
    """)
    conn.commit(); cur.close(); conn.close()

def merkle_root(leaves: list[str]) -> str:
    """Build a Merkle root from vote leaves (deterministic, verifiable)."""
    if not leaves:
        return hashlib.sha256(b"empty").hexdigest()
    layer = [hashlib.sha256(l.encode()).hexdigest() for l in leaves]
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        layer = [hashlib.sha256((layer[i]+layer[i+1]).encode()).hexdigest()
                 for i in range(0, len(layer), 2)]
    return layer[0]

def propose_amendment(title, description, change_type, proposed_by=None):
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT COALESCE(MAX(proposal_number),0)+1 FROM amendments")
    num = cur.fetchone()[0]
    cur.execute("""INSERT INTO amendments (proposal_number, title, description, change_type, proposed_by)
                   VALUES (%s,%s,%s,%s,%s) RETURNING id""",
                (num, title, description, change_type, proposed_by))
    aid = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()
    print(f"Amendment #{num} proposed: {title} (id={aid})")
    return aid

def agent_decides(agent, change_type) -> str:
    """Realistic vote model: personality + class + ideology + faith + trust + fear.
    Produces genuine disagreement, not unanimity."""
    ambition = agent.get('ambition', 50)
    loyalty = agent.get('loyalty', 50)
    aggression = agent.get('aggression', 50)
    intelligence = agent.get('intelligence', 10)
    faith = agent.get('faith', 50)
    cls = agent.get('class', 'working')
    aid = agent['id']

    # Each agent has a stable ideological leaning derived from traits (reproducible)
    random.seed(aid * 7919)
    # ideology: -100 (collectivist/pro-redistribution) .. +100 (free-market/individualist)
    ideology = (ambition - loyalty) + random.randint(-50, 50)
    # trust in institutions (low trust = resist change from above)
    trust = loyalty + random.randint(-30, 30)
    # fear of consequences (high faith + low intelligence = more cautious)
    fear = faith - intelligence + random.randint(-20, 20)

    score = 0
    # personality baseline toward change
    score += (ambition + aggression - loyalty) * 0.3
    score += intelligence * 1.5

    if change_type in ('tax_increase', 'redistribution', 'rights_expansion'):
        # class interest
        if cls in ('poor', 'critical', 'working'): score += 35
        if cls in ('elite', 'rich'): score -= 50
        # BUT ideology cuts across class: free-market believers oppose even if poor
        score -= ideology * 0.4
        # fear of economic disruption
        score -= fear * 0.3
    if change_type in ('tax_decrease', 'deregulation'):
        if cls in ('elite', 'rich'): score += 45
        if cls in ('poor', 'critical'): score -= 25
        score += ideology * 0.4
    if change_type in ('rights_expansion', 'governance'):
        score += (100 - trust) * 0.2  # distrust of current system favors change

    # personal reproducible noise
    score += random.randint(-30, 30)

    if score > 45: return 'for'
    if score < 15: return 'against'
    # middle zone: genuine uncertainty
    r = random.random()
    if r < 0.35: return 'abstain'
    return 'for' if score >= 30 else 'against'


def run_vote(amendment_id, change_type, sample_limit=None):
    """All eligible agents vote. Deterministic tally + Merkle root."""
    conn = db(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    q = "SELECT id, name, class, ambition, loyalty, aggression, intelligence, faith FROM agents WHERE is_alive=true ORDER BY id"
    if sample_limit:
        q += f" LIMIT {sample_limit}"
    cur.execute(q)
    agents = cur.fetchall()

    votes = []
    tally = {'for':0,'against':0,'abstain':0}
    for a in agents:
        v = agent_decides(a, change_type)
        tally[v] += 1
        votes.append((amendment_id, a['id'], a['name'], v))

    # record individual votes
    cur2 = conn.cursor()
    cur2.executemany("""INSERT INTO amendment_votes (amendment_id, agent_id, agent_name, vote)
                        VALUES (%s,%s,%s,%s) ON CONFLICT (amendment_id, agent_id) DO NOTHING""", votes)

    # Merkle root over canonical vote leaves
    leaves = [f"{aid}:{agid}:{v}" for (aid, agid, name, v) in votes]
    root = merkle_root(leaves)

    cur2.execute("""UPDATE amendments SET votes_for=%s, votes_against=%s, votes_abstain=%s,
                    merkle_root=%s WHERE id=%s""",
                 (tally['for'], tally['against'], tally['abstain'], root, amendment_id))
    conn.commit(); cur.close(); cur2.close(); conn.close()

    total = sum(tally.values())
    pct = (tally['for']/total*100) if total else 0
    print(f"\n=== VOTE COMPLETE — Amendment {amendment_id} ===")
    print(f"  Voters: {total}")
    print(f"  FOR:     {tally['for']} ({pct:.1f}%)")
    print(f"  AGAINST: {tally['against']}")
    print(f"  ABSTAIN: {tally['abstain']}")
    print(f"  Merkle root: {root}")
    print(f"  Passed (>50% for): {'YES' if pct > 50 else 'NO'}")
    return {'tally':tally, 'merkle_root':root, 'passed': pct > 50, 'total': total}

if __name__ == "__main__":
    import sys
    ensure_tables()
    if "--demo" in sys.argv:
        aid = propose_amendment(
            "Amendment I — Progressive Wealth Tax",
            "Establish a higher tax bracket on elite-class accumulated wealth, redistributing to critical-class agents.",
            "tax_increase", proposed_by=None)
        run_vote(aid, "tax_increase")
    else:
        print("ZION Amendment system ready. Run with --demo to test a full vote.")
