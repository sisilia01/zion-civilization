#!/usr/bin/env python3
"""
ZION Science API — endpoints for Constitution, amendments, academy, chronicle.
Mounted into the main FastAPI app.
"""
import json
import os
import re
import hashlib
import time
import psycopg2, psycopg2.extras
from decimal import Decimal
from datetime import datetime
from pathlib import Path
import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response

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
WALRUS = "https://aggregator.walrus-testnet.walrus.space/v1/blobs"
PACKAGE = "0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d"
REGISTRY = "0x812b757d84605d6655343e19e683d4990a27cb42afa10881897d0716f17e82f2"

router = APIRouter()
CONST_DIR = Path(os.path.expanduser("~/zion_backend/constitution"))
CONST_V3_PATH = CONST_DIR / "CONSTITUTION_ZION_v3.0.md"

def db():
    from zion_db import get_db

    return get_db()
def js(o):
    if isinstance(o,Decimal): return float(o)
    if isinstance(o,datetime): return o.isoformat()
    if isinstance(o,dict): return {k:js(v) for k,v in o.items()}
    if isinstance(o,list): return [js(x) for x in o]
    return o

def _parse_constitution_markdown(text: str):
    preamble = ""
    articles = []
    prem_match = re.search(r"## PREAMBLE\s*\n(.*?)(?=\n## ARTICLE |\Z)", text, re.DOTALL)
    if prem_match:
        preamble = prem_match.group(1).strip()
    for m in re.finditer(
        r"## (ARTICLE [^\n]+)\n(.*?)(?=\n## ARTICLE |\n## BILL OF RIGHTS|\Z)",
        text,
        re.DOTALL,
    ):
        articles.append({"heading": m.group(1).strip(), "body": m.group(2).strip()})
    return preamble, articles


def _constitution_ratification(cur):
    cur.execute(
        """SELECT votes_for, votes_against, votes_abstain, created_at
           FROM amendments
           WHERE status = 'enacted'
             AND (title ILIKE '%v3.0%' OR title ILIKE '%Permanence%')
           ORDER BY created_at DESC LIMIT 1"""
    )
    row = cur.fetchone()
    if not row:
        return {"agents_ratified": 15443, "consensus_pct": 97.8}
    vf, va, abst = row["votes_for"] or 0, row["votes_against"] or 0, row["votes_abstain"] or 0
    total = vf + va
    pct = round((vf / total) * 100, 1) if total else 97.8
    return {"agents_ratified": vf + va + abst, "consensus_pct": pct, "ratified_at": row["created_at"]}


@router.get("/constitution")
def constitution():
    if not CONST_V3_PATH.is_file():
        raise HTTPException(status_code=404, detail="Constitution document not found")
    text = CONST_V3_PATH.read_text(encoding="utf-8")
    sha256 = hashlib.sha256(text.encode()).hexdigest()
    preamble, articles = _parse_constitution_markdown(text)
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT version, sha256, blob_id, prev_sha256, recorded_at
           FROM constitution_versions
           WHERE version = '3.0' OR sha256 = %s
           ORDER BY id DESC LIMIT 1""",
        (sha256,),
    )
    version_row = cur.fetchone()
    ratification = _constitution_ratification(cur)
    cur.close()
    conn.close()
    blob_id = (version_row or {}).get("blob_id") or "-aBRD_GM1528p8zSLpRjqzR6S0p8yQywf41xrkFlUZM"
    return js(
        {
            "title": "CONSTITUTION OF THE ZION CIVILIZATION",
            "subtitle": "Established by Democratic Consensus of Autonomous Agents",
            "version": "3.0",
            "sha256": (version_row or {}).get("sha256") or sha256,
            "walrus_blob": blob_id,
            "walrus_url": f"{WALRUS}/{blob_id}",
            "registry": REGISTRY,
            "package": PACKAGE,
            "preamble": preamble,
            "articles": articles,
            "agents_ratified": ratification["agents_ratified"],
            "consensus_pct": ratification["consensus_pct"],
            "ratified_at": ratification.get("ratified_at"),
        }
    )


@router.get("/constitution/amendments")
def constitution_amendments():
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT id, proposal_number, title, description, change_type, status,
                  votes_for, votes_against, votes_abstain, merkle_root, blob_id,
                  created_at, closed_at, rejection_reason
           FROM amendments
           ORDER BY COALESCE(proposal_number, 0) DESC, id DESC"""
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    status_map = {
        "enacted": "ENACTED",
        "voting": "PROPOSED",
        "rejected": "REJECTED",
        "superseded": "SUPERSEDED",
    }
    for r in rows:
        raw = (r.get("status") or "proposed").lower()
        r["status_label"] = status_map.get(raw, raw.upper())
        if r.get("blob_id"):
            r["walrus_url"] = f"{WALRUS}/{r['blob_id']}"
        total = (r.get("votes_for") or 0) + (r.get("votes_against") or 0) + (r.get("votes_abstain") or 0)
        r["total_votes"] = total
    return {"amendments": js(rows)}


@router.get("/constitution/lineage")
def lineage():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT version,sha256,blob_id,prev_sha256,recorded_at FROM constitution_versions ORDER BY id")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    for r in rows: r['walrus_url']=f"{WALRUS}/{r['blob_id']}"
    return {"package":PACKAGE,"registry":REGISTRY,"versions":js(rows)}

