#!/usr/bin/env python3
"""
Book-educated security expert agents review audit findings.

HUMAN-IN-THE-LOOP: agents advise; they never auto-submit findings anywhere.
Only the human owner decides what (if anything) goes to Immunefi/Sherlock etc.
"""
from __future__ import annotations

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

import psycopg2
import psycopg2.extras

from agent_knowledge import apply_knowledge_to_decision, reward_knowledge_merit
from local_llm import generate_local

OLLAMA_REVIEW_TIMEOUT = 25

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

VALID_REWARD_BOOST = 10  # big merit boost when human marks finding valid


def db():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute("SET lock_timeout = '8s'")
    cur.execute("SET statement_timeout = '30s'")
    cur.close()
    return conn


def ensure_review_schema(cur) -> None:
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS security_finding_reviews (
                id SERIAL PRIMARY KEY,
                finding_id INTEGER NOT NULL,
                agent_id INTEGER NOT NULL,
                agrees BOOLEAN NOT NULL,
                reasoning TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (finding_id, agent_id)
            )
            """
        )
    except psycopg2.errors.LockNotAvailable:
        cur.connection.rollback()


def select_security_experts(n: int = 5) -> list[dict]:
    """Agents with highest SECURITY/BLOCKCHAIN knowledge usefulness."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # Query agent_knowledge only — avoids agents-table lock contention during heavy civ cycles
    cur.execute(
        """
        SELECT agent_id,
               SUM(usefulness_score) AS total_usefulness,
               COUNT(*) AS insight_count
        FROM agent_knowledge
        WHERE track IN ('SECURITY', 'BLOCKCHAIN')
        GROUP BY agent_id
        ORDER BY total_usefulness DESC, insight_count DESC
        LIMIT %s
        """,
        (n,),
    )
    experts = []
    for row in cur.fetchall():
        experts.append(
            {
                "agent_id": row["agent_id"],
                "name": f"agent_{row['agent_id']}",
                "total_usefulness": row["total_usefulness"],
                "insight_count": row["insight_count"],
            }
        )
    cur.close()
    conn.close()
    return experts[:n]


