#!/usr/bin/env python3
"""
Vulnerability pattern library — grows via book-educated agents (data only).

SAFE DAILY IMPROVEMENT: agents expand DETECTION KNOWLEDGE only.
They never rewrite scanner code — only propose new patterns (name, description, hint).
The stable security_audit.py code reads this table at scan time.
"""
from __future__ import annotations

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

import psycopg2
import psycopg2.extras

from agent_knowledge import apply_knowledge_to_decision
from hacker_agents import select_security_experts
from local_llm import generate_local

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

OLLAMA_TIMEOUT = 30

CLASSIC_PATTERNS = [
    (
        "reentrancy",
        "External interaction before state is finalized; attacker re-enters and drains funds.",
        "external call before state update; transfer before balance; callback before lock; reentrant",
        "SECURITY",
        None,
    ),
    (
        "integer_overflow",
        "Unchecked arithmetic wraps (Move u64 / Python large ints) causing logic bypass.",
        "overflow; underflow; unchecked add; u64 +; saturating; wrapping_add",
        "SECURITY",
        None,
    ),
    (
        "access_control",
        "Privileged action callable without proper authorization checks.",
        "missing only_owner; public entry fun; no assert sender; unauthorized admin; lacks auth",
        "SECURITY",
        None,
    ),
    (
        "unchecked_external_call",
        "External call return value or failure not checked; silent failure or griefing.",
        "unchecked call; ignore return; call without assert; unwrap without check",
        "BLOCKCHAIN",
        None,
    ),
    (
        "sql_injection",
        "User input concatenated into SQL instead of parameterized queries.",
        "f-string sql; execute(f; format sql; % interpolation query; cursor.execute(f",
        "SECURITY",
        None,
    ),
    (
        "hardcoded_secret",
        "Credentials, API keys, or seeds embedded in source code.",
        "password=; api_key=; secret=; token=; private_key; ZION_LANG_SEED hardcoded",
        "SECURITY",
        None,
    ),
    (
        "unsafe_deserialization",
        "Untrusted data deserialized into executable objects (pickle, yaml.load).",
        "pickle.loads; yaml.load(; marshal.loads; eval deserialized",
        "SECURITY",
        None,
    ),
    (
        "command_injection",
        "Shell invoked with attacker-influenced arguments.",
        "shell=True; os.system(; subprocess call shell; popen(",
        "SECURITY",
        None,
    ),
    (
        "missing_input_validation",
        "User-controlled input used without bounds or type checks.",
        "no validation; trust user input; raw request; unvalidated param",
        "SECURITY",
        None,
    ),
    (
        "tx_origin_auth",
        "Using tx_context::sender() incorrectly or tx origin for authorization (phishing).",
        "tx_origin; sender() == without capability; origin authentication",
        "BLOCKCHAIN",
        None,
    ),
    (
        "front_running",
        "Predictable ordering or public mempool exposure enables MEV/sniping.",
        "public mempool; predictable price; sandwich; frontrun; slippage unbounded",
        "BLOCKCHAIN",
        None,
    ),
    (
        "denial_of_service",
        "Unbounded loop, storage blow-up, or gas griefing.",
        "unbounded loop; while true; vector push unbounded; gas grief",
        "SECURITY",
        None,
    ),
    (
        "oracle_manipulation",
        "Single-source price/oracle trusted without staleness or TWAP checks.",
        "single oracle; spot price; no staleness; price feed without check",
        "BLOCKCHAIN",
        None,
    ),
    (
        "integer_truncation",
        "Division or cast truncates value, leaking dust or breaking invariants.",
        "division before multiply; cast u64; truncation; round down leak",
        "SECURITY",
        None,
    ),
    (
        "replay_attack",
        "Missing nonce/chain-id allows replaying signed messages or txs.",
        "no nonce; missing chain_id; replay; duplicate signature",
        "BLOCKCHAIN",
        None,
    ),
    (
        "tls_verification_disabled",
        "HTTPS client skips certificate verification.",
        "verify=False; CERT_NONE; ssl bypass; check_hostname False",
        "SECURITY",
        None,
    ),
    (
        "path_traversal",
        "File paths built from user input without normalization.",
        "../; path.join user; open(request; traversal",
        "SECURITY",
        None,
    ),
    (
        "race_condition",
        "TOCTOU between check and use on shared mutable state.",
        "check then act; TOCTOU; race; concurrent without lock",
        "SECURITY",
        None,
    ),
    (
        "move_capability_leak",
        "Move capability or hot potato not consumed; object left dangling.",
        "hot potato; capability leak; forget to destroy; balance left",
        "BLOCKCHAIN",
        None,
    ),
    (
        "unchecked_return",
        "Critical function return value ignored (Move abort or Python error swallowed).",
        "ignore result; pass without check; except pass; swallow error",
        "SECURITY",
        None,
    ),
]


