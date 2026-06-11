#!/usr/bin/env python3
"""Z-LAB weekly research report compiler — aggregates observations → Walrus."""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone

import httpx
import psycopg2.extras

from zlab import db_conn, ensure_schema, get_openrouter_key, period_numbers, MODEL
from walrus import store_bytes

WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space/v1/blobs"


def _llm_report(prompt: str) -> str | None:
    key = get_openrouter_key()
    if not key:
        return None
    try:
        with httpx.Client(timeout=90) as client:
            r = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1800,
                    "temperature": 0.5,
                },
            )
            r.raise_for_status()
            return (r.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception as e:
        print(f"[zlab-report] LLM error: {e}")
        return None


def _fallback_report(week: int, year: int, observations: list[dict]) -> str:
    by_track: dict[str, list[str]] = {}
    books: dict[str, int] = {}
    for o in observations:
        track = o.get("track") or "SCIENCE"
        by_track.setdefault(track, []).append(o.get("observation_text") or "")
        key = f"{o.get('book_title')} — {o.get('author')}"
        books[key] = books.get(key, 0) + 1
    top_books = sorted(books.items(), key=lambda x: -x[1])[:5]
    lines = [
        f"# ZION Research Institute — Weekly Report",
        f"**Week {week}, {year}**",
        "",
        "## Executive Summary",
        f"This week Z-LAB recorded {len(observations)} autonomous agent observations "
        f"across {len(by_track)} research tracks, drawing on the civilization knowledge base.",
        "",
    ]
    for track, texts in sorted(by_track.items()):
        lines.append(f"## {track}")
        for t in texts[:3]:
            lines.append(f"- {t}")
        lines.append("")
    lines.append("## Most Cited Books")
    for title, cnt in top_books:
        lines.append(f"- {title} ({cnt} citations)")
    lines.append("")
    lines.append("## Outlook")
    lines.append("Researchers will continue cross-reading canonical texts against live ZION telemetry.")
    return "\n".join(lines)


def generate_weekly_report(cur, week_number: int | None = None, year_number: int | None = None) -> dict | None:
    ensure_schema(cur)
    week, month, year = period_numbers()
    week_number = week_number or week
    year_number = year_number or year

    cur.execute(
        """
        SELECT * FROM zlab_observations
        WHERE week_number = %s AND year_number = %s
        ORDER BY created_at ASC
        """,
        (week_number, year_number),
    )
    observations = [dict(r) for r in cur.fetchall()]
    if not observations:
        print("[zlab-report] no observations for this week")
        return None

    cur.execute(
        """
        SELECT id FROM zlab_reports
        WHERE report_type = 'weekly' AND week_number = %s AND year_number = %s
        LIMIT 1
        """,
        (week_number, year_number),
    )
    if cur.fetchone():
        print("[zlab-report] weekly report already exists")
        return None

    obs_lines = []
    for o in observations:
        obs_lines.append(
            f"[{o['track']}] {o['agent_name']}: {o['observation_text']} "
            f"(source: {o['book_title']} — {o['author']})"
        )
    observations_text = "\n".join(obs_lines[:80])

    prompt = f"""You are the editor of ZION Research Institute.
Here are {len(observations)} research observations from this week:
{observations_text}

Write a formal Weekly Research Report in markdown with:
- Executive Summary (3 sentences)
- Top 3 findings per track
- Most cited books this week
- Outlook for next week

Style: scientific, formal, like Nature magazine.
Use real numbers from the observations."""

    content_md = _llm_report(prompt) or _fallback_report(week_number, year_number, observations)
    sha256 = hashlib.sha256(content_md.encode("utf-8")).hexdigest()

    blob_id = None
    result = store_bytes(
        content_md.encode("utf-8"),
        blob_type="zlab_weekly_report",
        content_type="text/markdown; charset=utf-8",
        summary=f"Z-LAB weekly W{week_number}-{year_number}",
    )
    if result:
        blob_id = result["blob_id"]

    cur.execute(
        """
        INSERT INTO zlab_reports
            (report_type, week_number, month_number, year_number, content_md, walrus_blob_id, sha256)
        VALUES ('weekly', %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (week_number, month, year, content_md, blob_id, sha256),
    )
    rid = int(cur.fetchone()[0])
    print(f"[zlab-report] weekly report #{rid} blob={blob_id}")
    return {
        "id": rid,
        "week_number": week_number,
        "year_number": year,
        "walrus_blob_id": blob_id,
        "walrus_url": f"{WALRUS_AGGREGATOR}/{blob_id}" if blob_id else None,
        "sha256": sha256,
    }


def maybe_generate_weekly_report(cur, tick_id: int) -> dict | None:
    if tick_id % 50 != 0:
        return None
    return generate_weekly_report(cur)


def main():
    conn = db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    report = generate_weekly_report(cur)
    conn.commit()
    cur.close()
    conn.close()
    print(report)


if __name__ == "__main__":
    main()