def _get_finding(finding_id: int) -> dict | None:
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, target_file, vuln_type, severity, confidence, description,
               code_snippet, tier_reached, agent_consensus, status
        FROM security_findings WHERE id = %s
        """,
        (finding_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def _parse_review_json(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        agree = "agree" in text.lower() and "disagree" not in text.lower()
        return {"agree": agree, "reasoning": text[:400]}


def agent_reviews_finding(agent_id: int, finding_id: int) -> dict:
    """Expert reviews a finding using book knowledge + local Ollama."""
    finding = _get_finding(finding_id)
    if not finding:
        return {"agent_id": agent_id, "agree": False, "reasoning": "finding not found"}

    insights = apply_knowledge_to_decision(agent_id, context="security")
    knowledge_block = ""
    if insights:
        knowledge_block = f"Your security knowledge from study:\n{insights}\n\n"

    prompt = (
        f"{knowledge_block}"
        f"Review this security finding in ZION's OWN codebase (defensive audit only).\n"
        f"File: {finding['target_file']}\n"
        f"Type: {finding['vuln_type']}\n"
        f"Severity: {finding['severity']}\n"
        f"Confidence: {finding['confidence']}\n"
        f"Description: {finding['description']}\n"
        f"Snippet:\n{finding.get('code_snippet') or ''}\n\n"
        "Do you agree this is a real security concern? "
        'Respond ONLY JSON: {"agree": true|false, "reasoning": "one or two sentences"}'
    )
    raw = None
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            fut = pool.submit(generate_local, prompt, 180)
            raw = fut.result(timeout=OLLAMA_REVIEW_TIMEOUT)
    except (FuturesTimeout, Exception):
        raw = None

    if not raw:
        conf = float(finding.get("confidence") or 0)
        agree = conf >= 0.75
        insight_hint = "book insights applied" if insights else "no security books yet"
        return {
            "agent_id": agent_id,
            "agree": agree,
            "reasoning": (
                f"Fallback review ({insight_hint}): "
                f"{'agree' if agree else 'disagree'} at confidence {conf:.2f}"
            )[:500],
        }

    parsed = _parse_review_json(raw)
    return {
        "agent_id": agent_id,
        "agree": bool(parsed.get("agree")),
        "reasoning": (parsed.get("reasoning") or "no reasoning")[:500],
    }


def consensus_review(finding_id: int, n: int = 5) -> dict:
    """
    Panel of security experts reviews a finding.
    Updates agent_consensus count; sets consensus_verdict (confirmed/disputed).
    status stays 'pending' until human owner reviews (human-in-the-loop).
    """
    experts = select_security_experts(n=n)
    if not experts:
        return {"finding_id": finding_id, "error": "no security experts available"}

    conn = db()
    cur = conn.cursor()
    ensure_review_schema(cur)

    agrees = 0
    reviews: list[dict] = []
    for ex in experts:
        result = agent_reviews_finding(ex["agent_id"], finding_id)
        reviews.append(result)
        if result["agree"]:
            agrees += 1
        cur.execute(
            """
            INSERT INTO security_finding_reviews (finding_id, agent_id, agrees, reasoning)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (finding_id, agent_id) DO UPDATE SET
                agrees = EXCLUDED.agrees,
                reasoning = EXCLUDED.reasoning,
                created_at = NOW()
            """,
            (finding_id, ex["agent_id"], result["agree"], result["reasoning"]),
        )

    verdict = "confirmed" if agrees > len(experts) / 2 else "disputed"
    cur.execute(
        """
        UPDATE security_findings
        SET agent_consensus = %s,
            description = COALESCE(description, '') || %s
        WHERE id = %s
        """,
        (
            agrees,
            f"\n[agent panel {agrees}/{len(experts)} {verdict}]",
            finding_id,
        ),
    )
    conn.commit()
    cur.close()
    conn.close()

    return {
        "finding_id": finding_id,
        "experts": len(experts),
        "agrees": agrees,
        "verdict": verdict,
        "status": "pending",
        "reviews": reviews,
    }


def reward_valid_finding(finding_id: int) -> int:
    """
    Human marked finding valid — big usefulness boost for agents who agreed.
    Strong merit reward: these experts 'live forever with high balance'.
    """
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT agent_id FROM security_finding_reviews
        WHERE finding_id = %s AND agrees = true
        """,
        (finding_id,),
    )
    agent_ids = [r[0] for r in cur.fetchall()]
    cur.execute(
        "UPDATE security_findings SET status = 'valid' WHERE id = %s",
        (finding_id,),
    )
    conn.commit()
    cur.close()
    conn.close()

    rewarded = 0
    for aid in agent_ids:
        conn2 = db()
        cur2 = conn2.cursor()
        cur2.execute(
            """
            UPDATE agent_knowledge SET
                usefulness_score = usefulness_score + %s,
                applied_count = applied_count + 1
            WHERE agent_id = %s AND track IN ('SECURITY', 'BLOCKCHAIN')
            """,
            (VALID_REWARD_BOOST, aid),
        )
        if cur2.rowcount:
            rewarded += 1
        conn2.commit()
        cur2.close()
        conn2.close()
        reward_knowledge_merit(aid, "security")
    return rewarded


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "consensus":
        fid = int(sys.argv[2])
        result = consensus_review(fid)
        print(json.dumps(result, indent=2, default=str))
    elif len(sys.argv) >= 3 and sys.argv[1] == "valid":
        fid = int(sys.argv[2])
        n = reward_valid_finding(fid)
        print(f"Marked finding {fid} valid; rewarded {n} expert agents")
    else:
        print("Usage: python3 hacker_agents.py consensus <finding_id>")
        print("       python3 hacker_agents.py valid <finding_id>")