def db():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute("SET lock_timeout = '8s'")
    cur.execute("SET statement_timeout = '30s'")
    cur.close()
    return conn


def ensure_schema(cur) -> None:
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vuln_patterns (
                id SERIAL PRIMARY KEY,
                pattern_name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT NOT NULL,
                detection_hint TEXT NOT NULL,
                coined_by_agent INTEGER,
                track VARCHAR(50) DEFAULT 'SECURITY',
                created_at TIMESTAMP DEFAULT NOW()
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_vuln_patterns_name ON vuln_patterns(pattern_name)"
        )
    except psycopg2.errors.LockNotAvailable:
        cur.connection.rollback()


def seed_classic_patterns() -> int:
    """Idempotent seed of classic vulnerability patterns."""
    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    inserted = 0
    for name, desc, hint, track, agent in CLASSIC_PATTERNS:
        cur.execute(
            """
            INSERT INTO vuln_patterns
                (pattern_name, description, detection_hint, coined_by_agent, track)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (pattern_name) DO NOTHING
            """,
            (name, desc, hint, agent, track),
        )
        inserted += cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return inserted


def load_all_patterns() -> list[dict]:
    """All patterns for Tier-1 scanning."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    conn.commit()
    cur.execute(
        """
        SELECT id, pattern_name, description, detection_hint, track, coined_by_agent
        FROM vuln_patterns ORDER BY id
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def _hint_keywords(hint: str) -> list[str]:
    parts = re.split(r"[;,|]", hint.lower())
    return [p.strip() for p in parts if len(p.strip()) >= 4]


def match_patterns_in_code(content: str, path: Path | None = None) -> list[dict]:
    """
    Check code against ALL vuln_patterns detection hints (keyword + optional REGEX:).
    Used by security_audit.py Tier-1 — grows as agents coin new patterns.
    """
    path = path or Path("unknown")
    patterns = load_all_patterns()
    if not patterns:
        seed_classic_patterns()
        patterns = load_all_patterns()

    lines = content.splitlines()
    flags: list[dict] = []
    content_lower = content.lower()

    for pat in patterns:
        name = pat["pattern_name"]
        hint = pat["detection_hint"] or ""
        matched_line = 0
        matched_snippet = ""

        regex_m = re.search(r"REGEX:\s*(`([^`]+)`|(\S+))", hint, re.IGNORECASE)
        if regex_m:
            rx = regex_m.group(2) or regex_m.group(3)
            try:
                for i, line in enumerate(lines, 1):
                    if re.search(rx, line, re.IGNORECASE):
                        matched_line = i
                        start = max(0, i - 2)
                        end = min(len(lines), i + 2)
                        matched_snippet = "\n".join(lines[start:end])
                        break
            except re.error:
                pass

        if not matched_snippet:
            for kw in _hint_keywords(hint):
                if kw in content_lower:
                    for i, line in enumerate(lines, 1):
                        if kw in line.lower():
                            matched_line = i
                            start = max(0, i - 2)
                            end = min(len(lines), i + 2)
                            matched_snippet = "\n".join(lines[start:end])
                            break
                    if matched_snippet:
                        break

        if matched_snippet:
            severity = "medium"
            if name in ("hardcoded_secret", "reentrancy", "sql_injection", "command_injection"):
                severity = "high"
            flags.append(
                {
                    "line": matched_line,
                    "vuln_type": name,
                    "severity": severity,
                    "snippet": matched_snippet[:800],
                    "reason": f"pattern library [{name}]: {pat['description'][:200]}",
                    "pattern_id": pat["id"],
                }
            )

    return flags


