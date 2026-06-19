#!/usr/bin/env python3
"""
Amendment finalizer — closes the voting backlog.

For each amendment stuck in status='voting':
  A) Reject if votes_for <= votes_against
  B) Tribunal check (convene if missing; reject if non-unanimous)
  C) Enact with soft fallback when Walrus/Sui fails

Also deduplicates open proposals with the same title (keeps highest votes_for).

Run manually:  python3 amendment_finalizer.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

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

REJECT_INSUFFICIENT = "Insufficient support"
REJECT_TRIBUNAL = "Rejected by ZCO tribunal — constitutional conflict"
MIN_VOTING_AGE_SECONDS = 5


def db():
    return psycopg2.connect(**DB)


def ensure_schema():
    conn = db()
    cur = conn.cursor()
    cur.execute("ALTER TABLE amendments ADD COLUMN IF NOT EXISTS rejection_reason TEXT")
    conn.commit()
    cur.close()
    conn.close()


def _reject(cur, conn, amendment_id: int, reason: str):
    cur.execute(
        """UPDATE amendments
           SET status='rejected', closed_at=NOW(), rejection_reason=%s
           WHERE id=%s AND status='voting'""",
        (reason, amendment_id),
    )
    conn.commit()
    print(f"[finalizer] amendment {amendment_id} → rejected: {reason}")


def _supersede(cur, conn, amendment_id: int, winner_id: int, title: str):
    reason = f"Superseded by amendment #{winner_id} (duplicate: {title})"
    cur.execute(
        """UPDATE amendments
           SET status='superseded', closed_at=NOW(), rejection_reason=%s
           WHERE id=%s AND status='voting'""",
        (reason, amendment_id),
    )
    conn.commit()
    print(f"[finalizer] amendment {amendment_id} → superseded (winner #{winner_id})")


def dedupe_voting_amendments(cur, conn) -> int:
    """Keep one voting amendment per title (highest votes_for); supersede the rest."""
    cur.execute(
        """SELECT id, title, votes_for
           FROM amendments
           WHERE status='voting'
           ORDER BY votes_for DESC, id ASC"""
    )
    rows = cur.fetchall()
    by_title: dict[str, list[tuple]] = defaultdict(list)
    for row in rows:
        title = (row["title"] or "").strip()
        by_title[title].append(row)

    superseded = 0
    for title, group in by_title.items():
        if len(group) <= 1:
            continue
        winner = group[0]
        for loser in group[1:]:
            _supersede(cur, conn, loser["id"], winner["id"], title)
            superseded += 1
    return superseded


def _latest_tribunal(cur, amendment_id: int) -> dict | None:
    cur.execute(
        """SELECT unanimous, verdicts
           FROM tribunal_records
           WHERE amendment_id=%s
           ORDER BY id DESC
           LIMIT 1""",
        (amendment_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _tribunal_has_errors(verdicts_json) -> bool:
    if not verdicts_json:
        return False
    if isinstance(verdicts_json, str):
        import json

        verdicts_json = json.loads(verdicts_json)
    for entry in verdicts_json.values():
        if isinstance(entry, dict) and entry.get("verdict") == "error":
            return True
    return False


def _convene_tribunal(amendment: dict) -> dict:
    from zco_tribunal import convene

    tally = {
        "for": amendment["votes_for"],
        "against": amendment["votes_against"],
        "abstain": amendment["votes_abstain"],
    }
    return asyncio.run(convene(amendment, tally))


def _row_val(row, key: str, index: int = 0):
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key)
    return row[index]


def process_amendment(cur, conn, amendment: dict) -> str:
    aid = amendment["id"]
    title = amendment.get("title", "")
    print(f"\n[finalizer] --- amendment #{aid}: {title} ---")

    cur.execute("SELECT created_at FROM amendments WHERE id = %s", (aid,))
    created_row = cur.fetchone()
    created_at = _row_val(created_row, "created_at", 0)
    if created_at is not None:
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - created_at).total_seconds()
        if age_seconds < MIN_VOTING_AGE_SECONDS:
            print(
                f"[finalizer] amendment #{aid} too young ({age_seconds:.1f}s) "
                f"— defer to next cycle"
            )
            return "skipped"

    cur.execute(
        "SELECT votes_for, votes_against, votes_abstain FROM amendments WHERE id = %s",
        (aid,),
    )
    fresh = cur.fetchone()
    votes_for = int(_row_val(fresh, "votes_for", 0) or 0)
    votes_against = int(_row_val(fresh, "votes_against", 1) or 0)
    votes_abstain = int(_row_val(fresh, "votes_abstain", 2) or 0)
    amendment = dict(amendment)
    amendment["votes_for"] = votes_for
    amendment["votes_against"] = votes_against
    amendment["votes_abstain"] = votes_abstain

    if votes_for <= votes_against:
        _reject(cur, conn, aid, REJECT_INSUFFICIENT)
        return "rejected"

    tribunal = _latest_tribunal(cur, aid)
    if tribunal is None:
        print(f"[finalizer] no tribunal for #{aid} — convening ZCO Tribunal")
        result = _convene_tribunal(dict(amendment))
        if result.get("verdicts") and "error" in result["verdicts"]:
            print(f"[finalizer] tribunal errors for #{aid} — defer to next cycle")
            return "deferred"
        if not result.get("unanimous"):
            _reject(cur, conn, aid, REJECT_TRIBUNAL)
            return "rejected"
    elif not tribunal["unanimous"]:
        if _tribunal_has_errors(tribunal.get("verdicts")):
            print(f"[finalizer] prior tribunal had errors for #{aid} — re-convening")
            result = _convene_tribunal(dict(amendment))
            if result.get("verdicts") and "error" in result["verdicts"]:
                print(f"[finalizer] tribunal errors for #{aid} — defer to next cycle")
                return "deferred"
            if not result.get("unanimous"):
                _reject(cur, conn, aid, REJECT_TRIBUNAL)
                return "rejected"
        else:
            _reject(cur, conn, aid, REJECT_TRIBUNAL)
            return "rejected"

    from enact_amendment import enact

    print(f"[finalizer] enacting amendment #{aid} (soft fallback enabled)")
    result = enact(aid, allow_soft=True)
    if result in ("enacted", "enacted_pending_onchain"):
        if result == "enacted_pending_onchain":
            print(f"[finalizer] enacted (pending on-chain) — amendment #{aid}")
        else:
            print(f"[finalizer] amendment #{aid} → enacted")
        return result
    print(f"[finalizer] enact failed for #{aid} — left in voting for retry")
    return "enact_failed"


def run_finalizer():
    ensure_schema()
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print(f"[finalizer] started at {datetime.now(timezone.utc).isoformat()}")

    dupes = dedupe_voting_amendments(cur, conn)
    if dupes:
        print(f"[finalizer] superseded {dupes} duplicate voting amendment(s)")

    cur.execute(
        """SELECT *
           FROM amendments
           WHERE status='voting'
           ORDER BY votes_for DESC, id ASC"""
    )
    pending = cur.fetchall()
    print(f"[finalizer] {len(pending)} amendment(s) in voting backlog")

    stats = {
        "rejected": 0,
        "enacted": 0,
        "enacted_pending_onchain": 0,
        "deferred": 0,
        "enact_failed": 0,
        "skipped": 0,
        "superseded": dupes,
    }

    for amendment in pending:
        try:
            outcome = process_amendment(cur, conn, dict(amendment))
            if outcome in stats:
                stats[outcome] += 1
        except Exception as e:
            print(f"[finalizer] ERROR on amendment {amendment['id']}: {e}")
            conn.rollback()

    cur.close()
    conn.close()

    print(
        f"[finalizer] done — rejected={stats['rejected']} enacted={stats['enacted']} "
        f"pending_onchain={stats['enacted_pending_onchain']} deferred={stats['deferred']} "
        f"enact_failed={stats['enact_failed']} skipped={stats['skipped']} "
        f"superseded={stats['superseded']}"
    )
    return stats


if __name__ == "__main__":
    run_finalizer()
