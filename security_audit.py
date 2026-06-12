#!/usr/bin/env python3
"""
ZION tiered security audit — bug-bounty-style scanner for OWN code only.

HUMAN-IN-THE-LOOP POLICY (non-negotiable):
- scan_target() accepts LOCAL filesystem paths ONLY (explicitly passed by the human).
- No URLs, no remote hosts, no automatic external scanning.
- All findings remain status='pending' until the human owner reviews them.
- NOTHING is ever auto-submitted to Immunefi, Sherlock, or any bug-bounty program.
  The human alone decides what (if anything) to submit where they are registered.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

from local_llm import generate_local, generate_openrouter

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

# ── Config ──────────────────────────────────────────────────────────────────
FILTER_CONFIDENCE = 0.75
MAX_DEEP_PER_HOUR = 3
DAILY_COST_LIMIT = 0.30
AI_PAUSE_SECONDS = 15

MODEL_FILTER = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")  # Tier 1 — local Ollama
MODEL_REFINE = "deepseek/deepseek-chat-v3-0324"                  # Tier 2
MODEL_DEEP = "anthropic/claude-sonnet-4"                         # Tier 3

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

SKIP_DIRS = {
    ".git", ".next", "node_modules", "__pycache__", "venv", ".venv",
    "build", "dist", "zion_glyphs", "_vendor",
}
SKIP_FILES = {".env"}

HEURISTIC_PATTERNS = [
    (r"\beval\s*\(", "code_injection", "high"),
    (r"\bexec\s*\(", "code_injection", "high"),
    (r"pickle\.loads?\s*\(", "deserialization", "high"),
    (r"subprocess\.[a-z]+\([^)]*shell\s*=\s*True", "command_injection", "high"),
    (r"(password|secret|api_key|token)\s*=\s*['\"][^'\"]{8,}", "hardcoded_secret", "critical"),
    (r"execute\s*\(\s*f?['\"].*%s", "sql_injection", "medium"),
    (r"cursor\.execute\s*\(\s*f['\"]", "sql_injection", "medium"),
    (r"environ\.get\([^)]+,\s*['\"][^'\"]{4,}['\"]\)", "hardcoded_secret", "medium"),
    (r"cur\.execute\s*\(\s*f['\"]", "sql_injection", "medium"),
    (r"verify\s*=\s*False", "tls_bypass", "medium"),
    (r"public\s+entry\s+fun", "move_access", "low"),
    (r"transfer::public_transfer", "move_token", "low"),
]

# Rough $/1K tokens for cost estimation when OpenRouter omits cost
MODEL_COST_PER_1K = {
    MODEL_REFINE: 0.0003,
    MODEL_DEEP: 0.015,
}


def db():
    return psycopg2.connect(**DB)


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS security_findings (
            id SERIAL PRIMARY KEY,
            target_file TEXT NOT NULL,
            vuln_type VARCHAR(80),
            severity VARCHAR(20),
            confidence NUMERIC DEFAULT 0,
            description TEXT,
            code_snippet TEXT,
            tier_reached INTEGER DEFAULT 1,
            agent_consensus INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS security_audit_costs (
            id SERIAL PRIMARY KEY,
            model VARCHAR(80),
            tier INTEGER,
            estimated_cost NUMERIC DEFAULT 0,
            target_file TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def validate_local_path(path: str) -> Path:
    """
    Refuse URLs and non-local targets. Only explicit local filesystem paths allowed.
    """
    raw = (path or "").strip()
    if not raw:
        raise ValueError("Path required")
    lowered = raw.lower()
    if lowered.startswith(("http://", "https://", "ftp://", "s3://", "gs://")):
        raise ValueError(f"REFUSED remote target: {raw} — local paths only")
    if "://" in raw:
        raise ValueError(f"REFUSED non-filesystem target: {raw}")
    resolved = Path(raw).expanduser().resolve()
    if not resolved.exists():
        raise ValueError(f"Path does not exist: {resolved}")
    return resolved


def collect_files(root: Path, limit: int | None = None) -> list[Path]:
    if root.is_file() and root.suffix in (".py", ".move"):
        return [root]
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name in SKIP_FILES:
                continue
            if name.endswith((".py", ".move")):
                files.append(Path(dirpath) / name)
                if limit and len(files) >= limit:
                    return sorted(files)
    return sorted(files)


def _pattern_library_flags(content: str, path: Path) -> list[dict]:
    """Tier-1: agent-grown vuln_patterns library (grows daily via book-educated agents)."""
    try:
        from vuln_patterns import match_patterns_in_code

        return match_patterns_in_code(content, path)
    except Exception as e:
        print(f"[security_audit] pattern library skip: {e}", flush=True)
        return []


def _heuristic_flags(content: str, path: Path) -> list[dict]:
    flags: list[dict] = []
    lines = content.splitlines()
    for i, line in enumerate(lines, 1):
        for pattern, vtype, severity in HEURISTIC_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                start = max(0, i - 2)
                end = min(len(lines), i + 2)
                snippet = "\n".join(lines[start:end])
                flags.append(
                    {
                        "line": i,
                        "vuln_type": vtype,
                        "severity": severity,
                        "snippet": snippet,
                        "reason": f"heuristic match: {pattern}",
                    }
                )
    return flags


def tier1_filter(file_path: Path, content: str) -> list[dict]:
    """Tier 1: pattern library + heuristics + local Ollama high-recall scan."""
    flags = _pattern_library_flags(content, file_path)
    flags.extend(_heuristic_flags(content, file_path))

    pattern_catalog = ""
    try:
        from vuln_patterns import load_all_patterns

        plist = load_all_patterns()
        if plist:
            lines = [
                f"- {p['pattern_name']}: {p['description'][:80]}"
                for p in plist[:35]
            ]
            pattern_catalog = (
                "Known vulnerability patterns to check (from agent library):\n"
                + "\n".join(lines)
                + "\n\n"
            )
    except Exception:
        pass

    chunk = content[:6000]
    prompt = (
        f"You are a security scanner. File: {file_path.name}\n"
        f"{pattern_catalog}"
        "Also look for: SQL/command injection, unsafe eval/exec, hardcoded secrets, "
        "missing access control, unsafe deserialization, reentrancy (Move), integer overflow (Move).\n"
        "List suspicious snippets as JSON array:\n"
        '[{"vuln_type":"...","severity":"low|medium|high|critical","snippet":"...","reason":"..."}]\n'
        "If nothing suspicious, return [].\n\n"
        f"CODE:\n{chunk}"
    )
    raw = generate_local(prompt, max_tokens=400)
    if raw:
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict) and item.get("snippet"):
                        flags.append(
                            {
                                "line": 0,
                                "vuln_type": item.get("vuln_type", "unknown"),
                                "severity": item.get("severity", "low"),
                                "snippet": str(item.get("snippet", ""))[:800],
                                "reason": item.get("reason", "ollama tier1"),
                            }
                        )
        except json.JSONDecodeError:
            if "suspicious" in text.lower() or "vuln" in text.lower():
                flags.append(
                    {
                        "line": 0,
                        "vuln_type": "suspicious",
                        "severity": "low",
                        "snippet": chunk[:400],
                        "reason": text[:300],
                    }
                )
    return flags


def _daily_cost(cur) -> float:
    cur.execute(
        """
        SELECT COALESCE(SUM(estimated_cost), 0)
        FROM security_audit_costs
        WHERE created_at >= CURRENT_DATE
        """
    )
    return float(cur.fetchone()[0] or 0)


def _deep_calls_this_hour(cur) -> int:
    cur.execute(
        """
        SELECT COUNT(*) FROM security_audit_costs
        WHERE tier = 3 AND created_at > NOW() - INTERVAL '1 hour'
        """
    )
    return int(cur.fetchone()[0] or 0)


def _log_cost(cur, model: str, tier: int, cost: float, target_file: str) -> None:
    cur.execute(
        """
        INSERT INTO security_audit_costs (model, tier, estimated_cost, target_file)
        VALUES (%s, %s, %s, %s)
        """,
        (model, tier, round(cost, 6), target_file),
    )


def _openrouter_call(
    cur,
    prompt: str,
    model: str,
    tier: int,
    target_file: str,
    system: str | None = None,
    max_tokens: int = 500,
) -> tuple[str | None, float]:
    if _daily_cost(cur) >= DAILY_COST_LIMIT:
        return None, 0.0

    key = os.environ.get("OPENROUTER_KEY", "")
    if not key:
        try:
            from openrouter_key import get_openrouter_key
            key = get_openrouter_key()
        except ImportError:
            pass
    if not key:
        return None, 0.0

    import requests

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.3},
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        content = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        usage = data.get("usage") or {}
        cost = float(usage.get("cost") or 0)
        if cost <= 0:
            tokens = int(usage.get("total_tokens") or 0)
            rate = MODEL_COST_PER_1K.get(model, 0.001)
            cost = (tokens / 1000.0) * rate
        if _daily_cost(cur) + cost > DAILY_COST_LIMIT:
            return None, 0.0
        _log_cost(cur, model, tier, cost, target_file)
        return content, cost
    except Exception as e:
        print(f"[security_audit] OpenRouter error ({model}): {e}", flush=True)
        return None, 0.0


def tier2_refine(cur, file_path: Path, flag: dict) -> dict | None:
    """Tier 2: DeepSeek refines Tier-1 flags, discards false positives."""
    prompt = (
        f"File: {file_path}\n"
        f"Flagged type: {flag.get('vuln_type')}\n"
        f"Severity guess: {flag.get('severity')}\n"
        f"Reason: {flag.get('reason')}\n"
        f"Snippet:\n{flag.get('snippet')}\n\n"
        "Is this a real security issue in this codebase? "
        'Respond ONLY JSON: {"valid":true|false,"confidence":0.0-1.0,'
        '"vuln_type":"...","severity":"low|medium|high|critical","description":"..."}'
    )
    raw, cost = _openrouter_call(cur, prompt, MODEL_REFINE, 2, str(file_path), max_tokens=300)
    time.sleep(AI_PAUSE_SECONDS)
    if not raw:
        return None
    text = raw
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not parsed.get("valid"):
        return None
    return {
        "vuln_type": parsed.get("vuln_type", flag.get("vuln_type")),
        "severity": parsed.get("severity", flag.get("severity")),
        "confidence": float(parsed.get("confidence", 0.5)),
        "description": parsed.get("description", flag.get("reason", "")),
        "code_snippet": flag.get("snippet", ""),
        "tier_reached": 2,
    }


def tier3_deep(cur, file_path: Path, finding: dict) -> dict:
    """Tier 3: Claude deep analysis — rate and cost limited."""
    if finding.get("confidence", 0) < FILTER_CONFIDENCE:
        return finding
    if _deep_calls_this_hour(cur) >= MAX_DEEP_PER_HOUR:
        print("[security_audit] tier3 rate limit reached", flush=True)
        return finding
    if _daily_cost(cur) >= DAILY_COST_LIMIT:
        print("[security_audit] daily cost limit reached", flush=True)
        return finding

    prompt = (
        f"Deep security audit of ZION's own code (defensive, authorized).\n"
        f"File: {file_path}\n"
        f"Type: {finding.get('vuln_type')}\n"
        f"Severity: {finding.get('severity')}\n"
        f"Snippet:\n{finding.get('code_snippet')}\n\n"
        "Write a concise vulnerability report: attack scenario, impact, remediation. "
        "3-6 sentences. No submission language — human reviews all findings."
    )
    raw, cost = _openrouter_call(
        cur, prompt, MODEL_DEEP, 3, str(file_path),
        system="You are a senior security auditor. Be precise and practical.",
        max_tokens=500,
    )
    time.sleep(AI_PAUSE_SECONDS)
    if raw:
        finding["description"] = (finding.get("description") or "") + "\n\n[Tier 3]\n" + raw
        finding["tier_reached"] = 3
    return finding


def store_finding(cur, file_path: Path, finding: dict) -> int:
    cur.execute(
        """
        INSERT INTO security_findings
            (target_file, vuln_type, severity, confidence, description,
             code_snippet, tier_reached, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
        RETURNING id
        """,
        (
            str(file_path),
            finding.get("vuln_type"),
            finding.get("severity"),
            finding.get("confidence", 0),
            finding.get("description"),
            finding.get("code_snippet"),
            finding.get("tier_reached", 2),
        ),
    )
    return int(cur.fetchone()[0])


def scan_target(path: str, limit: int | None = None) -> list[dict]:
    """
    Walk .py and .move under a LOCAL path only. Human must pass path explicitly.
  NOTHING auto-submitted — findings stay pending for human review.
    """
    root = validate_local_path(path)
    files = collect_files(root, limit=limit)
    print(f"[security_audit] scanning {len(files)} files under {root}", flush=True)

    conn = db()
    cur = conn.cursor()
    ensure_schema(cur)
    conn.commit()

    results: list[dict] = []
    total_cost_start = _daily_cost(cur)

    for fp in files:
        try:
            content = fp.read_text(encoding="utf-8", errors="ignore")
        except OSError as e:
            print(f"  skip {fp}: {e}", flush=True)
            continue

        if _daily_cost(cur) >= DAILY_COST_LIMIT:
            print("[security_audit] stopping — daily cost limit", flush=True)
            break

        flags = tier1_filter(fp, content)
        if not flags:
            continue

        seen: set[str] = set()
        for flag in flags:
            key = (flag.get("vuln_type"), flag.get("snippet", "")[:80])
            if key in seen:
                continue
            seen.add(key)

            refined = tier2_refine(cur, fp, flag)
            conn.commit()
            if not refined:
                continue

            if refined["confidence"] >= FILTER_CONFIDENCE:
                refined = tier3_deep(cur, fp, refined)
                conn.commit()

            fid = store_finding(cur, fp, refined)
            conn.commit()
            row = {**refined, "id": fid, "target_file": str(fp)}
            results.append(row)
            print(
                f"  FINDING #{fid} [{refined.get('severity')}] "
                f"{refined.get('vuln_type')} conf={refined.get('confidence'):.2f} "
                f"tier={refined.get('tier_reached')} — {fp.name}",
                flush=True,
            )

    total_cost = _daily_cost(cur) - total_cost_start
    cur.execute(
        "SELECT COALESCE(SUM(estimated_cost),0) FROM security_audit_costs WHERE created_at >= CURRENT_DATE"
    )
    daily_total = float(cur.fetchone()[0] or 0)
    cur.close()
    conn.close()

    print(
        f"[security_audit] done: {len(results)} findings | "
        f"session cost ${total_cost:.4f} | daily total ${daily_total:.4f} "
        f"(limit ${DAILY_COST_LIMIT})",
        flush=True,
    )
    return results


def report(status: str | None = None) -> None:
    """Show findings for human review. Human decides what to do — never auto-submit."""
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    conn.commit()

    q = "SELECT * FROM security_findings"
    params: tuple = ()
    if status:
        q += " WHERE status = %s"
        params = (status,)
    q += " ORDER BY confidence DESC, created_at DESC LIMIT 50"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()

    print("=" * 72)
    print("  ZION SECURITY AUDIT — HUMAN REVIEW REPORT")
    print("  (Nothing auto-submitted. You decide what to file externally.)")
    print("=" * 72)
    if not rows:
        print("  No findings.")
    for r in rows:
        print(
            f"\n  #{r['id']} [{r['status']}] {r['severity']} "
            f"conf={float(r['confidence'] or 0):.2f} tier={r['tier_reached']} "
            f"agents={r['agent_consensus'] or 0}/5"
        )
        print(f"  File: {r['target_file']}")
        print(f"  Type: {r['vuln_type']}")
        print(f"  { (r['description'] or '')[:300]}")
    print("=" * 72)


def main() -> int:
    parser = argparse.ArgumentParser(description="ZION security audit — local paths only")
    sub = parser.add_subparsers(dest="cmd")

    scan_p = sub.add_parser("scan", help="Scan local directory (human-passed path only)")
    scan_p.add_argument("path", help="Local filesystem path")
    scan_p.add_argument("--limit", type=int, default=None, help="Max files to scan")

    sub.add_parser("report", help="Show findings for human review")

    args = parser.parse_args()
    if args.cmd == "scan":
        try:
            scan_target(args.path, limit=args.limit)
        except ValueError as e:
            print(f"REFUSED: {e}", flush=True)
            return 1
        return 0
    if args.cmd == "report":
        report()
        return 0
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