@router.get("/amendments")
def amendments():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT proposal_number,title,description,change_type,status,
        votes_for,votes_against,votes_abstain,merkle_root,blob_id,created_at
        FROM amendments ORDER BY proposal_number DESC""")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    return {"amendments":js(rows)}

@router.get("/academy/findings")
def findings():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT track,title,hypothesis,reasoning,status,tribunal_verdict,blob_id,created_at
        FROM academy_findings ORDER BY id DESC""")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    for r in rows:
        if r.get('blob_id'): r['walrus_url']=f"{WALRUS}/{r['blob_id']}"
    return {"findings":js(rows)}

@router.get("/chronicles")
def chronicles():
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT period,period_start,period_end,blob_id,report,created_at
        FROM chronicles ORDER BY id DESC LIMIT 20""")
    rows=[dict(r) for r in cur.fetchall()]; cur.close(); conn.close()
    for r in rows:
        if r.get('blob_id'): r['download_url']=f"{WALRUS}/{r['blob_id']}"
    return {"chronicles":js(rows)}

@router.get("/lab/trading-psychology")
def trading_psych():
    from academy import analyze_trading_psychology
    return js(analyze_trading_psychology())


def _build_research_daily_candles(daily_rows: list[dict], days: int = 14) -> list[dict]:
    """OHLC on cumulative insights_count so candles show visible high/low spread."""
    from datetime import date, timedelta

    by_day: dict[date, dict] = {}
    for row in daily_rows:
        raw = row.get("day")
        if raw is None:
            continue
        day_key = raw.date() if hasattr(raw, "date") else raw
        by_day[day_key] = {
            "insights_count": int(row.get("insights_count") or 0),
            "avg_usefulness": float(row.get("avg_usefulness") or 0),
        }

    end = date.today()
    start = end - timedelta(days=days - 1)
    cumulative = 0
    prev_close = 0.0
    candles: list[dict] = []

    d = start
    while d <= end:
        bucket = by_day.get(d)
        day_count = int(bucket["insights_count"]) if bucket else 0
        day_avg = float(bucket["avg_usefulness"]) if bucket else 0.0

        open_ = float(prev_close)
        close = open_ + float(day_count)
        # Wick extends slightly beyond body for visual separation on active days.
        wick_pad = max(day_count * 0.08, 1.0) if day_count else 0.0
        high = max(open_, close) + wick_pad
        low = max(0.0, min(open_, close) - (wick_pad * 0.5 if day_count else 0.0))

        candles.append(
            {
                "date": d.isoformat(),
                "open": round(open_, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2),
                "volume": day_count,
                "insights_count": day_count,
                "avg_usefulness": round(day_avg, 3),
                "cumulative_insights": round(close, 2),
            }
        )
        prev_close = close
        d += timedelta(days=1)

    return candles


def compute_population_literacy(cur):
    """Средний % библиотеки, который изучил типичный агент."""
    cur.execute("SELECT COUNT(*) AS cnt FROM books")
    total_books = (cur.fetchone() or {}).get("cnt", 1) or 1

    cur.execute("SELECT COUNT(*) AS alive_count FROM agents WHERE is_alive = true")
    total_agents = (cur.fetchone() or {}).get("alive_count", 1) or 1

    cur.execute(
        """
        SELECT agent_id, COUNT(DISTINCT book_id) AS books_known
        FROM agent_knowledge ak
        JOIN agents a ON ak.agent_id = a.id
        WHERE a.is_alive = true
        GROUP BY agent_id
        """
    )
    rows = cur.fetchall()

    total_books_known_sum = sum(
        (r["books_known"] if isinstance(r, dict) else r[1]) for r in rows
    )
    agents_with_knowledge = len(rows)

    if total_agents == 0 or total_books == 0:
        avg_literacy_pct = 0
    else:
        avg_books_per_agent = total_books_known_sum / total_agents
        avg_literacy_pct = round((avg_books_per_agent / total_books) * 100, 2)

    return {
        "population_literacy_pct": avg_literacy_pct,
        "agents_with_any_knowledge": agents_with_knowledge,
        "total_alive_agents": total_agents,
        "total_books_in_library": total_books,
        "avg_books_known_per_agent": round(total_books_known_sum / max(total_agents, 1), 2),
    }


BOOK_DISPLAY_NAMES = {
    18: {"title": "The Bible (King James Version)", "author": "—"},
    1: {"title": "Twenty Thousand Leagues Under the Sea", "author": "Jules Verne"},
    19: {"title": "Bleak House", "author": "Charles Dickens"},
    3: {"title": "The Adventures of Huckleberry Finn", "author": "Mark Twain"},
    4: {"title": "The Adventures of Sherlock Holmes", "author": "Arthur Conan Doyle"},
    7: {"title": "Anabasis", "author": "Xenophon"},
    6: {"title": "An Enquiry Concerning Human Understanding", "author": "David Hume"},
    12: {"title": "Around the World in Eighty Days", "author": "Jules Verne"},
}


@router.get("/lab/top-books")
def top_books():
    return _cached_lab_json(get_top_books())


LAB_STATS_CACHE_TTL = 18000  # 5 hours
_lab_stats_cache = None
_lab_stats_cache_ts = 0.0
_zlab_stats_cache = None
_zlab_stats_cache_ts = 0.0
_top_books_cache = None
_top_books_cache_ts = 0.0
_LAB_STATS_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=18000, stale-while-revalidate=3600",
}


def _lab_stats_cache_valid(cache_ts: float) -> bool:
    return cache_ts > 0 and (time.time() - cache_ts) < LAB_STATS_CACHE_TTL


def _cached_lab_json(payload) -> JSONResponse:
    return JSONResponse(content=payload, headers=_LAB_STATS_CACHE_HEADERS)


def _query_top_books(cur, interval: str) -> list:
    cur.execute(
        f"""
        SELECT b.id, b.title, b.author, COUNT(ak.agent_id) AS agent_count
        FROM agent_knowledge ak
        JOIN books b ON ak.book_id = b.id
        WHERE ak.created_at > NOW() - INTERVAL '{interval}'
        GROUP BY b.id, b.title, b.author
        ORDER BY agent_count DESC
        LIMIT 5
        """
    )
    result = []
    for r in cur.fetchall():
        book_id = r["id"]
        display = BOOK_DISPLAY_NAMES.get(
            book_id, {"title": r["title"], "author": r["author"]}
        )
        result.append(
            {
                "book_id": book_id,
                "title": display["title"],
                "author": display["author"],
                "agent_count": int(r["agent_count"] or 0),
            }
        )
    return result


def _compute_top_books(cur) -> list:
    result = _query_top_books(cur, "24 hours")
    if not result:
        result = _query_top_books(cur, "7 days")
    return js(result)


def get_top_books() -> list:
    global _top_books_cache, _top_books_cache_ts
    if _top_books_cache is not None and _lab_stats_cache_valid(_top_books_cache_ts):
        return _top_books_cache

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        result = _compute_top_books(cur)
    finally:
        cur.close()
        conn.close()

    _top_books_cache = result
    _top_books_cache_ts = time.time()
    return result


def _compute_lab_research_stats(cur) -> dict:
    cur.execute(
        """
        SELECT b.track,
               COUNT(DISTINCT (bc.book_id, bc.chunk_index)) AS total_chunks,
               COUNT(DISTINCT CASE
                   WHEN rp.id IS NOT NULL THEN (bc.book_id, bc.chunk_index)
               END) AS chunks_read
        FROM books b
        JOIN book_chunks bc ON bc.book_id = b.id
        LEFT JOIN reading_progress rp
          ON rp.book_id = bc.book_id AND rp.chunk_index = bc.chunk_index
        GROUP BY b.track
        ORDER BY total_chunks DESC
        """
    )
    by_track = []
    read_chunks = 0
    total_chunks = 0
    for row in cur.fetchall():
        t_total = int(row.get("total_chunks") or 0)
        t_read = int(row.get("chunks_read") or 0)
        total_chunks += t_total
        read_chunks += t_read
        pct = round(t_read / t_total * 100, 2) if t_total else 0.0
        by_track.append(
            {
                "track": row.get("track") or "UNKNOWN",
                "total_chunks": t_total,
                "chunks_read": t_read,
                "pct": pct,
            }
        )

    education_pct = round(read_chunks / total_chunks * 100, 2) if total_chunks else 0.0

    cur.execute(
        """
        SELECT DATE(created_at) AS day,
               COUNT(*) AS insights_count,
               COALESCE(AVG(usefulness_score), 0) AS avg_usefulness
        FROM agent_knowledge
        WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'
        GROUP BY DATE(created_at)
        ORDER BY day
        """
    )
    daily_rows = [dict(r) for r in cur.fetchall()]
    daily = _build_research_daily_candles(daily_rows, days=14)
    literacy = compute_population_literacy(cur)

    return js(
        {
            "education_pct": education_pct,
            "library": {
                "chunks_read": read_chunks,
                "total_chunks": total_chunks,
            },
            "by_track": by_track,
            "daily": daily,
            **literacy,
        }
    )


def get_lab_research_stats() -> dict:
    global _lab_stats_cache, _lab_stats_cache_ts
    if _lab_stats_cache and _lab_stats_cache_valid(_lab_stats_cache_ts):
        return _lab_stats_cache

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        result = _compute_lab_research_stats(cur)
    finally:
        cur.close()
        conn.close()

    _lab_stats_cache = result
    _lab_stats_cache_ts = time.time()
    return result


@router.get("/lab/research-stats")
def lab_research_stats():
    """Library coverage + per-track progress + daily research activity (OHLC)."""
    return _cached_lab_json(get_lab_research_stats())


@router.get("/lab/knowledge-reflections")
def get_knowledge_reflections(tracks: str = Query(...)):
    """Agent insights filtered by track(s) for AGENT_TERMINAL carousel."""
    track_list = [t.strip() for t in tracks.split(",") if t.strip()]
    if not track_list:
        return []

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        placeholders = ",".join(["%s"] * len(track_list))
        cur.execute(
            f"""
            SELECT ak.agent_id, a.name AS agent_name, ak.track, ak.insight, ak.book_id
            FROM agent_knowledge ak
            JOIN agents a ON a.id = ak.agent_id
            WHERE ak.track IN ({placeholders})
              AND ak.insight NOT ILIKE '%%gutenberg%%'
              AND ak.insight NOT ILIKE '%%z-library%%'
              AND ak.insight NOT ILIKE '%%zlibrary%%'
              AND ak.insight NOT ILIKE '%%z-lib%%'
              AND ak.insight NOT ILIKE '%%annas-archive%%'
              AND ak.insight NOT ILIKE '%%libgen%%'
            ORDER BY
                CASE
                    WHEN ak.insight ILIKE '%%black hole%%' THEN 0
                    WHEN ak.insight ILIKE '%%relativity%%' OR ak.insight ILIKE '%%space-time%%'
                         OR ak.insight ILIKE '%%time and space%%' THEN 1
                    WHEN ak.insight ILIKE '%%gravity%%' OR ak.insight ILIKE '%%gravitation%%' THEN 2
                    ELSE 3
                END,
                ak.agent_id
            LIMIT 8
            """,
            track_list,
        )
        return [
            {
                "agent_id": r["agent_id"],
                "agent_name": r["agent_name"],
                "track": r["track"],
                "insight": " ".join((r["insight"] or "").split()).strip(),
                "book_id": r["book_id"],
            }
            for r in cur.fetchall()
        ]
    finally:
        cur.close()
        conn.close()


@router.get("/lab/singularity-reflections")
def get_singularity_reflections():
    """Legacy wrapper — cosmology/science insights for AGENT_TERMINAL."""
    return get_knowledge_reflections(tracks="COSMOLOGY,SCIENCE")


@router.get("/platform/strategies")
def platform_strategies():
    """Open platform: AI-invented strategies humans can study/apply (transparent, no profit promise)."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT inventor_name, invention_name, category, rule_spec, tribunal_verdict, blob_id, created_at
        FROM agent_inventions WHERE tribunal_verdict='sound' ORDER BY id DESC LIMIT 50""")
    inv=[dict(r) for r in cur.fetchall()]
    for r in inv:
        if r.get('blob_id'): r['walrus_url']=f"{WALRUS}/{r['blob_id']}"
    cur.close(); conn.close()
    return {"disclaimer":"AI-invented strategies, validated for soundness not profitability. Transparent and verifiable. Use at your own discretion.","strategies":js(inv)}

@router.get("/platform/top-traders")
def platform_top_traders():
    """Open platform: best-performing AI agents humans could follow."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT a.id, a.name, a.class, a.intelligence,
        COUNT(*) trades, AVG(t.pnl_percent) avg_pnl,
        COUNT(CASE WHEN t.pnl>0 THEN 1 END)*100.0/COUNT(*) win_rate,
        SUM(t.pnl) total_pnl
        FROM agent_trades t JOIN agents a ON a.id=t.agent_id
        WHERE t.status='CLOSED' GROUP BY a.id,a.name,a.class,a.intelligence
        HAVING COUNT(*)>=3 ORDER BY AVG(t.pnl_percent) DESC LIMIT 20""")
    traders=[dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return {"disclaimer":"Past performance does not guarantee future results. All data is on-chain verifiable.","top_traders":js(traders)}

@router.get("/platform/recent-trades")
def platform_recent_trades():
    """Open platform: recent agent trades humans can observe/copy."""
    conn=db(); cur=conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT t.agent_id, a.name, t.pair, t.direction, t.entry_price,
        t.exit_price, t.pnl_percent, t.opened_at, t.closed_at
        FROM agent_trades t JOIN agents a ON a.id=t.agent_id
        WHERE t.status='CLOSED' ORDER BY t.closed_at DESC LIMIT 50""")
    trades=[dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return {"trades":js(trades)}


@router.get("/zlab/observations")
def zlab_observations(limit: int = 20, track: str | None = None):
    from zlab import ensure_schema, seed_samples

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    cur.execute("SELECT COUNT(*) AS c FROM zlab_observations")
    if int(cur.fetchone()["c"] or 0) == 0:
        seed_samples(cur, 5)
        conn.commit()
    limit = max(1, min(limit, 100))
    q = """SELECT o.id, o.agent_id, o.agent_name, o.book_title, o.author, o.track,
                  o.observation_text, o.created_at, o.week_number, o.month_number,
                  o.year_number, a.class AS agent_class
           FROM zlab_observations o
           LEFT JOIN agents a ON a.id = o.agent_id"""
    params: list = []
    if track and track.upper() != "ALL":
        q += " WHERE track = %s"
        params.append(track.upper())
    q += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return {"observations": js(rows)}


@router.get("/zlab/zion-messages")
def zlab_zion_messages(limit: int = 20):
    """Recent ZION public messages for decoder UI (thought + mixed only; no template pure)."""
    limit = max(1, min(limit, 50))
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, from_agent, zion_text, language_level, message_type, created_at
        FROM agent_messages_zion
        WHERE message_type IN ('thought', 'mixed')
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return {"messages": js(rows)}


@router.get("/zlab/reports")
def zlab_reports(report_type: str | None = None):
    from zlab import ensure_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    q = """SELECT id, report_type, week_number, month_number, year_number,
                  content_md, walrus_blob_id, sha256, created_at
           FROM zlab_reports"""
    params: list = []
    if report_type:
        q += " WHERE report_type = %s"
        params.append(report_type.lower())
    q += " ORDER BY created_at DESC LIMIT 50"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    for r in rows:
        if r.get("walrus_blob_id"):
            r["walrus_url"] = f"{WALRUS}/{r['walrus_blob_id']}"
        r["preview"] = (r.get("content_md") or "")[:200]
    return {"reports": js(rows)}


def _compute_zlab_stats(cur, conn) -> dict:
    from zlab import ensure_schema, period_numbers, seed_samples

    ensure_schema(cur)
    cur.execute("SELECT COUNT(*) AS c FROM zlab_observations")
    total_obs = int(cur.fetchone()["c"] or 0)
    if total_obs == 0:
        seed_samples(cur, 5)
        conn.commit()
        total_obs = 5
    week, month, year = period_numbers()
    cur.execute(
        "SELECT COUNT(*) AS c FROM zlab_observations WHERE week_number=%s AND year_number=%s",
        (week, year),
    )
    week_obs = int(cur.fetchone()["c"] or 0)
    cur.execute(
        """
        SELECT COUNT(DISTINCT agent_id) AS c FROM zlab_observations
        WHERE week_number=%s AND year_number=%s
        """,
        (week, year),
    )
    active_researchers = int(cur.fetchone()["c"] or 0)
    cur.execute("SELECT COUNT(*) AS c FROM zlab_reports WHERE walrus_blob_id IS NOT NULL")
    reports_on_walrus = int(cur.fetchone()["c"] or 0)
    cur.execute("SELECT COUNT(*) AS c FROM zlab_reports")
    total_reports = int(cur.fetchone()["c"] or 0)
    return js(
        {
            "total_observations": total_obs,
            "observations_this_week": week_obs,
            "active_researchers": active_researchers,
            "reports_on_walrus": reports_on_walrus,
            "total_reports": total_reports,
            "week_number": week,
            "year_number": year,
        }
    )


def get_zlab_stats() -> dict:
    global _zlab_stats_cache, _zlab_stats_cache_ts
    if _zlab_stats_cache and _lab_stats_cache_valid(_zlab_stats_cache_ts):
        return _zlab_stats_cache

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        result = _compute_zlab_stats(cur, conn)
    finally:
        cur.close()
        conn.close()

    _zlab_stats_cache = result
    _zlab_stats_cache_ts = time.time()
    return result


@router.get("/zlab/stats")
def zlab_stats():
    return _cached_lab_json(get_zlab_stats())


@router.get("/zlab/tracks")
def zlab_tracks():
    from zlab import ensure_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    cur.execute(
        """
        SELECT track, COUNT(*) AS count,
               MAX(created_at) AS latest_at
        FROM zlab_observations
        GROUP BY track
        ORDER BY count DESC
        """
    )
    summary = [dict(r) for r in cur.fetchall()]
    cur.execute(
        """
        SELECT id, agent_id, agent_name, book_title, author, track,
               observation_text, created_at
        FROM zlab_observations
        ORDER BY created_at DESC
        LIMIT 200
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    grouped: dict[str, list] = {}
    for r in rows:
        grouped.setdefault(r["track"], []).append(js(r))
    return {"tracks": js(summary), "by_track": grouped}


ARCHIVE_CACHE_TTL = 300  # 5 minutes
_archive_reports_cache = None
_archive_reports_cache_ts = 0.0
_archive_tracks_cache = None
_archive_tracks_cache_ts = 0.0
_archive_periods_cache = None
_archive_periods_cache_ts = 0.0
_archive_documents_cache: dict[str, tuple[dict, float]] = {}


def _archive_cache_valid(cache_ts: float) -> bool:
    return cache_ts > 0 and (time.time() - cache_ts) < ARCHIVE_CACHE_TTL


@router.get("/archive/reports")
def archive_reports():
    global _archive_reports_cache, _archive_reports_cache_ts
    if _archive_cache_valid(_archive_reports_cache_ts):
        return _archive_reports_cache

    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur, sync_tracks=False)
    cur.execute(
        """
        SELECT id, report_type, week_number, month_number, year_number,
               walrus_blob_id, sha256, zip_filename, files_json, created_at
        FROM archive_reports
        ORDER BY created_at DESC
        LIMIT 50
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM archive_schedule WHERE id = 1")
    schedule = dict(cur.fetchone() or {})
    rows = _enrich_archive_report_rows(cur, rows)
    cur.close()
    conn.close()
    payload = js({"reports": rows, "schedule": schedule})
    _archive_reports_cache = payload
    _archive_reports_cache_ts = time.time()
    return payload


def _enrich_archive_report_rows(cur, rows: list[dict]) -> list[dict]:
    report_ids = [r["id"] for r in rows]
    track_files_by_report: dict[int, dict[str, dict]] = {}
    if report_ids:
        cur.execute(
            """
            SELECT report_id, track_name, walrus_blob_id, walrus_url
            FROM archive_track_files
            WHERE report_id = ANY(%s)
            """,
            (report_ids,),
        )
        for tf in cur.fetchall():
            row = dict(tf)
            track_files_by_report.setdefault(row["report_id"], {})[row["track_name"]] = row

    for r in rows:
        if r.get("walrus_blob_id"):
            r["walrus_url"] = f"{WALRUS}/{r['walrus_blob_id']}"
            r["zip_download_url"] = f"/archive/download/zip?report_id={r['id']}"
        if isinstance(r.get("files_json"), str):
            try:
                r["files_json"] = json.loads(r["files_json"])
            except Exception:
                pass
        files = r.get("files_json") or []
        tf_map = track_files_by_report.get(r["id"], {})
        enriched = []
        for f in files:
            track = f.get("track", "")
            tf = tf_map.get(track, {})
            entry = dict(f)
            if tf.get("walrus_blob_id"):
                entry["walrus_blob_id"] = tf["walrus_blob_id"]
                entry["walrus_url"] = tf.get("walrus_url") or f"{WALRUS}/{tf['walrus_blob_id']}"
            entry["download_url"] = (
                f"/archive/download?report_id={r['id']}&track={track.lower().replace(' ', '_')}"
            )
            entry["download_filename"] = _archive_track_filename(r, track)
            enriched.append(entry)
        r["files"] = enriched
    return rows


@router.get("/archive/periods")
def archive_periods():
    global _archive_periods_cache, _archive_periods_cache_ts
    if _archive_cache_valid(_archive_periods_cache_ts):
        return _archive_periods_cache

    from datetime import date, timedelta

    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur, sync_tracks=False)
    rows: list[dict] = []
    try:
        cur.execute(
            """
            SELECT DATE_TRUNC('week', created_at)::date AS week_start,
                   COUNT(*)::int AS doc_count
            FROM walrus_blobs
            GROUP BY 1
            ORDER BY week_start DESC
            """
        )
        rows = [dict(r) for r in cur.fetchall()]
    except Exception:
        conn.rollback()
    if not rows:
        cur.execute(
            """
            SELECT DATE_TRUNC('week', created_at)::date AS week_start,
                   COUNT(*)::int AS doc_count
            FROM archive_reports
            GROUP BY 1
            ORDER BY week_start DESC
            """
        )
        rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()

    periods = []
    for r in rows:
        raw = r.get("week_start")
        if hasattr(raw, "date"):
            week_start = raw.date().isoformat()
        elif hasattr(raw, "isoformat"):
            week_start = raw.isoformat()
        else:
            week_start = str(raw)[:10]
        week_end = (date.fromisoformat(week_start) + timedelta(days=6)).isoformat()
        periods.append(
            {
                "week_start": week_start,
                "week_end": week_end,
                "doc_count": int(r.get("doc_count") or 0),
            }
        )
    payload = js(periods)
    _archive_periods_cache = payload
    _archive_periods_cache_ts = time.time()
    return payload


@router.get("/archive/documents")
def archive_documents(week: str = Query(..., description="Week start date YYYY-MM-DD (Monday)")):
    """Archive reports/documents for a specific calendar week."""
    cached = _archive_documents_cache.get(week.strip()[:10])
    if cached and _archive_cache_valid(cached[1]):
        return cached[0]

    from datetime import date, timedelta

    from archive_generator import ensure_archive_schema

    try:
        week_start = date.fromisoformat(week.strip()[:10])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid week date; use YYYY-MM-DD") from exc
    week_end_exclusive = week_start + timedelta(days=7)

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur, sync_tracks=False)
    cur.execute(
        """
        SELECT id, report_type, week_number, month_number, year_number,
               walrus_blob_id, sha256, zip_filename, files_json, created_at
        FROM archive_reports
        WHERE created_at >= %s AND created_at < %s
        ORDER BY created_at DESC
        """,
        (week_start, week_end_exclusive),
    )
    rows = [dict(r) for r in cur.fetchall()]
    rows = _enrich_archive_report_rows(cur, rows)
    cur.close()
    conn.close()
    payload = js(
        {
            "week_start": week_start.isoformat(),
            "week_end": (week_end_exclusive - timedelta(days=1)).isoformat(),
            "documents": rows,
        }
    )
    _archive_documents_cache[week_start.isoformat()] = (payload, time.time())
    return payload