def _parse_proposal(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, dict) and data.get("pattern_name"):
            return data
    except json.JSONDecodeError:
        pass
    return None


def agents_propose_patterns(batch: int = 3) -> list[dict]:
    """
    Security experts propose NEW detection patterns from book insights (data only).
    Agents never modify code — they expand what the scanner looks for.
    """
    seed_classic_patterns()
    experts = select_security_experts(n=batch)
    if not experts:
        print("[vuln_patterns] no security experts available")
        return []

    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    cur.execute("SELECT pattern_name FROM vuln_patterns")
    existing = {r[0].lower() for r in cur.fetchall()}
    cur.close()
    conn.close()

    coined: list[dict] = []
    for ex in experts:
        agent_id = ex["agent_id"]
        insights = apply_knowledge_to_decision(agent_id, context="security")
        knowledge_block = ""
        if insights:
            knowledge_block = f"Your security knowledge from study:\n{insights}\n\n"

        prompt = (
            f"{knowledge_block}"
            "You are a ZION security expert. Propose ONE new vulnerability DETECTION pattern "
            "(data only — not code). It must be distinct from classic bugs.\n"
            f"Already known patterns (do NOT repeat): {', '.join(sorted(existing)[:40])}\n\n"
            "Respond ONLY JSON:\n"
            '{"pattern_name":"snake_case_name","description":"what the vuln is",'
            '"detection_hint":"comma-separated keywords or REGEX:`pattern` to search in code"}'
        )

        raw = None
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                fut = pool.submit(generate_local, prompt, 220)
                raw = fut.result(timeout=OLLAMA_TIMEOUT)
        except (FuturesTimeout, Exception):
            raw = None

        proposal = _parse_proposal(raw or "")
        if not proposal:
            continue

        name = re.sub(r"[^a-z0-9_]", "_", proposal["pattern_name"].lower().strip())[:80]
        if not name or name in existing:
            continue

        desc = str(proposal.get("description", ""))[:500]
        hint = str(proposal.get("detection_hint", ""))[:400]
        if not desc or not hint:
            continue

        track = "BLOCKCHAIN" if any(
            w in desc.lower() + hint.lower()
            for w in ("move", "sui", "blockchain", "contract", "on-chain", "walrus")
        ) else "SECURITY"

        conn = db()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO vuln_patterns
                    (pattern_name, description, detection_hint, coined_by_agent, track)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (pattern_name) DO NOTHING
                RETURNING id
                """,
                (name, desc, hint, agent_id, track),
            )
            row = cur.fetchone()
            conn.commit()
            if row:
                existing.add(name)
                entry = {
                    "id": row[0],
                    "pattern_name": name,
                    "coined_by_agent": agent_id,
                    "track": track,
                    "description": desc,
                }
                coined.append(entry)
                print(
                    f"[vuln_patterns] agent {agent_id} coined '{name}' ({track})",
                    flush=True,
                )
        except Exception as e:
            conn.rollback()
            print(f"[vuln_patterns] insert failed for {name}: {e}", flush=True)
        finally:
            cur.close()
            conn.close()

    print(f"[vuln_patterns] {len(coined)} new patterns proposed (library size growing)")
    return coined


def list_patterns(limit: int = 30) -> None:
    rows = load_all_patterns()
    print(f"\nVulnerability pattern library: {len(rows)} patterns\n")
    for r in rows[-limit:]:
        agent = r.get("coined_by_agent") or "seed"
        print(f"  [{r['id']}] {r['pattern_name']} ({r['track']}) by agent {agent}")
        print(f"       {r['description'][:100]}")
        print(f"       hint: {r['detection_hint'][:80]}...")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "seed":
        n = seed_classic_patterns()
        total = len(load_all_patterns())
        print(f"[vuln_patterns] seeded {n} new classics; library has {total} patterns")
    elif len(sys.argv) >= 2 and sys.argv[1] == "propose":
        batch = int(sys.argv[2]) if len(sys.argv) > 2 else 3
        agents_propose_patterns(batch=batch)
    elif len(sys.argv) >= 2 and sys.argv[1] == "list":
        list_patterns()
    else:
        print("Usage: python3 vuln_patterns.py seed|propose [batch]|list")
