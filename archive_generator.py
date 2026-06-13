#!/usr/bin/env python3
"""ZION Civilization Archive — per-track reports, ZIP bundles, Walrus storage."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import random
import re
import zipfile
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path

import psycopg2
import psycopg2.extras

from book_classifier import BOOKS_DIR, get_books_for_track, list_discovered_tracks, sync_book_tracks
from text_utils import is_clean_text
from walrus import store_bytes
from zlab import db_conn, ensure_schema, get_civ_stats, period_numbers

WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space/v1/blobs"
ARCHIVE_EPOCH = datetime(2026, 6, 11, tzinfo=timezone.utc)
WEEKLY_DAYS = 7
MONTHLY_DAYS = 30
ANNUAL_DAYS = 365

REFUSAL_PATTERNS = [
    "i cannot provide",
    "i can't provide",
    "cannot provide information",
    "i'm not able to",
    "i am not able to",
    "can i help you with something else",
    "as an ai",
    "as a language model",
]


def is_valid_observation(text: str) -> bool:
    if not text or len(text) < 50:
        return False
    text_lower = text.lower()
    return not any(p in text_lower for p in REFUSAL_PATTERNS)


def ensure_archive_schema(cur) -> None:
    ensure_schema(cur)
    sync_book_tracks(cur, verbose=False)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS archive_reports (
            id SERIAL PRIMARY KEY,
            report_type VARCHAR(20) NOT NULL,
            week_number INTEGER,
            month_number INTEGER,
            year_number INTEGER,
            walrus_blob_id VARCHAR(100),
            sha256 VARCHAR(64),
            zip_filename VARCHAR(300),
            files_json JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS archive_schedule (
            id INTEGER PRIMARY KEY DEFAULT 1,
            last_weekly_at TIMESTAMP,
            last_monthly_at TIMESTAMP,
            last_annual_at TIMESTAMP,
            next_weekly_at TIMESTAMP,
            next_monthly_at TIMESTAMP,
            next_annual_at TIMESTAMP
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS archive_track_files (
            id SERIAL PRIMARY KEY,
            report_id INTEGER NOT NULL REFERENCES archive_reports(id) ON DELETE CASCADE,
            track_name VARCHAR(80) NOT NULL,
            walrus_blob_id VARCHAR(100),
            walrus_url TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (report_id, track_name)
        )
        """
    )
    cur.execute(
        """
        INSERT INTO archive_schedule (id, next_weekly_at, next_monthly_at, next_annual_at)
        VALUES (1, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            ARCHIVE_EPOCH + timedelta(days=WEEKLY_DAYS),
            ARCHIVE_EPOCH + timedelta(days=MONTHLY_DAYS),
            ARCHIVE_EPOCH + timedelta(days=ANNUAL_DAYS),
        ),
    )


def _delete_existing_report(cur, report_type: str, week: int, month: int, year: int) -> None:
    cur.execute(
        """
        DELETE FROM archive_reports
        WHERE report_type = %s AND week_number = %s AND month_number = %s AND year_number = %s
        """,
        (report_type, week, month, year),
    )


def _upload_track_file(cur, report_id: int, track_name: str, content: str) -> str | None:
    result = store_bytes(
        content.encode("utf-8"),
        blob_type="archive_track",
        content_type="text/plain; charset=utf-8",
        summary=f"ZION archive track {track_name} report#{report_id}",
    )
    blob_id = result["blob_id"] if result else None
    walrus_url = f"{WALRUS_AGGREGATOR}/{blob_id}" if blob_id else None
    cur.execute(
        """
        INSERT INTO archive_track_files (report_id, track_name, walrus_blob_id, walrus_url)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (report_id, track_name) DO UPDATE
        SET walrus_blob_id = EXCLUDED.walrus_blob_id,
            walrus_url = EXCLUDED.walrus_url,
            created_at = NOW()
        """,
        (report_id, track_name, blob_id, walrus_url),
    )
    return blob_id


def _read_quote(filename: str, max_len: int = 220) -> str:
    path = BOOKS_DIR / filename
    if not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 80:
        snippet = text[:max_len]
        return f'"{snippet}…"' if is_clean_text(snippet) else ""

    for _ in range(8):
        start = random.randint(0, max(0, len(text) - max_len - 20))
        snippet = text[start : start + max_len].strip()
        if is_clean_text(snippet):
            return f'"{snippet}…"'
    return ""


def _text_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _replacement_insight(cur, observation: dict, track: str) -> str | None:
    agent_id = observation.get("agent_id")
    if not agent_id:
        return None
    try:
        cur.execute(
            """
            SELECT insight FROM agent_knowledge
            WHERE agent_id = %s AND track = %s
            AND insight NOT ILIKE '%%gutenberg%%'
            AND insight NOT ILIKE '%%z-library%%'
            AND length(insight) > 80
            ORDER BY RANDOM() LIMIT 1
            """,
            (agent_id, track),
        )
        row = cur.fetchone()
        if row:
            val = row["insight"] if isinstance(row, dict) else row[0]
            return (val or "").strip() or None
        cur.execute(
            """
            SELECT insight FROM agent_knowledge
            WHERE track = %s
            AND insight NOT ILIKE '%%gutenberg%%'
            AND length(insight) > 80
            ORDER BY RANDOM() LIMIT 1
            """,
            (track,),
        )
        row = cur.fetchone()
        if row:
            val = row["insight"] if isinstance(row, dict) else row[0]
            return (val or "").strip() or None
    except Exception:
        pass
    return None


def _dedupe_observations(cur, observations: list[dict], track: str, threshold: float = 0.8) -> list[dict]:
    """Skip LLM refusals, then skip or replace observations that are >80% similar."""
    kept: list[dict] = []
    kept_texts: list[str] = []
    for obs in observations:
        text = (obs.get("observation_text") or "").strip()
        if not is_valid_observation(text):
            continue
        if any(_text_similarity(text, prev) >= threshold for prev in kept_texts):
            alt = _replacement_insight(cur, obs, track)
            if (
                alt
                and is_valid_observation(alt)
                and not any(_text_similarity(alt, prev) >= threshold for prev in kept_texts)
            ):
                obs = {**obs, "observation_text": alt}
                text = alt
            else:
                continue
        kept.append(obs)
        kept_texts.append(text)
    return kept


def _observations_for_period(cur, track: str, report_type: str, week: int, month: int, year: int) -> list[dict]:
    if report_type == "weekly":
        cur.execute(
            """
            SELECT * FROM zlab_observations
            WHERE track = %s AND week_number = %s AND year_number = %s
            ORDER BY created_at ASC
            """,
            (track, week, year),
        )
    elif report_type == "monthly":
        cur.execute(
            """
            SELECT * FROM zlab_observations
            WHERE track = %s AND month_number = %s AND year_number = %s
            ORDER BY created_at ASC
            """,
            (track, month, year),
        )
    else:
        cur.execute(
            """
            SELECT * FROM zlab_observations
            WHERE track = %s AND year_number = %s
            ORDER BY created_at ASC
            """,
            (track, year),
        )
    return [dict(r) for r in cur.fetchall()]


def _trading_section(cur) -> str:
    try:
        cur.execute(
            """
            SELECT a.name, a.class, COUNT(*) trades,
                   ROUND(AVG(t.pnl_percent)::numeric, 2) avg_pnl,
                   ROUND(SUM(t.pnl)::numeric, 2) total_pnl
            FROM agent_trades t
            JOIN agents a ON a.id = t.agent_id
            WHERE t.status = 'CLOSED'
            GROUP BY a.id, a.name, a.class
            HAVING COUNT(*) >= 2
            ORDER BY SUM(t.pnl) DESC NULLS LAST
            LIMIT 8
            """
        )
        rows = cur.fetchall()
    except Exception:
        return "_No trading data available._\n"
    if not rows:
        return "_No closed trades in this period._\n"
    lines = ["| Agent | Class | Trades | Avg P&L % | Total P&L |", "|---|---|---:|---:|---:|"]
    for r in rows:
        lines.append(
            f"| {r['name']} | {r['class']} | {r['trades']} | {r['avg_pnl']} | {r['total_pnl']} |"
        )
    return "\n".join(lines) + "\n"


def _period_label(report_type: str, week: int, month: int, year: int) -> str:
    if report_type == "weekly":
        return f"Week {week}, {year}"
    if report_type == "monthly":
        month_name = datetime(year, month, 1).strftime("%B")
        return f"{month_name} {year}"
    return f"Year {year}"


def _build_track_md(
    cur,
    track: str,
    report_type: str,
    week: int,
    month: int,
    year: int,
    stats: dict,
) -> str:
    observations = _dedupe_observations(
        cur, _observations_for_period(cur, track, report_type, week, month, year), track
    )
    books = get_books_for_track(cur, track)
    books_read = sorted(
        {f"{o.get('book_title', '')} — {o.get('author', '')}" for o in observations if o.get("book_title")}
    )
    quotes = []
    sample_books = books[:20] if books else []
    random.shuffle(sample_books)
    for fn in sample_books[:5]:
        q = _read_quote(fn)
        if q:
            quotes.append(f"- {q} _({fn.replace('_', ' ')})_")

    period = _period_label(report_type, week, month, year)
    lines = [
        f"# {track} REPORT — {period}",
        "",
        "## Civilization State",
        f"- Agents alive: {stats['alive']:,}",
        f"- Prosperity: {stats['prosperity']}%",
        f"- Revolution: {stats['revolution']:.0f}",
        f"- Amendments enacted: {stats['amendments_count']}",
        "",
        "## Research Observations (from Z-LAB)",
    ]
    if observations:
        for o in observations:
            lines.append(
                f"- **{o.get('agent_name', 'Agent')}** (AGT-{o.get('agent_id')}): "
                f"{o.get('observation_text', '')}"
            )
    else:
        lines.append("_No observations recorded for this track in this period._")
    lines.extend(["", "## Key Books Referenced"])
    if books_read:
        for b in books_read[:15]:
            lines.append(f"- {b}")
    else:
        for fn in books[:10]:
            lines.append(f"- {fn.replace('_', ' ')}")
    if track == "ECONOMICS":
        lines.extend(["", "## Trading Activity", _trading_section(cur)])
    lines.extend(["", "## Notable Quotes from Knowledge Base"])
    if quotes:
        lines.extend(quotes)
    else:
        lines.append("_Quotes unavailable._")
    lines.append("")
    return "\n".join(lines)


def _build_full_report(track_files: dict[str, str], report_type: str, week: int, month: int, year: int) -> str:
    period = _period_label(report_type, week, month, year)
    lines = [
        f"# ZION CIVILIZATION ARCHIVE — {report_type.upper()} REPORT",
        f"**{period}**",
        "",
        "Complete multi-track synthesis. Individual track files are included in this archive bundle.",
        "",
    ]
    for track in sorted(track_files.keys()):
        if track == "full_report":
            continue
        lines.append(f"## {track}")
        lines.append(f"See `{track_files[track]}` in this ZIP.")
        lines.append("")
    return "\n".join(lines)


def _report_exists(cur, report_type: str, week: int, month: int, year: int) -> bool:
    cur.execute(
        """
        SELECT id FROM archive_reports
        WHERE report_type = %s AND week_number = %s AND month_number = %s AND year_number = %s
        LIMIT 1
        """,
        (report_type, week, month, year),
    )
    return cur.fetchone() is not None


def _ensure_db_cursor(cur, conn):
    """Reconnect if the DB connection went stale during long Walrus uploads."""
    try:
        if conn is None or conn.closed:
            raise psycopg2.OperationalError("connection closed")
        cur.execute("SELECT 1")
        return cur, conn
    except Exception:
        if conn is not None and not conn.closed:
            try:
                conn.close()
            except Exception:
                pass
        conn = db_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return cur, conn


def _generate_archive_report_body(
    cur,
    report_type: str,
    week_number: int | None,
    month_number: int | None,
    year_number: int | None,
    force: bool,
    conn=None,
) -> dict | None:
    week, month, year = period_numbers()
    week_number = week_number or week
    month_number = month_number or month
    year_number = year_number or year

    if not force and _report_exists(cur, report_type, week_number, month_number, year_number):
        print(f"[archive] {report_type} report already exists for period")
        return None

    if force:
        _delete_existing_report(cur, report_type, week_number, month_number, year_number)

    tracks_rows = list_discovered_tracks(cur)
    tracks = [r["track"] for r in tracks_rows] if tracks_rows else ["SCIENCE", "PHILOSOPHY", "POLITICS", "ECONOMICS"]
    stats = get_civ_stats(cur)

    track_contents: dict[str, str] = {}
    track_files: dict[str, str] = {}
    for track in tracks:
        fname = f"{track.lower()}.md"
        track_contents[track] = _build_track_md(
            cur, track, report_type, week_number, month_number, year_number, stats
        )
        track_files[track] = fname

    full_name = "full_report.md"
    full_header = _build_full_report(track_files, report_type, week_number, month_number, year_number)
    full_parts = [full_header, "\n---\n"]
    for track in sorted(track_files.keys()):
        full_parts.append(f"\n\n# APPENDIX: {track}\n\n")
        full_parts.append(track_contents[track])
    track_contents["full_report"] = "".join(full_parts)
    track_files["full_report"] = full_name

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for track, fname in track_files.items():
            zf.writestr(fname, track_contents[track])

    zip_bytes = zip_buf.getvalue()
    sha256 = hashlib.sha256(zip_bytes).hexdigest()

    if report_type == "weekly":
        zip_filename = f"zion_weekly_week{week_number}_{year_number}.zip"
    elif report_type == "monthly":
        zip_filename = f"zion_monthly_{month_number:02d}_{year_number}.zip"
    else:
        zip_filename = f"zion_annual_{year_number}.zip"

    blob_id = None
    result = store_bytes(
        zip_bytes,
        blob_type=f"archive_{report_type}",
        content_type="application/zip",
        summary=f"ZION archive {report_type} {zip_filename}",
    )
    if result:
        blob_id = result["blob_id"]

    files_json = [{"track": k, "filename": v} for k, v in sorted(track_files.items())]
    cur, conn = _ensure_db_cursor(cur, conn)
    cur.execute(
        """
        INSERT INTO archive_reports
            (report_type, week_number, month_number, year_number, walrus_blob_id, sha256, zip_filename, files_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id
        """,
        (report_type, week_number, month_number, year_number, blob_id, sha256, zip_filename, json.dumps(files_json)),
    )
    rid = int(cur.fetchone()["id"])

    for track_name, content in track_contents.items():
        _upload_track_file(cur, rid, track_name, content)
        print(f"[archive] track file uploaded: {track_name}")

    now = datetime.now(timezone.utc)
    if report_type == "weekly":
        cur.execute(
            """
            UPDATE archive_schedule SET last_weekly_at = %s, next_weekly_at = %s WHERE id = 1
            """,
            (now, now + timedelta(days=WEEKLY_DAYS)),
        )
    elif report_type == "monthly":
        cur.execute(
            """
            UPDATE archive_schedule SET last_monthly_at = %s, next_monthly_at = %s WHERE id = 1
            """,
            (now, now + timedelta(days=MONTHLY_DAYS)),
        )
    else:
        cur.execute(
            """
            UPDATE archive_schedule SET last_annual_at = %s, next_annual_at = %s WHERE id = 1
            """,
            (now, now + timedelta(days=ANNUAL_DAYS)),
        )

    print(f"[archive] {report_type} report #{rid} → {zip_filename} blob={blob_id}")
    return {
        "id": rid,
        "report_type": report_type,
        "week_number": week_number,
        "month_number": month_number,
        "year_number": year_number,
        "walrus_blob_id": blob_id,
        "walrus_url": f"{WALRUS_AGGREGATOR}/{blob_id}" if blob_id else None,
        "zip_filename": zip_filename,
        "files": files_json,
        "sha256": sha256,
    }


def generate_archive_report(
    report_type: str = "weekly",
    week_number: int | None = None,
    month_number: int | None = None,
    year_number: int | None = None,
    force: bool = False,
    *,
    cur=None,
) -> dict | None:
    own_conn = cur is None
    conn = None
    if own_conn:
        conn = db_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        ensure_archive_schema(cur)
        if own_conn:
            conn.commit()
        result = _generate_archive_report_body(
            cur,
            report_type,
            week_number,
            month_number,
            year_number,
            force,
            conn=conn if own_conn else None,
        )
        if own_conn and result is not None:
            conn.commit()
        return result
    finally:
        if own_conn and conn is not None:
            cur.close()
            conn.close()


def maybe_run_scheduled_reports(cur) -> list[dict]:
    """Check schedule and generate any due reports."""
    ensure_archive_schema(cur)
    cur.execute("SELECT * FROM archive_schedule WHERE id = 1")
    row = dict(cur.fetchone() or {})
    now = datetime.now(timezone.utc)
    generated = []
    for rtype, col in [("weekly", "next_weekly_at"), ("monthly", "next_monthly_at"), ("annual", "next_annual_at")]:
        due = row.get(col)
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due and now >= due:
            rep = generate_archive_report(report_type=rtype, cur=cur)
            if rep:
                generated.append(rep)
    return generated


def main():
    parser = argparse.ArgumentParser(description="ZION Archive generator")
    parser.add_argument("--now", choices=["weekly", "monthly", "annual"], help="Generate report immediately")
    parser.add_argument("--force", action="store_true", help="Regenerate even if exists")
    parser.add_argument("--sync-books", action="store_true", help="Only sync book tracks")
    args = parser.parse_args()

    conn = db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur)

    if args.sync_books:
        result = sync_book_tracks(cur)
        print(result)
    elif args.now:
        result = generate_archive_report(report_type=args.now, force=args.force, cur=cur)
        print(result)
    else:
        result = maybe_run_scheduled_reports(cur)
        print(result)

    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