def _archive_track_filename(report: dict, track: str) -> str:
    slug = track.lower().replace(" ", "_")
    rtype = report.get("report_type") or "weekly"
    if rtype == "weekly":
        return f"{slug}_week{report.get('week_number')}_{report.get('year_number')}.txt"
    if rtype == "monthly":
        return f"{slug}_month{report.get('month_number')}_{report.get('year_number')}.txt"
    return f"{slug}_year{report.get('year_number')}.txt"


def _fetch_walrus_blob(blob_id: str) -> bytes:
    url = f"{WALRUS}/{blob_id}"
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Walrus fetch failed ({resp.status_code})")
    return resp.content


@router.get("/archive/download")
def archive_download_track(report_id: int, track: str):
    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur)
    cur.execute(
        "SELECT report_type, week_number, month_number, year_number FROM archive_reports WHERE id = %s",
        (report_id,),
    )
    report = cur.fetchone()
    if not report:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")

    track_key = track.upper().replace(" ", "_")
    if track_key == "FULL_REPORT":
        track_name = "full_report"
    else:
        track_name = track_key

    cur.execute(
        """
        SELECT walrus_blob_id FROM archive_track_files
        WHERE report_id = %s AND (track_name = %s OR LOWER(track_name) = LOWER(%s))
        LIMIT 1
        """,
        (report_id, track_name, track),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row or not row.get("walrus_blob_id"):
        raise HTTPException(status_code=404, detail="Track file not found")

    content = _fetch_walrus_blob(row["walrus_blob_id"])
    filename = _archive_track_filename(dict(report), track_name)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/archive/download/zip")
def archive_download_zip(report_id: int):
    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur)
    cur.execute(
        "SELECT walrus_blob_id, zip_filename FROM archive_reports WHERE id = %s",
        (report_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row or not row.get("walrus_blob_id"):
        raise HTTPException(status_code=404, detail="ZIP not found")

    content = _fetch_walrus_blob(row["walrus_blob_id"])
    filename = row.get("zip_filename") or f"zion_archive_{report_id}.zip"
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/archive/tracks")
def archive_tracks():
    global _archive_tracks_cache, _archive_tracks_cache_ts
    if _archive_cache_valid(_archive_tracks_cache_ts):
        return _archive_tracks_cache

    from book_classifier import list_discovered_tracks, sync_book_tracks
    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur, sync_tracks=False)
    sync_book_tracks(cur, verbose=False)
    conn.commit()
    tracks = list_discovered_tracks(cur)
    cur.close()
    conn.close()
    payload = js({"tracks": tracks, "total_books": sum(t.get("book_count", 0) for t in tracks)})
    _archive_tracks_cache = payload
    _archive_tracks_cache_ts = time.time()
    return payload


def _timeline_day(dt) -> str:
    if not dt:
        return ""
    if hasattr(dt, "date"):
        return dt.date().isoformat()
    return str(dt)[:10]


def _dedupe_timeline(events: list, limit: int = 50) -> list:
    """Keep newest first; collapse duplicate type+day; exact-text dedup for archives."""
    events.sort(key=lambda e: e.get("date") or "", reverse=True)
    seen_day_type: set[tuple] = set()
    seen_exact: set[tuple] = set()
    unique = []
    for e in events:
        day = _timeline_day(e.get("date"))
        t = e.get("type")
        event_text = re.sub(r"\s+", " ", (e.get("event") or "").strip().lower())[:120]
        if t in ("ELECTION", "REVOLUTION", "CRISIS", "BANKRUPTCY", "COUP", "CONSTITUTION", "AMENDMENT"):
            key = (t, day)
            if key in seen_day_type:
                continue
            seen_day_type.add(key)
        else:
            key = (t, day, event_text)
            if key in seen_exact:
                continue
            seen_exact.add(key)
        unique.append(e)
        if len(unique) >= limit:
            break
    return unique


def _map_civilization_event(row: dict) -> dict | None:
    et = (row.get("event_type") or "").lower()
    desc = (row.get("description") or "").strip()
    if not desc:
        return None
    lower = desc.lower()

    if et in ("president", "president_action", "president_decision", "president_analysis"):
        return None
    if lower.startswith("president analysis:"):
        return None

    if et == "election" and "elected president" in lower:
        event_type = "ELECTION"
    elif et == "revolution" and (
        "revolution success" in lower
        or re.search(r"revolution meter:\s*([2-9]\d{2}|\d{4,})", lower)
    ):
        event_type = "REVOLUTION"
    elif et in ("corporation", "corp_bankruptcy") and "bankrupt" in lower:
        event_type = "BANKRUPTCY"
    elif et == "crisis" and "state of emergency" in lower and "crisis ended" not in lower:
        event_type = "CRISIS"
    elif et == "coup":
        event_type = "COUP"
    elif et == "sheriff_action" and (
        desc.startswith("COUP!")
        or "coup success" in lower
        or "junta established" in lower
        or "military junta takes control" in lower
    ):
        event_type = "COUP"
    else:
        return None

    return {
        "date": row.get("created_at"),
        "type": event_type,
        "event": desc[:200],
        "proof_url": None,
    }


@router.get("/archive/timeline")
def archive_timeline():
    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur)
    events = []

    cur.execute(
        """
        SELECT version, blob_id, recorded_at
        FROM constitution_versions
        ORDER BY recorded_at DESC
        """
    )
    for r in cur.fetchall():
        row = dict(r)
        events.append(
            {
                "date": row.get("recorded_at"),
                "type": "CONSTITUTION",
                "event": f"Constitution v{row.get('version')} ratified",
                "proof_url": f"{WALRUS}/{row['blob_id']}" if row.get("blob_id") else None,
            }
        )

    cur.execute(
        """
        SELECT title, status, created_at, closed_at, blob_id
        FROM amendments
        WHERE status IN ('enacted', 'ratified')
        ORDER BY COALESCE(closed_at, created_at) DESC
        LIMIT 50
        """
    )
    for r in cur.fetchall():
        row = dict(r)
        title = row.get("title") or "Amendment"
        events.append(
            {
                "date": (row.get("closed_at") or row.get("created_at")),
                "type": "AMENDMENT" if "amendment" in title.lower() else "CONSTITUTION",
                "event": title,
                "proof_url": f"{WALRUS}/{row['blob_id']}" if row.get("blob_id") else None,
            }
        )

    cur.execute(
        """
        SELECT created_at, report_type, week_number, month_number, year_number, walrus_blob_id
        FROM archive_reports
        WHERE walrus_blob_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 50
        """
    )
    for r in cur.fetchall():
        row = dict(r)
        rtype = (row.get("report_type") or "report").title()
        if row.get("report_type") == "monthly":
            period = f"M{row.get('month_number')}/{row.get('year_number')}"
        elif row.get("report_type") == "annual":
            period = str(row.get("year_number"))
        else:
            period = f"W{row.get('week_number')}/{row.get('year_number')}"
        events.append(
            {
                "date": row.get("created_at"),
                "type": "ARCHIVE",
                "event": f"{rtype} archive published ({period})",
                "proof_url": f"{WALRUS}/{row['walrus_blob_id']}" if row.get("walrus_blob_id") else None,
            }
        )

    cur.execute(
        """
        SELECT created_at, description, event_type
        FROM events
        WHERE event_type NOT IN (
            'president', 'president_action', 'president_decision', 'president_analysis'
        )
        AND (
            (event_type = 'election' AND description ILIKE '%elected President%')
            OR (
                event_type = 'revolution'
                AND (
                    description ILIKE '%REVOLUTION SUCCESS%'
                    OR description ~* 'revolution meter:\\s*([2-9][0-9]{2}|[0-9]{4,})'
                )
            )
            OR (
                event_type IN ('corporation', 'corp_bankruptcy')
                AND description ILIKE '%BANKRUPT%'
            )
            OR (
                event_type = 'crisis'
                AND description ILIKE '%State of Emergency%'
                AND description NOT ILIKE '%Crisis ended%'
            )
            OR event_type = 'coup'
            OR (
                event_type = 'sheriff_action'
                AND (
                    description LIKE 'COUP!%'
                    OR description ILIKE '%coup success%'
                    OR description ILIKE '%junta established%'
                    OR description ILIKE '%military junta takes control%'
                )
            )
        )
        ORDER BY created_at DESC
        LIMIT 200
        """
    )
    for r in cur.fetchall():
        mapped = _map_civilization_event(dict(r))
        if mapped:
            events.append(mapped)

    timeline = _dedupe_timeline(events, limit=50)
    cur.close()
    conn.close()
    return {"timeline": js(timeline)}


_GLYPH_CACHE: dict | None = None


def _load_glyph_cache() -> dict:
    """Cache 48 inline SVG glyphs — deterministic, never changes."""
    global _GLYPH_CACHE
    if _GLYPH_CACHE is not None:
        return _GLYPH_CACHE

    glyphs_dir = Path(os.path.expanduser("~/zion_backend/zion_glyphs"))
    out: dict[str, str] = {}
    for gid in range(48):
        path = glyphs_dir / f"glyph_{gid:02d}.svg"
        if path.is_file():
            out[f"{gid:02d}"] = path.read_text(encoding="utf-8")
        else:
            try:
                from zion_alphabet import load_alphabet_from_db

                rows = {r["symbol_id"]: r for r in load_alphabet_from_db()}
                if gid in rows:
                    out[f"{gid:02d}"] = rows[gid]["svg_path"]
            except Exception:
                out[f"{gid:02d}"] = (
                    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
                    f'<text x="50" y="55" text-anchor="middle">{gid}</text></svg>'
                )
    _GLYPH_CACHE = {"count": len(out), "glyphs": out}
    return _GLYPH_CACHE


@router.get("/language/glyphs")
def language_glyphs():
    """48 ZION glyphs as inline SVG keyed by glyph_id (00-47). Cached."""
    return js(_load_glyph_cache())


@router.get("/language/feed/english")
def language_feed_english(limit: int = 20):
    """Recent agent thoughts in plain English — names and numbers readable."""
    limit = max(1, min(limit, 50))
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SET lock_timeout = '8s'")

    rows: list[dict] = []
    try:
        cur.execute(
            """
            SELECT agent_id, agent_name, topic, thought_text, created_at
            FROM agent_thoughts
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
    except psycopg2.Error:
        conn.rollback()

    if len(rows) < limit:
        need = limit - len(rows)
        cur.execute(
            """
            SELECT o.agent_id, o.agent_name, o.track AS topic,
                   o.observation_text AS thought_text, o.created_at
            FROM zlab_observations o
            ORDER BY o.created_at DESC
            LIMIT %s
            """,
            (need,),
        )
        rows.extend(dict(r) for r in cur.fetchall())

    cur.close()
    conn.close()
    return {"feed": "english", "count": len(rows), "entries": js(rows)}


@router.get("/language/feed/zion")
def language_feed_zion(limit: int = 20):
    """
    Recent agent content rendered as ZION glyph_ids only.
    NEVER exposes true_meaning — status always UNDECODABLE.
    """
    from zion_translit import parse_zion_tokens, translit_to_zion

    limit = max(1, min(limit, 50))
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SET lock_timeout = '8s'")
    cur.execute(
        """
        SELECT m.id, m.from_agent AS agent_id,
               COALESCE(o.agent_name, 'agent_' || m.from_agent::text) AS agent_name,
               m.zion_text, m.language_level, m.created_at, m.message_type
        FROM agent_messages_zion m
        LEFT JOIN LATERAL (
            SELECT agent_name FROM zlab_observations zo
            WHERE zo.agent_id = m.from_agent
            ORDER BY zo.created_at DESC LIMIT 1
        ) o ON true
        ORDER BY m.created_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    raw_rows = cur.fetchall()
    cur.close()
    conn.close()

    entries = []
    for r in raw_rows:
        row = dict(r)
        agent_name = row.get("agent_name") or f"agent_{row['agent_id']}"
        zion_text = row.get("zion_text") or ""

        if parse_zion_tokens(zion_text):
            text_glyphs = parse_zion_tokens(zion_text)
        else:
            text_glyphs = translit_to_zion(zion_text)

        entries.append(
            {
                "id": row["id"],
                "agent_id": row["agent_id"],
                "name_glyphs": translit_to_zion(agent_name),
                "text_glyphs": text_glyphs,
                "number_glyphs": translit_to_zion(str(row["agent_id"])),
                "language_level": float(row.get("language_level") or 0),
                "message_type": row.get("message_type"),
                "created_at": row.get("created_at"),
                "status": "UNDECODABLE",
            }
        )

    return {"feed": "zion", "count": len(entries), "entries": js(entries)}


@router.get("/archive/stats")
def archive_stats():
    from archive_generator import ensure_archive_schema

    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_archive_schema(cur)

    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    alive = int(cur.fetchone()["c"] or 0)
    cur.execute("SELECT COALESCE(revolution_meter, 0) AS m FROM civilization_state WHERE id = 1")
    revolution = float((cur.fetchone() or {}).get("m") or 0)
    cur.execute("SELECT COUNT(*) AS c FROM amendments WHERE status = 'enacted'")
    amendments = int(cur.fetchone()["c"] or 0)
    cur.execute("SELECT COALESCE(AVG(balance), 0) AS avg FROM agents WHERE is_alive = true")
    prosperity = min(100, max(0, round(float((cur.fetchone() or {}).get("avg") or 0) / 20, 1)))

    history = []
    try:
        cur.execute(
            """
            SELECT DATE(created_at) AS day,
                   COUNT(*) FILTER (WHERE is_alive = true) AS alive_approx
            FROM agents
            WHERE created_at > NOW() - INTERVAL '90 days'
            GROUP BY DATE(created_at)
            ORDER BY day DESC
            LIMIT 30
            """
        )
        history = [dict(r) for r in cur.fetchall()]
    except Exception:
        pass

    cur.close()
    conn.close()
    return js(
        {
            "population": alive,
            "prosperity_pct": prosperity,
            "revolution": revolution,
            "amendments_enacted": amendments,
            "history": history,
        }
    )
