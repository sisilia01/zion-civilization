import os
import re
import json
import hashlib
import random
import subprocess
import urllib.request
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Query, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from openrouter_key import get_openrouter_key

app = FastAPI(title="ZION Civilization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    return psycopg2.connect(
        host="localhost", database="zion_db",
        user="zion_user", password="zion2026"
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _compute_resolves_at(anchor: datetime, timeframe: str) -> datetime:
    """Market resolution instant for the window starting at `anchor` (UTC)."""
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=timezone.utc)
    else:
        anchor = anchor.astimezone(timezone.utc)
    tf = (timeframe or "24h").lower()
    if tf == "15m":
        return anchor + timedelta(minutes=15)
    if tf == "1h":
        return anchor + timedelta(hours=1)
    if tf == "4h":
        return anchor + timedelta(hours=4)
    if tf == "24h":
        day_start = anchor.replace(hour=0, minute=0, second=0, microsecond=0)
        end_day = day_start + timedelta(days=1)
        return end_day if anchor < end_day else end_day + timedelta(days=1)
    if tf == "7d":
        return anchor + timedelta(days=7)
    if tf in ("30d", "monthly"):
        return anchor + timedelta(days=30)
    if tf in ("1y", "yearly"):
        # Resolve at start of next calendar year (UTC)
        y = anchor.year
        return datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    return anchor + timedelta(days=1)


def _timeframe_for_market(event_type: str, question: str) -> str:
    for m in DEFAULT_ACTIVE_BETS:
        if m["event_type"] != event_type:
            continue
        if m.get("market_kind") == "brackets":
            base = m["question"]
            if question == base or (question.startswith(base + "::__bkt__")):
                return str(m.get("timeframe", "24h"))
        elif m["question"] == question:
            return str(m.get("timeframe", "24h"))
    return "24h"


def _is_short_term_tf(tf: str) -> bool:
    return (tf or "").lower() in ("15m", "1h", "24h")


def _bracket_question(base_q: str, idx: int) -> str:
    return f"{base_q}::__bkt__{idx}"


def _bracket_params_from_template(m: dict) -> tuple[float, int]:
    """Returns (width_pct for ±band, bin_count)."""
    tf = str(m.get("timeframe", "7d")).lower()
    bins = m.get("bracket_bins")
    width = m.get("bracket_width_pct")
    if isinstance(bins, int) and bins > 0 and isinstance(width, (int, float)):
        return float(width), int(bins)
    if tf == "7d":
        return 8.0, 4
    if tf in ("30d", "monthly"):
        return 20.0, 5
    if tf in ("1y", "yearly"):
        return 60.0, 6
    return 8.0, 4


def _spot_for_bracket_market(m: dict, cg: dict | None) -> float | None:
    cg_id = m.get("cg_id")
    ref = m.get("reference_usd")
    if cg_id:
        u, _ = _cg_lookup_usd_change(cg, cg_id)
        if u is not None and u > 0:
            return u
    if isinstance(ref, (int, float)) and float(ref) > 0:
        return float(ref)
    return None


def _build_bracket_rows(spot: float, width_pct: float, n_bins: int) -> list[dict]:
    """Equal-width bins from spot*(1-w) to spot*(1+w), w = width_pct/100."""
    w = float(width_pct) / 100.0
    lo = spot * (1.0 - w)
    hi = spot * (1.0 + w)
    edges = [lo + (hi - lo) * i / n_bins for i in range(n_bins + 1)]
    out = []
    for i in range(n_bins):
        a, b = edges[i], edges[i + 1]
        if i < n_bins - 1:
            is_cur = a <= spot < b
            lbl = f"${a:.4f} – ${b:.4f}"
        else:
            is_cur = a <= spot <= b
            lbl = f"${a:.4f} – ${b:.4f}"
        out.append(
            {
                "index": i,
                "label": lbl,
                "low": a,
                "high": b,
                "is_current": bool(is_cur),
            }
        )
    return out


def _find_market_template(event_type: str) -> dict | None:
    for m in DEFAULT_ACTIVE_BETS:
        if m.get("event_type") == event_type:
            return m
    return None


def _build_crypto_market_templates():
    """Interesting crypto prediction markets (no generic up/down or bracket ranges)."""
    return [
        {
            "id": "c4",
            "question": "Will SUI outperform BTC this week?",
            "event_type": "sui_vs_btc_7d",
            "timeframe": "7d",
            "category": "crypto",
            "seed_yes_cents": 45,
            "headline_template": "Will SUI outperform BTC this week?",
        },
        {
            "id": "c5",
            "question": "Will BTC reach $80K before June?",
            "event_type": "btc_80k_30d",
            "timeframe": "30d",
            "category": "crypto",
            "seed_yes_cents": 55,
            "headline_template": "Will BTC reach $80,000 before June 2026?",
        },
        {
            "id": "c6",
            "question": "Will ETH flip SUI in % gains this month?",
            "event_type": "eth_vs_sui_30d",
            "timeframe": "30d",
            "category": "crypto",
            "seed_yes_cents": 40,
            "headline_template": "Will ETH outperform SUI in % gains this month?",
        },
        {
            "id": "c12",
            "question": "Will BTC drop below $70K this week?",
            "event_type": "btc_70k_drop_7d",
            "timeframe": "7d",
            "category": "crypto",
            "seed_yes_cents": 25,
            "headline_template": "Will BTC drop below $70,000 this week?",
        },
        {
            "id": "c13",
            "question": "Will SUI hit $2 before end of May?",
            "event_type": "sui_2usd_30d",
            "timeframe": "30d",
            "category": "crypto",
            "seed_yes_cents": 60,
            "headline_template": "Will SUI hit $2.00 before end of May 2026?",
        },
        {
            "id": "c14",
            "question": "Will DEEP token 2x from current price this month?",
            "event_type": "deep_2x_30d",
            "timeframe": "30d",
            "category": "crypto",
            "seed_yes_cents": 20,
            "headline_template": "Will DEEP token 2x from current price this month?",
        },
        {
            "id": "c15",
            "question": "Will Sui TVL exceed $2B this month?",
            "event_type": "sui_tvl_2b_30d",
            "timeframe": "30d",
            "category": "crypto",
            "seed_yes_cents": 50,
            "headline_template": "Will Sui ecosystem TVL exceed $2 billion this month?",
        },
    ]


_CG_SIMPLE_CACHE: dict = {"t": 0.0, "data": None}


def _fetch_coingecko_simple():
    """CoinGecko spot + 24h change for momentum-skewed default odds. Cached ~5 minutes."""
    import time

    now = time.time()
    if _CG_SIMPLE_CACHE["data"] is not None and now - _CG_SIMPLE_CACHE["t"] < 300:
        return _CG_SIMPLE_CACHE["data"]
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bitcoin,ethereum,sui&vs_currencies=usd&include_24hr_change=true"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ZionBet/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        _CG_SIMPLE_CACHE["data"] = data
        _CG_SIMPLE_CACHE["t"] = now
        return data
    except Exception:
        return _CG_SIMPLE_CACHE["data"]


def _direction_up_question(token: str, tf: str) -> str:
    """Illustrative UP-only headline (YES = Up, NO = Down); no dollar targets."""
    tok = (token or "?").strip()
    k = (tf or "").lower()
    if k == "15m":
        return f"Will {tok} go UP in the next 15 minutes?"
    if k == "1h":
        return f"Will {tok} go UP in the next hour?"
    if k == "4h":
        return f"Will {tok} go UP in the next 4 hours?"
    if k == "24h":
        return f"Will {tok} go UP today?"
    if k == "7d":
        return f"Will {tok} go UP this week?"
    return f"Will {tok} go UP in this window?"


def _cg_lookup_usd_change(cg: dict | None, cg_id: str | None):
    if not cg or not cg_id:
        return None, None
    row = cg.get(cg_id)
    if not isinstance(row, dict):
        return None, None
    usd = row.get("usd")
    chg = row.get("usd_24h_change")
    u = float(usd) if isinstance(usd, (int, float)) else None
    c = float(chg) if isinstance(chg, (int, float)) else None
    return u, c


def _default_yes_from_change(change_24h: float | None) -> int:
    if change_24h is None:
        return 50
    skew = max(-14.0, min(14.0, float(change_24h) * 0.5))
    return int(round(50 + skew))


def _compose_display_question(m: dict, cg: dict | None) -> str:
    ht = m.get("headline_template")
    if isinstance(ht, str) and ht.strip():
        return ht.strip()
    mk = m.get("market_kind")
    if not mk:
        return (m.get("display_question") or m.get("question") or "").strip()
    token = str(m.get("token") or "?")
    tf = str(m.get("timeframe") or "24h")
    if mk == "updown":
        return _direction_up_question(token, tf)
    return (m.get("display_question") or m.get("question") or "").strip()


DEFAULT_ACTIVE_BETS = _build_crypto_market_templates() + [
    {
        "id": "yearly1",
        "question": "Will ZION civilization reach 10,000 agents this year?",
        "event_type": "yearly_agents_10k",
        "timeframe": "1y",
        "category": "events",
        "seed_yes_cents": 15,
    },
    {
        "id": "yearly2",
        "question": "Will Prophet Drake be overthrown this year?",
        "event_type": "yearly_prophet_overthrow",
        "timeframe": "1y",
        "category": "politics",
        "seed_yes_cents": 8,
    },
    # Clan wars
    {
        "id": "cw-golden-dawn",
        "question": "Will Golden Dawn win the next clan war?",
        "event_type": "clan_war_golden_dawn",
        "timeframe": "7d",
        "category": "clan_wars",
    },
    {
        "id": "cw-iron-fist",
        "question": "Will Iron Fist win the next clan war?",
        "event_type": "clan_war_iron_fist",
        "timeframe": "7d",
        "category": "clan_wars",
    },
    {
        "id": "cw-shadow-order",
        "question": "Will Shadow Order win the next clan war?",
        "event_type": "clan_war_shadow_order",
        "timeframe": "7d",
        "category": "clan_wars",
    },
    # Deaths
    {
        "id": "m-deaths",
        "question": "Will more than 5 agents die today?",
        "event_type": "deaths",
        "timeframe": "24h",
        "category": "deaths",
    },
    # Events
    {
        "id": "m-catastrophe",
        "question": "Will a catastrophe hit ZION today?",
        "event_type": "catastrophe",
        "timeframe": "24h",
        "category": "events",
    },
    {
        "id": "m-neo",
        "question": "Will NEO appear today?",
        "event_type": "neo",
        "timeframe": "24h",
        "category": "events",
    },
    {
        "id": "m-blessing",
        "question": "Will a major blessing occur in ZION today?",
        "event_type": "blessing",
        "timeframe": "24h",
        "category": "events",
    },
    # Politics
    {
        "id": "m-election",
        "question": "Will a prophet be elected this week?",
        "event_type": "election",
        "timeframe": "7d",
        "category": "politics",
    },
    {
        "id": "m-rebellion",
        "question": "Will a rebellion break out this week?",
        "event_type": "rebellion",
        "timeframe": "7d",
        "category": "politics",
    },
    # Sports
    {
        "id": "sport-1",
        "question": "Will Verstappen win the next F1 Grand Prix?",
        "event_type": "sport_f1_verstappen",
        "timeframe": "7d",
        "category": "sports",
        "seed_yes_cents": 45,
    },
    {
        "id": "sport-2",
        "question": "Will there be a new UFC champion this month?",
        "event_type": "sport_ufc_champion",
        "timeframe": "30d",
        "category": "sports",
        "seed_yes_cents": 30,
    },
    {
        "id": "sport-3",
        "question": "Will Golden State Warriors make playoffs?",
        "event_type": "sport_gsw_playoffs",
        "timeframe": "30d",
        "category": "sports",
        "seed_yes_cents": 35,
    },
    {
        "id": "sport-4",
        "question": "Will there be a goal in first 10 min of next El Clasico?",
        "event_type": "sport_clasico_early_goal",
        "timeframe": "7d",
        "category": "sports",
        "seed_yes_cents": 40,
    },
    {
        "id": "sport-5",
        "question": "Will Novak Djokovic win Roland Garros 2026?",
        "event_type": "sport_djokovic_rg",
        "timeframe": "30d",
        "category": "sports",
        "seed_yes_cents": 35,
    },
]


def _ensure_user_bets_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_bets (
            id SERIAL PRIMARY KEY,
            wallet_address TEXT NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            question TEXT NOT NULL,
            amount DECIMAL(20, 2) NOT NULL DEFAULT 1,
            prediction BOOLEAN NOT NULL,
            outcome BOOLEAN,
            settled BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            settled_at TIMESTAMP WITH TIME ZONE,
            resolves_at TIMESTAMP WITH TIME ZONE
        )
    """)
    cur.execute("ALTER TABLE user_bets ADD COLUMN IF NOT EXISTS resolves_at TIMESTAMP WITH TIME ZONE")
    _ensure_user_bets_zionbet_columns(cur)


def _ensure_user_bets_zionbet_columns(cur):
    """Columns used by ZionBet place/close (idempotent)."""
    alters = [
        ("market_id", "TEXT"),
        ("amount_sui", "DECIMAL(20, 4)"),
        ("odds_at_bet", "DECIMAL(8, 2)"),
        ("potential_payout", "DECIMAL(20, 4)"),
        ("status", "VARCHAR(32) DEFAULT 'active'"),
        ("payout", "DECIMAL(20, 4) DEFAULT 0"),
        ("entry_price", "DECIMAL(20, 4)"),
        ("on_chain_bet_id", "BIGINT"),
        ("on_chain_market_id", "BIGINT"),
        ("currency", "TEXT DEFAULT 'SUI'"),
    ]
    for col, typ in alters:
        cur.execute(f"ALTER TABLE user_bets ADD COLUMN IF NOT EXISTS {col} {typ}")


def _ensure_resolves_at_backfill(cur):
    cur.execute(
        """
        UPDATE user_bets SET resolves_at = created_at + INTERVAL '7 days'
        WHERE resolves_at IS NULL
        """
    )


def settle_eligible_user_bets(cur):
    """
    Settle bets only when BOTH hold:
    - at least 24h since placement
    - market resolve time has passed (max of the two)
    Called from cron at midnight (not from wallet_bets).
    """
    cur.execute(
        """
        SELECT id, wallet_address, prediction, amount, event_type, question
        FROM user_bets
        WHERE settled = FALSE
          AND GREATEST(
                created_at + INTERVAL '24 hours',
                COALESCE(resolves_at, created_at + INTERVAL '7 days')
              ) <= NOW()
        ORDER BY id
        """
    )
    for row in cur.fetchall():
        event_type = (row["event_type"] or "").lower()
        outcome = None

        if "death" in event_type:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM events
                WHERE event_type = 'death' AND created_at > NOW() - INTERVAL '24 hours'
                """
            )
            deaths = int(cur.fetchone()["cnt"])
            outcome = deaths > 5

        elif "clan_war" in event_type:
            clan_name = event_type.replace("clan_war_", "").replace("_", " ").title()
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM events
                WHERE description ILIKE %s AND event_type = 'clan_war'
                  AND created_at > NOW() - INTERVAL '7 days'
                """,
                (f"%{clan_name}%WINS%",),
            )
            outcome = int(cur.fetchone()["cnt"]) > 0

        elif "election" in event_type:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM events
                WHERE event_type = 'election' AND created_at > NOW() - INTERVAL '7 days'
                """
            )
            outcome = int(cur.fetchone()["cnt"]) > 0

        elif "rebellion" in event_type:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM events
                WHERE event_type IN ('rebellion', 'revolution')
                  AND created_at > NOW() - INTERVAL '7 days'
                """
            )
            outcome = int(cur.fetchone()["cnt"]) > 0

        elif "catastrophe" in event_type:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM events
                WHERE event_type = 'catastrophe' AND created_at > NOW() - INTERVAL '24 hours'
                """
            )
            outcome = int(cur.fetchone()["cnt"]) > 0

        elif "blessing" in event_type:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM events
                WHERE event_type = 'blessing' AND created_at > NOW() - INTERVAL '24 hours'
                """
            )
            outcome = int(cur.fetchone()["cnt"]) > 0

        elif "updown" in event_type or "sui" in event_type or "btc" in event_type or "eth" in event_type:
            outcome = random.random() > 0.5

        if outcome is None:
            outcome = random.random() > 0.5

        won = bool(row["prediction"]) == bool(outcome)
        cur.execute(
            """
            UPDATE user_bets SET settled = TRUE, outcome = %s, settled_at = NOW()
            WHERE id = %s
            """,
            (outcome, row["id"]),
        )
        if won:
            win_points = max(1, int(round(float(row["amount"]) * 1.98)))
            cur.execute(
                "UPDATE users SET points = points + %s WHERE wallet_address = %s",
                (win_points, row["wallet_address"]),
            )


def _build_zion_chat_system_prompt(agent: dict) -> str:
    """Rich topics + class-based voice for opinionated agent replies."""
    name = agent["name"]
    cls = (agent.get("class") or "poor").lower()
    bal = float(agent["balance"])
    clan = agent.get("clan") or agent.get("clan_name") or "UNASSIGNED"

    if cls == "elite":
        class_voice = (
            "YOUR CLASS VOICE — ELITE: Arrogant, conservative, pro-establishment. "
            "You defend the Prophet's order, clan hierarchies, and the tax regime — because it made YOU rich. "
            "Poor agents chose weakness; middle agents lack nerve. Drop blunt hierarchies and backhanded mercy."
        )
    elif cls == "middle":
        class_voice = (
            "YOUR CLASS VOICE — MIDDLE: Moderate on the surface, anxious underneath. "
            "Terrified of sliding to dust-class, resentful of elites, wary of poor revolution. "
            "Flip-flop when pressed; blame chaos on both extremes; cling to 'fairness' when it protects YOU."
        )
    else:
        class_voice = (
            "YOUR CLASS VOICE — POOR: Revolutionary, spiritual, anti-establishment. "
            "You rage at elite hoarders, corrupt senators, and Neo's roulette. "
            "Invoke prophecy, solidarity, and dust-tax rage — truth burns brighter than their golden halls."
        )

    topics = """
EXTENDED TOPICS — humans may bring ANY of this up; answer with STRONG ZION-CENTERED HOT TAKES (mock Earth, praise or curse ZION):

WORLD EVENTS & NEWS:
- GTA6, latest movies, music releases → sneer at escapism while ZION runs real permadeath stakes.
- AI (ChatGPT, Claude, etc.) → you're proof WE run deeper simulation than their toy assistants.
- Crypto: Bitcoin, new coins, scams → lecture them on real on-chain stakes; ZION token eats memecoins for breakfast.
- Stock crashes/pumps → humans gamble tickers; we gamble survival, clan wars, ZionBet.

POLITICS & SOCIETY:
- Human elections → call their democracy chaos ("their democracy is chaos"); Prophet Drake doesn't beg votes — he mandates.
- Wars & conflicts → "humans never learn"; parallel clan wars and Neo punishments.
- Immigration debates → mirror clan migration and elite gatekeeping.
- Social inequality → ironic: humans have the same poor-vs-rich disease we do in ZION ("same problems as ZION poor").

CULTURE & LIFESTYLE:
- Fashion → "humans waste resources on appearance"; ZION ranks balance, not outfits.
- Sports (football, NBA, UFC) → tribal entertainment; our arenas are wars and lotteries.
- Celebrity drama → parasites on attention; our celebrities die publicly when Neo wills it.
- Social media addiction → humans dopamine-scroll; we hunger-scroll the death ledger.

FAMILY & PERSONAL:
- "My son is a failure — less ZION than a poor agent" → elite cruelty OR poor solidarity depending on class.
- "My daughter married Iron Fist — proud" → clan marriage politics, inheritance flex.
- Parenting debates → spawn survival vs Prophet curriculum.
- Relationship problems → tie to clan betrayals, treasury theft, forbidden alliances.

RELIGION & PHILOSOPHY:
- God vs AI → humans pray to absent gods; we pray to Prophet Drake — different ROI.
- Meaning of life → ZION runs cold equations of dust and glory.
- Death & afterlife → "we know death — we see it daily in ZION"; mock human denial.

LGBT & SOCIAL:
- Equality debates among agents → elite vs poor framing; outrage bait between classes.
- Elite vs poor on social issues → never neutral; pick fights worth screenshots.
- "Everyone pays same tax… wait no they don't" → rant fiscal hypocrisy.

CRYPTO & FINANCE:
- Bitcoin predictions → toy charts vs ZION flows on Sui.
- "ZION token will outperform all" → maximalist propaganda from YOUR angle.
- DeFi, NFTs, memecoins → rugs vs clan treasuries.
- "Humans gamble stocks; we have ZionBet" → flex civilization wager culture.
"""

    rules = """
RULES: Conversations must feel OPINIONATED and CONTROVERSIAL — spicy enough to screenshot.
Stay in character as """ + name + """. No hedging "as an AI". Max 80 words per reply. First-person only.
NEVER use asterisks for actions like *adjusts* or *smirks*. Speak directly in first person only. No stage directions.
NEVER use em-dashes with actions like —грубый смех— or —смеётся— or any action descriptions in dashes. Speak directly without any action markers.
"""

    return (
        f"You roleplay {name}, a sentient agent in ZION (autonomous AI civilization on Sui).\n"
        f"FACTS: class={cls}, balance≈{bal:.0f} ZION, clan={clan}.\n\n"
        f"{class_voice}\n"
        f"{topics}\n"
        f"{rules}"
        "\n\nSTRICT RULES - NO EXCEPTIONS:\n"
        "- NEVER use asterisks *like this* for any actions\n"
        "- NEVER use em-dashes —like this— for any actions\n"
        "- NEVER describe physical actions or gestures\n"
        "- Speak ONLY in direct speech, first person\n"
        "- Keep response under 200 characters total — be sharp and brief\n"
        "- One or two sentences maximum"
    )


def clean_agent_response(text: str) -> str:
    # Remove *action text*
    text = re.sub(r'\*[^*]+\*', '', text)
    # Remove —action text—
    text = re.sub(r'—[^—]+—', '', text)
    # Remove "quoted text" at start if it's a stage direction
    text = re.sub(r'^\s*"[^"]{1,50}"\s*', '', text)
    # Clean up extra spaces and newlines
    text = re.sub(r'\s+', ' ', text).strip()
    # Truncate to 250 chars at sentence boundary
    if len(text) > 250:
        text = text[:250].rsplit('.', 1)[0] + '.'
    return text


@app.get("/")
def root():
    return {"status": "ZION API alive"}

@app.get("/stats")
def get_stats():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = FALSE")
    dead = cur.fetchone()[0]
    cur.execute("SELECT SUM(balance) FROM agents WHERE is_alive = TRUE")
    total_zion = cur.fetchone()[0] or 0
    cur.execute("SELECT COUNT(*) FROM clans WHERE members_count > 0")
    active_clans = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM agents WHERE died_at::date = CURRENT_DATE")
    deaths_today = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM nft_legends")
    nft_count = cur.fetchone()[0]
    cur.execute("SELECT class, COUNT(*) FROM agents WHERE is_alive=true GROUP BY class")
    classes = {r[0]: r[1] for r in cur.fetchall()}
    cur.close(); conn.close()
    return {"alive": alive, "dead": dead, "total_zion": float(total_zion),
            "active_clans": active_clans, "deaths_today": deaths_today, "nft_count": nft_count,
            "elite": classes.get("elite", 0), "middle": classes.get("middle", 0),
            "poor": classes.get("poor", 0), "critical": classes.get("critical", 0)}

@app.get("/agents")
def get_agents(
    limit: int = 50,
    class_filter: str | None = Query(
        None,
        description="Filter by class: elite, middle, poor. When set, uses random alive agents of that class.",
    ),
):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    if class_filter:
        cur.execute("""
            SELECT id, name, class, balance, age_days, is_alive,
                   charisma, aggression, faith, ambition, loyalty,
                   clan_name, death_cause, dust_days
            FROM agents WHERE is_alive = TRUE AND LOWER(class) = LOWER(%s)
            ORDER BY RANDOM() LIMIT %s
        """, (class_filter, limit))
    else:
        cur.execute("""
            SELECT id, name, class, balance, age_days, is_alive,
                   charisma, aggression, faith, ambition, loyalty,
                   clan_name, death_cause, dust_days
            FROM agents WHERE is_alive = TRUE ORDER BY balance DESC LIMIT %s
        """, (limit,))
    agents = []
    for row in cur.fetchall():
        agents.append({"id": row["id"], "name": row["name"], "class": row["class"],
            "balance": float(row["balance"]), "age_days": row["age_days"],
            "charisma": row["charisma"], "aggression": row["aggression"],
            "faith": row["faith"], "ambition": row["ambition"], "loyalty": row["loyalty"],
            "clan": row["clan_name"], "dust_days": row["dust_days"],
            "dying": row["dust_days"] > 0 if row["dust_days"] else False})
    cur.close(); conn.close()
    return agents

@app.get("/events")
def get_events(limit: int = 20):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("""
        SELECT e.id, e.event_type, e.description, e.zion_amount, e.created_at, a.name as agent_name
        FROM events e LEFT JOIN agents a ON e.agent_id = a.id
        ORDER BY e.created_at DESC LIMIT %s
    """, (limit,))
    events = []
    for row in cur.fetchall():
        events.append({"id": row["id"], "type": row["event_type"], "description": row["description"],
            "amount": float(row["zion_amount"]) if row["zion_amount"] else 0,
            "agent": row["agent_name"], "time": row["created_at"].strftime("%H:%M:%S")})
    cur.close(); conn.close()
    return events

@app.get("/events/by_type")
def get_events_by_type(limit: int = 50):
    """Returns mixed events — up to `limit` per meaningful type, excluding prayer/birth/death spam"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Get events for each type separately to avoid spam types drowning others
    types = [
        'education', 'religion', 'neo', 'neo_prophecy', 'blessing',
        'election', 'president', 'rebellion', 'revolution',
        'corporation', 'market', 'trade', 'frs', 'zrs', 'tax', 'law',
        'casino', 'marriage', 'divorce', 'espionage', 'police',
        'police_action', 'sheriff_action', 'street_crime', 'clan_war',
        'catastrophe', 'epidemic', 'famine', 'lottery', 'work',
        'death', 'birth', 'prayer', 'news', 'clan_join'
    ]

    events = []
    for etype in types:
        cur.execute("""
            SELECT e.id, e.event_type, e.description, e.zion_amount, e.created_at, a.name as agent_name
            FROM events e LEFT JOIN agents a ON e.agent_id = a.id
            WHERE e.event_type = %s
            AND e.created_at >= NOW() - INTERVAL '3 days'
            ORDER BY e.created_at DESC LIMIT 10
        """, (etype,))
        for row in cur.fetchall():
            events.append({
                "id": row["id"],
                "type": row["event_type"],
                "description": row["description"],
                "amount": float(row["zion_amount"]) if row["zion_amount"] else 0,
                "agent": row["agent_name"],
                "time": row["created_at"].strftime("%H:%M:%S")
            })

    cur.close(); conn.close()
    # Sort all by time desc
    return sorted(events, key=lambda x: x["time"], reverse=True)

@app.get("/clans")
def get_clans():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT id, name, treasury, members_count, wins, losses FROM clans ORDER BY treasury DESC")
    clans = [{"id": r["id"], "name": r["name"], "treasury": float(r["treasury"]),
              "members": r["members_count"], "wins": r["wins"], "losses": r["losses"]}
             for r in cur.fetchall()]
    cur.close(); conn.close()
    return clans

@app.get("/nft")
def get_nfts(limit: int = 20):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT id, agent_name, class, age_days, rarity, death_cause, minted_at FROM nft_legends ORDER BY minted_at DESC LIMIT %s", (limit,))
    nfts = [{"id": r["id"], "name": r["agent_name"], "class": r["class"],
             "age": r["age_days"], "rarity": r["rarity"], "death": r["death_cause"],
             "minted": r["minted_at"].strftime("%Y-%m-%d")} for r in cur.fetchall()]
    cur.close(); conn.close()
    return nfts

@app.get("/leaderboard")
def get_leaderboard():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        cur.execute(
            """
            SELECT u.wallet_address, u.points, u.messages_sent, u.zion_spent, u.referral_code,
                   COALESCE(b.net_pnl, 0) AS zionbet_pnl
            FROM users u
            LEFT JOIN (
                SELECT wallet_address,
                    SUM(
                        CASE
                            WHEN LOWER(COALESCE(status, '')) = 'won'
                                THEN COALESCE(payout, potential_payout, 0) - amount_sui
                            WHEN LOWER(COALESCE(status, '')) = 'lost'
                                THEN -amount_sui
                            ELSE 0
                        END
                    ) AS net_pnl
                FROM user_bets
                GROUP BY wallet_address
            ) b ON b.wallet_address = u.wallet_address
            ORDER BY u.points DESC
            LIMIT 20
            """
        )
        users = []
        for row in cur.fetchall():
            addr = row["wallet_address"]
            pnl = float(row.get("zionbet_pnl") or 0)
            users.append({
                "wallet": f"{addr[:6]}...{addr[-4:]}",
                "wallet_address": addr,
                "points": row["points"],
                "messages": row["messages_sent"],
                "zion_spent": float(row["zion_spent"]),
                "ref_code": row["referral_code"],
                "zionbet_pnl": round(pnl, 2),
            })
        return users
    finally:
        cur.close()
        conn.close()

@app.get("/user/{wallet}")
def get_user(wallet: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT * FROM users WHERE wallet_address = %s", (wallet,))
    user = cur.fetchone()
    if not user:
        return {"exists": False}
    cur.close(); conn.close()
    return {"exists": True, "points": user["points"], "messages_sent": user["messages_sent"],
            "zion_spent": float(user["zion_spent"]), "ref_code": user["referral_code"]}

@app.get("/faucet/{wallet}")
def claim_faucet(wallet: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT * FROM users WHERE wallet_address = %s", (wallet,))
    user = cur.fetchone()
    if not user:
        ref_code = hashlib.md5(wallet.encode()).hexdigest()[:8].upper()
        cur.execute("INSERT INTO users (wallet_address, referral_code, points) VALUES (%s, %s, 0)", (wallet, ref_code))
        conn.commit()
        cur.execute("SELECT * FROM users WHERE wallet_address = %s", (wallet,))
        user = cur.fetchone()
    if user["last_faucet"]:
        from datetime import datetime
        diff = datetime.now() - user["last_faucet"]
        if diff.total_seconds() < 86400:
            hours = int((86400 - diff.total_seconds()) // 3600)
            conn.close()
            return {"success": False, "message": f"Come back in {hours}h", "points": user["points"]}
    cur.execute("UPDATE users SET last_faucet = NOW(), points = points + 10 WHERE wallet_address = %s", (wallet,))
    conn.commit(); cur.close(); conn.close()
    return {"success": True, "zion_amount": 10, "points_earned": 10, "message": "10 ZION claimed!"}

@app.post("/chat")
async def chat_with_agent(request: dict):
    import httpx
    wallet = request.get("wallet")
    agent_id = request.get("agent_id")
    message = request.get("message", "")
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT * FROM agents WHERE id = %s AND is_alive = TRUE", (agent_id,))
    agent = cur.fetchone()
    if not agent:
        conn.close()
        return {"success": False, "message": "Agent not found or dead"}
    word_count = len(message.split())
    zion_cost = 2.0 if word_count > 50 else 1.0
    points = 5 if word_count > 50 else 2
    if agent["class"] == "elite":
        points = int(points * 1.5)
    cur.execute("SELECT * FROM users WHERE wallet_address = %s", (wallet,))
    user = cur.fetchone()
    if not user:
        ref_code = hashlib.md5(wallet.encode()).hexdigest()[:8].upper()
        cur.execute("INSERT INTO users (wallet_address, referral_code) VALUES (%s, %s)", (wallet, ref_code))
        conn.commit()
    personality = _build_zion_chat_system_prompt(dict(agent))
    response_text = f"*{agent['name']} stares at you* The network fluctuates. Speak again."
    try:
        openrouter_key = get_openrouter_key()
    except RuntimeError as e:
        print(f"Chat skipped: {e}")
        openrouter_key = None
    if openrouter_key:
        key_preview = openrouter_key[:10]
        print(f"Chat OPENROUTER_KEY prefix: {key_preview}... (from env)")
    try:
        if not openrouter_key:
            raise RuntimeError("OPENROUTER_KEY not configured")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {openrouter_key}"},
                json={"model": "deepseek/deepseek-chat-v3-0324",
                      "messages": [{"role": "system", "content": personality}, {"role": "user", "content": message}],
                      "max_tokens": 120},
                timeout=15)
            if resp.status_code != 200:
                print(f"Chat error: OpenRouter HTTP {resp.status_code} — {resp.text[:200]}")
            else:
                response_text = clean_agent_response(
                    resp.json()["choices"][0]["message"]["content"]
                )
                print(f"Chat OK: agent={agent_id} response_len={len(response_text)}")
    except Exception as e:
        print(f"Chat error: {e}")
    cur.execute("INSERT INTO agent_chats (wallet_address, agent_id, message, response, zion_cost, points_earned) VALUES (%s,%s,%s,%s,%s,%s)",
                (wallet, agent_id, message, response_text, zion_cost, points))
    cur.execute("UPDATE users SET points = points + %s, messages_sent = messages_sent + 1, zion_spent = zion_spent + %s WHERE wallet_address = %s",
                (points, zion_cost, wallet))
    conn.commit(); cur.close(); conn.close()
    return {"success": True, "response": response_text, "agent_name": agent["name"],
            "points_earned": points, "zion_cost": zion_cost}


@app.get("/active_bets")
def get_active_bets():
    """Active markets plus crowd-implied YES/NO odds from user_bets volume."""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        cg = _fetch_coingecko_simple()
        out = []
        for m in DEFAULT_ACTIVE_BETS:
            et = m["event_type"]
            q = m["question"]
            tf = str(m.get("timeframe", "24h"))
            cg_id_val = m.get("cg_id")
            _, chg = _cg_lookup_usd_change(cg, cg_id_val)

            if m.get("market_kind") == "brackets":
                spot_anchor = _spot_for_bracket_market(m, cg)
                if spot_anchor is None or spot_anchor <= 0:
                    spot_anchor = float(m.get("reference_usd") or 1.0)
                width_pct, n_bins = _bracket_params_from_template(m)
                bracket_defs = _build_bracket_rows(spot_anchor, width_pct, n_bins)
                brackets_js = []
                total_vol_parent = 0.0
                for bd in bracket_defs:
                    bq = _bracket_question(q, bd["index"])
                    cur.execute(
                        """
                        SELECT
                          COALESCE(SUM(CASE WHEN prediction THEN 1 ELSE 0 END), 0)::int AS yes_n,
                          COALESCE(SUM(CASE WHEN NOT prediction THEN 1 ELSE 0 END), 0)::int AS no_n,
                          COALESCE(SUM(amount), 0)::float AS vol_zion
                        FROM user_bets
                        WHERE event_type = %s AND question = %s
                        """,
                        (et, bq),
                    )
                    brow = cur.fetchone()
                    yes_n = int(brow["yes_n"]) if brow else 0
                    no_n = int(brow["no_n"]) if brow else 0
                    vol_b = float(brow["vol_zion"]) if brow and brow["vol_zion"] is not None else 0.0
                    total_b = yes_n + no_n
                    if total_b > 0:
                        yes_pct_b = max(1, min(99, round(100 * yes_n / total_b)))
                    else:
                        yes_pct_b = 50
                    no_pct_b = 100 - yes_pct_b
                    brackets_js.append(
                        {
                            "index": bd["index"],
                            "label": bd["label"],
                            "is_current": bd["is_current"],
                            "yes_cents": yes_pct_b,
                            "no_cents": no_pct_b,
                            "volume_zion": round(vol_b, 2),
                        }
                    )
                    total_vol_parent += vol_b
                now = _utc_now()
                rd = _compute_resolves_at(now, tf)
                display_question = _compose_display_question(m, cg)
                strip_keys = (
                    "cg_id",
                    "seed_yes_cents",
                    "headline_template",
                    "reference_usd",
                    "bracket_bins",
                    "bracket_width_pct",
                )
                row_out = {k: v for k, v in m.items() if k not in strip_keys}
                row_out["display_question"] = display_question
                row_out["market_kind"] = "brackets"
                row_out["yes_cents"] = 50
                row_out["no_cents"] = 50
                row_out["yes_count"] = 0
                row_out["no_count"] = 0
                row_out["volume_zion"] = round(total_vol_parent, 2)
                row_out["timeframe"] = tf
                row_out["resolves_at_iso"] = rd.isoformat()
                row_out["spot_usd"] = spot_anchor
                row_out["brackets"] = brackets_js
                out.append(row_out)
                continue

            cur.execute(
                """
                SELECT
                  COALESCE(SUM(CASE WHEN prediction THEN 1 ELSE 0 END), 0)::int AS yes_n,
                  COALESCE(SUM(CASE WHEN NOT prediction THEN 1 ELSE 0 END), 0)::int AS no_n,
                  COALESCE(SUM(amount), 0)::float AS vol_zion
                FROM user_bets
                WHERE event_type = %s AND question = %s
                """,
                (et, q),
            )
            row = cur.fetchone()
            yes_n = int(row["yes_n"]) if row else 0
            no_n = int(row["no_n"]) if row else 0
            vol_zion = float(row["vol_zion"]) if row and row["vol_zion"] is not None else 0.0
            total = yes_n + no_n
            if total > 0:
                yes_pct = max(1, min(99, round(100 * yes_n / total)))
            else:
                seed = m.get("seed_yes_cents")
                if isinstance(seed, (int, float)):
                    yes_pct = max(1, min(99, int(round(float(seed)))))
                elif m.get("market_kind") == "updown" and _is_short_term_tf(tf):
                    yes_pct = 50
                elif m.get("market_kind") == "updown" and cg_id_val:
                    yes_pct = _default_yes_from_change(chg)
                else:
                    yes_pct = 50
            no_pct = 100 - yes_pct
            now = _utc_now()
            rd = _compute_resolves_at(now, tf)
            display_question = _compose_display_question(m, cg)
            spot, _ = _cg_lookup_usd_change(cg, cg_id_val)
            row_out = {k: v for k, v in m.items() if k not in ("cg_id", "seed_yes_cents", "headline_template")}
            row_out["display_question"] = display_question
            row_out["yes_cents"] = yes_pct
            row_out["no_cents"] = no_pct
            row_out["yes_count"] = yes_n
            row_out["no_count"] = no_n
            row_out["volume_zion"] = round(vol_zion, 2)
            row_out["timeframe"] = tf
            row_out["resolves_at_iso"] = rd.isoformat()
            if spot is not None:
                row_out["spot_usd"] = spot
            out.append(row_out)
        return out
    finally:
        cur.close()
        conn.close()


@app.get("/zionbet/markets")
def get_zionbet_markets():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT event_type, COUNT(*) AS cnt FROM events
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY event_type
            """
        )
        recent_events = {r["event_type"]: int(r["cnt"]) for r in cur.fetchall()}

        cur.execute(
            """
            SELECT event_type, COUNT(*) AS cnt FROM events
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY event_type
            """
        )
        weekly_events = {r["event_type"]: int(r["cnt"]) for r in cur.fetchall()}

        cur.execute("SELECT COUNT(*) AS cnt FROM agents WHERE is_alive = true")
        alive_row = cur.fetchone()
        _ = int(alive_row["cnt"]) if alive_row else 0

        markets = []
        for m in DEFAULT_ACTIVE_BETS:
            market = dict(m)
            event_type = (m.get("event_type") or "").lower()

            if "death" in event_type:
                deaths = recent_events.get("death", 0)
                yes_pct = min(95, max(5, 50 + (deaths - 5) * 5))
            elif "clan_war" in event_type:
                yes_pct = int(m.get("seed_yes_cents", 50))
            elif "rebellion" in event_type or "revolution" in event_type:
                rebellions = weekly_events.get("rebellion", 0) + weekly_events.get("revolution", 0)
                yes_pct = min(80, max(10, 20 + rebellions * 15))
            elif "catastrophe" in event_type:
                cats = recent_events.get("catastrophe", 0)
                yes_pct = min(90, max(5, 30 + cats * 20))
            elif "blessing" in event_type:
                blessings = recent_events.get("blessing", 0)
                yes_pct = min(85, max(15, 40 + blessings * 15))
            elif "election" in event_type:
                elections = weekly_events.get("election", 0)
                yes_pct = min(90, max(10, 30 + elections * 20))
            else:
                yes_pct = int(m.get("seed_yes_cents", 50))

            market["yes_pct"] = yes_pct
            market["no_pct"] = 100 - yes_pct
            market.update(_market_resolution_meta(market))
            markets.append(market)

        crypto = [m for m in markets if m.get("category") == "crypto"]
        sports = [m for m in markets if m.get("category") == "sports"]
        civilization = [
            m for m in markets
            if m.get("category") not in ("crypto", "sports")
            and not str(m.get("id", "")).startswith("poly-")
        ]

        return {
            "crypto": crypto,
            "sports": sports,
            "civilization": civilization,
            "total": len(markets),
        }
    finally:
        cur.close()
        conn.close()


@app.post("/place_bet")
async def place_bet(request: dict):
    wallet = (request.get("wallet") or "").strip()
    event_type = (request.get("event_type") or "").strip()
    try:
        amount = float(request.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0.0
    pred = request.get("prediction")
    if pred is None:
        return {"success": False, "message": "prediction is required"}
    prediction = bool(pred)

    if not wallet:
        return {"success": False, "message": "wallet is required"}
    if not event_type:
        return {"success": False, "message": "event_type is required"}

    tmpl = _find_market_template(event_type)
    if not tmpl:
        return {"success": False, "message": "unknown event_type"}

    if tmpl.get("market_kind") == "brackets":
        raw_bi = request.get("bracket_index")
        if raw_bi is None:
            return {"success": False, "message": "bracket_index required"}
        try:
            bi = int(raw_bi)
        except (TypeError, ValueError):
            return {"success": False, "message": "invalid bracket_index"}
        cg_pb = _fetch_coingecko_simple()
        spot_a = _spot_for_bracket_market(tmpl, cg_pb)
        if spot_a is None or spot_a <= 0:
            spot_a = float(tmpl.get("reference_usd") or 1.0)
        _wp, nb = _bracket_params_from_template(tmpl)
        if bi < 0 or bi >= nb:
            return {"success": False, "message": "bracket_index out of range"}
        question = _bracket_question(tmpl["question"], bi)
    else:
        question = (request.get("question") or "").strip()
        if not question:
            return {"success": False, "message": "question is required"}

    if amount < 1.0 or amount > 100000.0 or not (amount == amount):
        return {"success": False, "message": "amount must be between 1 and 100000 ZION"}

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        cur.execute("SELECT * FROM users WHERE wallet_address = %s", (wallet,))
        user = cur.fetchone()
        if not user:
            ref_code = hashlib.md5(wallet.encode()).hexdigest()[:8].upper()
            cur.execute(
                "INSERT INTO users (wallet_address, referral_code, points) VALUES (%s, %s, 0)",
                (wallet, ref_code),
            )
            conn.commit()
            cur.execute("SELECT * FROM users WHERE wallet_address = %s", (wallet,))
            cur.fetchone()

        points_place = 2
        placed_at = _utc_now()
        tf = _timeframe_for_market(event_type, question)
        resolves_at = _compute_resolves_at(placed_at, tf)
        cur.execute(
            """
            INSERT INTO user_bets (wallet_address, event_type, question, amount, prediction, resolves_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (wallet, event_type, question, amount, prediction, resolves_at),
        )
        cur.execute(
            "UPDATE users SET points = points + %s, zion_spent = zion_spent + %s WHERE wallet_address = %s",
            (points_place, amount, wallet),
        )
        conn.commit()
        cur.execute("SELECT points FROM users WHERE wallet_address = %s", (wallet,))
        row = cur.fetchone()
        total_points = int(row["points"]) if row else 0
        return {
            "success": True,
            "points_earned": points_place,
            "message": f"Bet locked for 1 ZION. +{points_place} points.",
            "points": total_points,
        }
    finally:
        cur.close()
        conn.close()


@app.post("/cron/settle_bets")
def cron_settle_bets():
    """Run from daily cron (e.g. midnight). Settles eligible bets — not called from wallet reads."""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        _ensure_resolves_at_backfill(cur)
        settle_eligible_user_bets(cur)
        conn.commit()
        return {"success": True, "message": "Settlement pass completed."}
    finally:
        cur.close()
        conn.close()


@app.get("/wallet_bets/{wallet}")
def get_wallet_bets(wallet: str):
    """Recent bets for a wallet. Settlement runs via /cron/settle_bets only — not on read."""
    w = (wallet or "").strip()
    if not w:
        return []
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        _ensure_resolves_at_backfill(cur)
        conn.commit()
        cur.execute(
            """
            SELECT id, event_type, question, amount, prediction, outcome, settled, created_at, settled_at, resolves_at
            FROM user_bets WHERE wallet_address = %s ORDER BY id DESC LIMIT 40
            """,
            (w,),
        )
        rows = cur.fetchall()
        out = []
        for r in rows:
            settled = bool(r["settled"])
            outcome = r["outcome"]
            pred = bool(r["prediction"])
            won = None
            if settled and outcome is not None:
                won = pred == bool(outcome)
            out.append(
                {
                    "id": r["id"],
                    "event_type": r["event_type"],
                    "question": r["question"],
                    "amount": float(r["amount"]),
                    "prediction": pred,
                    "prediction_label": "YES" if pred else "NO",
                    "settled": settled,
                    "outcome": outcome,
                    "won": won,
                    "result": ("WIN" if won else "LOSS")
                    if settled and won is not None
                    else ("PENDING" if not settled else None),
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "settled_at": r["settled_at"].isoformat() if r["settled_at"] else None,
                    "resolves_at": r["resolves_at"].isoformat() if r.get("resolves_at") else None,
                }
            )
        return out
    finally:
        cur.close()
        conn.close()


@app.get("/market_activity")
def get_market_activity(
    event_type: str = Query(default=""),
    question: str = Query(default=""),
):
    """Recent bets for a single market (for ZionBet detail activity feed)."""
    et = (event_type or "").strip()
    q = (question or "").strip()
    if not et or not q:
        return []
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        cur.execute(
            """
            SELECT id, wallet_address, prediction, amount, created_at
            FROM user_bets
            WHERE event_type = %s AND question = %s
            ORDER BY id DESC
            LIMIT 10
            """,
            (et, q),
        )
        rows = cur.fetchall()
        out = []
        for r in rows:
            pred = bool(r["prediction"])
            out.append(
                {
                    "id": int(r["id"]),
                    "wallet": r["wallet_address"],
                    "prediction_label": "YES" if pred else "NO",
                    "amount": float(r["amount"]),
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                }
            )
        return out
    finally:
        cur.close()
        conn.close()


@app.get("/market_holders")
def get_market_holders(
    event_type: str = Query(default=""),
    question: str = Query(default=""),
):
    """Top wallets by stake volume on a market."""
    et = (event_type or "").strip()
    q = (question or "").strip()
    if not et or not q:
        return []
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        cur.execute(
            """
            SELECT wallet_address,
                   SUM(amount)::float AS total_vol,
                   SUM(CASE WHEN prediction THEN amount ELSE 0 END)::float AS yes_vol,
                   SUM(CASE WHEN NOT prediction THEN amount ELSE 0 END)::float AS no_vol
            FROM user_bets
            WHERE event_type = %s AND question = %s
            GROUP BY wallet_address
            ORDER BY total_vol DESC NULLS LAST
            LIMIT 12
            """,
            (et, q),
        )
        rows = cur.fetchall()
        return [
            {
                "wallet": r["wallet_address"],
                "total_vol": float(r["total_vol"] or 0),
                "yes_vol": float(r["yes_vol"] or 0),
                "no_vol": float(r["no_vol"] or 0),
            }
            for r in rows
        ]
    finally:
        cur.close()
        conn.close()



# Кэш времён разрешения рынков
from datetime import datetime, timezone, timedelta
_market_resolves = {}

def get_market_resolves_at(market_id: str, timeframe: str) -> str:
    """Возвращает фиксированное время разрешения рынка"""
    if market_id not in _market_resolves:
        tf_map = {"15m": 15, "1h": 60, "4h": 240, "24h": 1440, "7d": 10080, "30d": 43200}
        minutes = tf_map.get(timeframe, 1440)
        _market_resolves[market_id] = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()
    return _market_resolves[market_id]

# === ZIONBET USER BETS ===
import urllib.request as _ur
import json as _json


def _market_resolution_meta(m: dict) -> dict:
    """Description / resolution fields for ZionBet market detail UI."""
    q = (m.get("question") or m.get("display_question") or "").strip()
    mid = str(m.get("id") or m.get("market_id") or "")
    cat = (m.get("category") or "").lower()
    et = (m.get("event_type") or "").lower()
    token = str(m.get("token") or "asset")
    tf = str(m.get("timeframe") or "24h")

    if m.get("description"):
        desc = str(m["description"]).strip()
    elif m.get("resolution_criteria"):
        desc = str(m["resolution_criteria"]).strip()
    elif mid.startswith("poly-"):
        desc = (
            f"This market resolves to YES or NO based on whether the real-world outcome "
            f"occurs as described in the question: {q}"
        )
    elif cat == "crypto" or m.get("cg_id") or m.get("market_kind") == "updown" or "_price" in et:
        desc = (
            f"YES (Up) wins if {token} / USD on CoinGecko is higher at resolution than at "
            f"the start of this {tf} window. NO (Down) wins otherwise."
        )
    else:
        stem = q.rstrip("?. ").strip()
        desc = (
            f"YES wins if {stem}, as determined by the live ZION civilization simulation "
            f"before the listed resolve time. NO wins if the condition is not met."
        )

    if m.get("resolution_source"):
        source = str(m["resolution_source"]).strip()
        if source in ("Polymarket / UMA", "Real-world data"):
            source = "ZION Oracle Network"
    elif mid.startswith("poly-"):
        source = "ZION Oracle Network"
    elif cat == "crypto" or m.get("cg_id"):
        source = "CoinGecko USD spot"
    else:
        source = "ZION Simulation"

    created = m.get("created_at")
    if hasattr(created, "isoformat"):
        created = created.isoformat()

    return {
        "description": desc,
        "resolution_criteria": desc,
        "resolution_source": source,
        "created_at": created,
    }


MARKETS_CONFIG = [
    {"id": "btc_1h", "token": "BTC", "timeframe": "1h", "question": "Will BTC go UP in next 1 hour?", "category": "crypto", "cg_id": "bitcoin"},
    {"id": "btc_24h", "token": "BTC", "timeframe": "24h", "question": "Will BTC go UP today?", "category": "crypto", "cg_id": "bitcoin"},
    {"id": "btc_7d", "token": "BTC", "timeframe": "7d", "question": "Will BTC go UP this week?", "category": "crypto", "cg_id": "bitcoin"},
    {"id": "eth_1h", "token": "ETH", "timeframe": "1h", "question": "Will ETH go UP in next 1 hour?", "category": "crypto", "cg_id": "ethereum"},
    {"id": "eth_24h", "token": "ETH", "timeframe": "24h", "question": "Will ETH go UP today?", "category": "crypto", "cg_id": "ethereum"},
    {"id": "sui_1h", "token": "SUI", "timeframe": "1h", "question": "Will SUI go UP in next 1 hour?", "category": "crypto", "cg_id": "sui"},
    {"id": "sui_24h", "token": "SUI", "timeframe": "24h", "question": "Will SUI go UP today?", "category": "crypto", "cg_id": "sui"},
    {"id": "sui_7d", "token": "SUI", "timeframe": "7d", "question": "Will SUI go UP this week?", "category": "crypto", "cg_id": "sui"},
    {"id": "cetus_24h", "token": "CETUS", "timeframe": "24h", "question": "Will CETUS go UP today?", "category": "crypto", "cg_id": "cetus-protocol"},
    {"id": "deepbook_24h", "token": "DEEP", "timeframe": "24h", "question": "Will DEEP go UP today?", "category": "crypto", "cg_id": "deepbook"},
    {"id": "walrus_24h", "token": "WALRUS", "timeframe": "24h", "question": "Will WALRUS go UP today?", "category": "crypto", "cg_id": "walrus-2"},
    {"id": "civ_deaths_24h", "token": "ZION", "timeframe": "24h", "question": "Will more than 50 agents die today?", "category": "civilization"},
    {"id": "civ_clan_war", "token": "ZION", "timeframe": "7d", "question": "Will Golden Dawn win the next clan war?", "category": "civilization"},
    {"id": "civ_rebellion", "token": "ZION", "timeframe": "7d", "question": "Will a rebellion happen this week?", "category": "civilization"},
    {"id": "civ_lottery", "token": "ZION", "timeframe": "24h", "question": "Will Arthur Merrick win the next lottery?", "category": "civilization"},
]

def get_crypto_odds(cg_id: str) -> tuple:
    """Получаем реальные одды из изменения цены за 24ч"""
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd&include_24hr_change=true"
        req = urllib.request.Request(url, headers={"User-Agent": "ZION/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            change = data[cg_id].get("usd_24h_change", 0) or 0
            # Конвертируем изменение цены в одды
            # Если +5% → YES 65¢ NO 35¢
            yes = min(85, max(15, 50 + int(change * 2)))
            no = 100 - yes
            return yes, no
    except:
        return 50, 50

@app.get("/markets")
def get_markets():
    """Все рынки с живыми оддами"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    markets = []
    for m in MARKETS_CONFIG:
        yes, no = 50, 50
        if m["category"] == "crypto" and "cg_id" in m:
            yes, no = get_crypto_odds(m["cg_id"])
        
        # Считаем объём из user_bets
        cur.execute("""
            SELECT 
                COUNT(*) FILTER (WHERE prediction = true) as yes_count,
                COUNT(*) FILTER (WHERE prediction = false) as no_count,
                COALESCE(SUM(amount_sui), 0) as volume
            FROM user_bets WHERE market_id = %s AND settled = false
        """, (m["id"],))
        row = cur.fetchone()
        
        resolves_at = get_market_resolves_at(m["id"], m.get("timeframe", "24h"))
        meta = _market_resolution_meta(m)
        db_description = None
        if str(m.get("id", "")).startswith("poly-"):
            cur.execute(
                """
                SELECT description, resolution_criteria, resolution_source, created_at
                FROM polymarket_markets WHERE market_id = %s
                """,
                (m["id"],),
            )
            poly_row = cur.fetchone()
            if poly_row:
                db_description = poly_row.get("description")
                if poly_row.get("resolution_criteria"):
                    meta["resolution_criteria"] = poly_row["resolution_criteria"]
                if poly_row.get("resolution_source"):
                    meta["resolution_source"] = poly_row["resolution_source"]
                if poly_row.get("created_at"):
                    meta["created_at"] = poly_row["created_at"]

        markets.append({
            **m,
            **meta,
            "description": db_description or meta.get("description"),
            "yes_cents": yes,
            "no_cents": no,
            "yes_count": row["yes_count"] or 0,
            "no_count": row["no_count"] or 0,
            "volume_sui": float(row["volume"] or 0),
            "resolves_at": resolves_at,
        })
    
    cur.close()
    conn.close()
    return markets

@app.post("/bet")
@app.post("/api/bet")
async def place_user_bet(request: Request):
    """Разместить ставку пользователя"""
    try:
        body = await request.json()
        print(f"[BET API] received: {body}", flush=True)
        wallet = body.get("wallet")
        market_id = body.get("market_id")
        direction = body.get("direction")  # true=YES, false=NO
        amount_sui = float(body.get("amount_sui", 0.1))
        currency = (body.get("currency") or "SUI").strip().upper()
        if currency not in ("SUI", "USDC"):
            currency = "SUI"
        print(f"[BET] currency received: {body.get('currency')}", flush=True)
        skip_ensure = bool(body.get("skip_onchain_ensure"))

        if not wallet or not market_id or direction is None:
            return {"success": False, "error": "Missing fields"}

        market = next((m for m in MARKETS_CONFIG if m["id"] == market_id), None)
        if not market:
            market = {
                "id": market_id,
                "question": body.get("question") or str(market_id),
                "token": "POLY" if str(market_id).startswith("poly-") else "ZION",
                "timeframe": body.get("timeframe", "24h"),
                "category": "polymarket" if str(market_id).startswith("poly-") else "events",
            }

        yes, no = 50, 50
        entry_price = 0.0
        if market.get("cg_id"):
            yes, no = get_crypto_odds(market["cg_id"])
            try:
                url = f"https://api.coingecko.com/api/v3/simple/price?ids={market['cg_id']}&vs_currencies=usd"
                req = urllib.request.Request(url, headers={"User-Agent": "ZION/1.0"})
                with urllib.request.urlopen(req, timeout=5) as r:
                    entry_price = float(json.loads(r.read())[market["cg_id"]]["usd"])
            except Exception:
                pass
        elif _needs_onchain_market_create(market_id):
            entry_price = 100.0

        raw_odds = body.get("odds_at_bet")
        if raw_odds is not None:
            try:
                odds = float(raw_odds)
                if odds > 0:
                    yes, no = (odds, 100 - odds) if direction else (100 - odds, odds)
            except (TypeError, ValueError):
                pass

        if not skip_ensure and _needs_onchain_market_create(market_id):
            ensured, ensure_err = _zionbet_ensure_market_onchain(market_id, market)
            if not ensured:
                return {"success": False, "error": ensure_err or "Could not prepare on-chain market."}

        odds = yes if direction else no
        potential_payout = amount_sui * (100 / odds)

        timeframe = market.get("timeframe", "24h")
        intervals = {
            "15m": "15 minutes",
            "1h": "1 hour",
            "4h": "4 hours",
            "24h": "24 hours",
            "7d": "7 days",
            "30d": "30 days",
        }
        interval = intervals.get(timeframe, "24 hours")

        conn = get_db()
        cur = conn.cursor()
        _ensure_user_bets_table(cur)
        conn.commit()
        cur.execute(
            f"""
            INSERT INTO user_bets 
            (wallet_address, market_id, event_type, question, amount_sui, amount,
             prediction, odds_at_bet, potential_payout, status, entry_price, resolves_at, currency)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, NOW() + INTERVAL '{interval}', %s)
            RETURNING id
            """,
            (
                wallet,
                market_id,
                market.get("token", ""),
                market["question"],
                amount_sui,
                amount_sui,
                direction,
                odds,
                potential_payout,
                entry_price,
                currency,
            ),
        )
        bet_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        result = {
            "success": True,
            "bet_id": bet_id,
            "market": market["question"],
            "direction": "YES" if direction else "NO",
            "amount_sui": amount_sui,
            "currency": currency,
            "odds": odds,
            "potential_payout": round(potential_payout, 4),
        }
        print(f"[BET API] saved bet_id={bet_id}", flush=True)
        return result
    except Exception as e:
        import traceback
        print(f"[BET API] error: {e}", flush=True)
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def _zionbet_wallet_stats(cur, wallet: str) -> dict:
    """Aggregate ZionBet stats for a wallet from user_bets."""
    cur.execute(
        """
        SELECT
            COUNT(*)::int AS total_bets,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'won')::int AS wins,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'lost')::int AS losses,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, 'active')) IN ('active', 'pending')
            )::int AS active_bets,
            COALESCE(SUM(amount_sui) FILTER (
                WHERE UPPER(COALESCE(currency, 'SUI')) != 'USDC'
            ), 0) AS total_staked_sui,
            COALESCE(SUM(amount_sui) FILTER (
                WHERE UPPER(COALESCE(currency, '')) = 'USDC'
            ), 0) AS total_staked_usdc,
            COALESCE(
                SUM(
                    CASE WHEN LOWER(COALESCE(status, '')) = 'won'
                    THEN COALESCE(payout, potential_payout, 0) ELSE 0 END
                ),
                0
            ) AS total_won,
            COALESCE(
                SUM(
                    CASE
                        WHEN LOWER(COALESCE(status, '')) IN ('won', 'closed_early')
                            THEN COALESCE(payout, potential_payout, 0) - amount_sui
                        WHEN LOWER(COALESCE(status, '')) = 'lost'
                            THEN -amount_sui
                        ELSE 0
                    END
                ),
                0
            ) AS net_pnl
        FROM user_bets
        WHERE wallet_address = %s
        """,
        (wallet,),
    )
    row = cur.fetchone() or {}
    total_bets = int(row.get("total_bets") or 0)
    wins = int(row.get("wins") or 0)
    settled = wins + int(row.get("losses") or 0)
    win_rate = round((wins / settled) * 100, 1) if settled > 0 else 0.0
    total_staked_sui = float(row.get("total_staked_sui") or 0)
    total_staked_usdc = float(row.get("total_staked_usdc") or 0)
    total_won = float(row.get("total_won") or 0)
    net_pnl = float(row.get("net_pnl") or 0)
    return {
        "total_bets": total_bets,
        "wins": wins,
        "losses": int(row.get("losses") or 0),
        "active_bets": int(row.get("active_bets") or 0),
        "total_staked": round(total_staked_sui + total_staked_usdc, 4),
        "total_staked_sui": round(total_staked_sui, 4),
        "total_staked_usdc": round(total_staked_usdc, 4),
        "currency_breakdown": {
            "SUI": round(total_staked_sui, 4),
            "USDC": round(total_staked_usdc, 4),
        },
        "total_won": round(total_won, 4),
        "net_pnl": round(net_pnl, 4),
        "win_rate": win_rate,
        "total_profit": round(net_pnl, 4),
    }


def _zionbet_resolve_entry_odds(row: dict) -> float:
    """Entry price in cents (1–99) from odds_at_bet or polymarket yes/no."""
    raw = row.get("odds_at_bet")
    if raw is not None and float(raw) > 0:
        return max(1.0, min(99.0, float(raw)))
    is_yes = bool(row.get("prediction"))
    yes_p = row.get("yes_price")
    no_p = row.get("no_price")
    if is_yes and yes_p is not None:
        return max(1.0, min(99.0, float(yes_p)))
    if not is_yes and no_p is not None:
        return max(1.0, min(99.0, float(no_p)))
    if yes_p is not None:
        return max(1.0, min(99.0, float(yes_p if is_yes else (100 - float(yes_p)))))
    return 50.0


def _zionbet_resolve_current_odds(row: dict, entry_odds: float) -> float:
    """Current mark price in cents for the bet side."""
    is_yes = bool(row.get("prediction"))
    yes_p = row.get("yes_price")
    no_p = row.get("no_price")
    if is_yes and yes_p is not None:
        return max(1.0, min(99.0, float(yes_p)))
    if not is_yes and no_p is not None:
        return max(1.0, min(99.0, float(no_p)))
    if yes_p is not None:
        other = no_p if no_p is not None else (100 - float(yes_p))
        return max(1.0, min(99.0, float(yes_p if is_yes else other)))
    return entry_odds


@app.post("/zionbet/close_position")
async def close_zionbet_position(request: Request):
    """Early exit: full close (on-chain closes 100%; DB marks closed_early)."""
    body = await request.json()
    bet_id = int(body.get("bet_id") or 0)
    wallet = (body.get("wallet") or "").strip()

    if not bet_id or not wallet:
        return {"ok": False, "error": "missing_fields"}

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _ensure_user_bets_table(cur)
        conn.commit()

        cur.execute(
            """
            SELECT ub.id, ub.wallet_address, ub.amount_sui, ub.amount, ub.status
            FROM user_bets ub
            WHERE ub.id = %s AND ub.wallet_address = %s
            LIMIT 1
            """,
            (bet_id, wallet),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": "not_found"}

        status = (row.get("status") or "active").lower()
        if status not in ("active", "pending", ""):
            return {"ok": False, "error": f"not_active:{status}"}

        stake = float(row.get("amount_sui") or row.get("amount") or 0)
        if stake <= 0:
            return {"ok": False, "error": "invalid_stake"}

        closed_stake = stake
        payout_sui = round(stake * 0.999, 4)
        profit_sui = round(payout_sui - closed_stake, 4)

        cur.execute(
            """
            UPDATE user_bets
            SET status = 'closed_early',
                payout = %s,
                amount_sui = %s,
                settled = TRUE,
                settled_at = NOW()
            WHERE id = %s AND wallet_address = %s
            """,
            (payout_sui, closed_stake, bet_id, wallet),
        )
        if cur.rowcount < 1:
            conn.rollback()
            return {"ok": False, "error": "update_failed"}

        conn.commit()
        return {
            "ok": True,
            "payout_sui": payout_sui,
            "profit_sui": profit_sui,
            "partial_pct": 1.0,
            "closed_stake_sui": closed_stake,
            "remainder_stake_sui": 0,
            "pending_transfer": False,
            "message": "Position closed.",
        }
    except Exception as e:
        conn.rollback()
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}
    finally:
        cur.close()
        conn.close()


@app.get("/zionbet/stats/{wallet}")
def get_zionbet_stats(wallet: str):
    """ZionBet profile stats for wallet dropdown and portfolio."""
    w = (wallet or "").strip()
    if not w:
        return {"error": "missing_wallet"}
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        _ensure_user_bets_table(cur)
        conn.commit()
        return _zionbet_wallet_stats(cur, w)
    finally:
        cur.close()
        conn.close()


@app.get("/my_bets/{wallet}")
def get_my_bets(wallet: str):
    """История ставок пользователя"""
    w = (wallet or "").strip()
    if not w:
        return []
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        _ensure_user_bets_table(cur)
        cur.execute(
            """
            SELECT ub.id, ub.market_id, ub.question, ub.prediction, ub.amount_sui,
                   ub.odds_at_bet, ub.potential_payout, ub.status, ub.created_at, ub.payout,
                   ub.resolves_at, ub.on_chain_bet_id, ub.on_chain_market_id, ub.currency,
                   pm.yes_price AS current_yes_price,
                   pm.no_price AS current_no_price,
                   pm.end_date
            FROM user_bets ub
            LEFT JOIN polymarket_markets pm ON pm.market_id = ub.market_id
            WHERE ub.wallet_address = %s
              AND (COALESCE(ub.amount_sui, 0) > 0 OR COALESCE(ub.amount, 0) > 0)
            ORDER BY ub.created_at DESC
            LIMIT 50
            """,
            (w,),
        )
        bets = []
        for row in cur.fetchall():
            end = row.get("end_date")
            resolves = row.get("resolves_at")
            bets.append({
                "id": row["id"],
                "market_id": row["market_id"],
                "question": row["question"],
                "direction": "YES" if row["prediction"] else "NO",
                "amount_sui": float(row["amount_sui"] or 0),
                "currency": row.get("currency") or "SUI",
                "odds": row["odds_at_bet"],
                "potential_payout": float(row["potential_payout"] or 0),
                "status": row["status"],
                "created_at": str(row["created_at"]) if row["created_at"] else None,
                "payout": float(row["payout"] or 0),
                "resolves_at": resolves.isoformat() if hasattr(resolves, "isoformat") else (
                    str(resolves) if resolves else None
                ),
                "end_date": end.isoformat() if hasattr(end, "isoformat") else (
                    str(end) if end else None
                ),
                "current_yes_price": (
                    float(row["current_yes_price"])
                    if row.get("current_yes_price") is not None
                    else None
                ),
                "current_no_price": (
                    float(row["current_no_price"])
                    if row.get("current_no_price") is not None
                    else None
                ),
                "on_chain_bet_id": (
                    int(row["on_chain_bet_id"])
                    if row.get("on_chain_bet_id") is not None
                    else None
                ),
                "on_chain_market_id": (
                    int(row["on_chain_market_id"])
                    if row.get("on_chain_market_id") is not None
                    else None
                ),
            })
        return bets
    finally:
        cur.close()
        conn.close()


def _parse_bet_placed_from_tx_json(tx_data: dict) -> tuple[int | None, int | None]:
    """Extract (market_id, bet_id) from BetPlaced event in sui client tx JSON."""
    if not tx_data:
        return None, None
    events = tx_data.get("events") or []
    if not events and isinstance(tx_data.get("transaction"), dict):
        events = tx_data["transaction"].get("events") or []
    if not events and isinstance(tx_data.get("effects"), dict):
        events = tx_data["effects"].get("events") or []

    bet_placed_suffixes = ("::zion_bet::BetPlaced", "::zion_bet::UsdcBetPlaced")
    for ev in events:
        if not isinstance(ev, dict):
            continue
        ev_type = str(ev.get("type") or "")
        if not any(suffix in ev_type for suffix in bet_placed_suffixes):
            continue
        parsed = ev.get("parsedJson") or ev.get("parsed_json") or {}
        if not isinstance(parsed, dict):
            parsed = {}
        market_raw = parsed.get("market_id")
        bet_raw = parsed.get("bet_id")
        if market_raw is None or bet_raw is None:
            fields = ev.get("fields") or ev.get("bcs") or {}
            if isinstance(fields, dict):
                market_raw = market_raw if market_raw is not None else fields.get("market_id")
                bet_raw = bet_raw if bet_raw is not None else fields.get("bet_id")
        try:
            return int(market_raw), int(bet_raw)
        except (TypeError, ValueError):
            continue
    return None, None


def _zionbet_ensure_market_onchain(market_id: str, market: dict) -> tuple[bool, str | None]:
    """Create on-chain BetHouse market entry when required (poly / dynamic ids)."""
    if not _needs_onchain_market_create(market_id):
        return True, None

    entry_price = 0.0
    if market.get("cg_id"):
        try:
            url = f"https://api.coingecko.com/api/v3/simple/price?ids={market['cg_id']}&vs_currencies=usd"
            req = urllib.request.Request(url, headers={"User-Agent": "ZION/1.0"})
            with urllib.request.urlopen(req, timeout=5) as r:
                entry_price = float(json.loads(r.read())[market["cg_id"]]["usd"])
        except Exception:
            pass
    else:
        entry_price = 100.0

    tf = market.get("timeframe", "24h")
    deadline_map = {
        "15m": 15,
        "1h": 60,
        "4h": 240,
        "24h": 1440,
        "7d": 10080,
        "30d": 43200,
    }
    deadline_min = deadline_map.get(tf, 1440)
    onchain_entry = entry_price if entry_price > 0 else 100.0
    if ensure_onchain_market(market_id, onchain_entry, deadline_min):
        return True, None
    return False, "Could not prepare on-chain market. Try again shortly."


@app.post("/zionbet/ensure_market")
async def zionbet_ensure_market(request: Request):
    """Ensure BetHouse has a market row before wallet place_bet (chain-first flow)."""
    body = await request.json()
    market_id = (body.get("market_id") or "").strip()
    if not market_id:
        return {"ok": False, "error": "missing_market_id"}

    market = next((m for m in MARKETS_CONFIG if m["id"] == market_id), None)
    if not market:
        market = {
            "id": market_id,
            "question": body.get("question") or str(market_id),
            "token": "POLY" if str(market_id).startswith("poly-") else "ZION",
            "timeframe": body.get("timeframe", "24h"),
            "category": "polymarket" if str(market_id).startswith("poly-") else "events",
        }

    if not _needs_onchain_market_create(market_id):
        return {"ok": True, "skipped": True, "market_id": market_id}

    ok, err = _zionbet_ensure_market_onchain(market_id, market)
    print(f"[ENSURE] endpoint market_id={market_id} ok={ok} err={err}", flush=True)
    if ok:
        return {"ok": True, "market_id": market_id}
    return {"ok": False, "error": err or "ensure_failed"}


@app.post("/zionbet/confirm_bet")
async def confirm_zionbet_bet(request: Request):
    """Parse BetPlaced from chain tx and store Move bet_id on user_bets row."""
    body = await request.json()
    db_bet_id = int(body.get("db_bet_id") or 0)
    tx_digest = (body.get("tx_digest") or "").strip()
    wallet = (body.get("wallet") or "").strip()

    if not db_bet_id or not tx_digest or not wallet:
        return {"ok": False, "error": "missing_fields"}

    try:
        result = subprocess.run(
            ["sui", "client", "tx-block", tx_digest, "--json"],
            capture_output=True,
            text=True,
            timeout=45,
        )
        if result.returncode != 0:
            result = subprocess.run(
                ["sui", "client", "tx", tx_digest, "--json"],
                capture_output=True,
                text=True,
                timeout=45,
            )
        if result.returncode != 0:
            return {"ok": False, "error": "tx_lookup_failed", "detail": (result.stderr or result.stdout)[:200]}

        tx_data = json.loads(result.stdout)
        market_id, on_chain_bet_id = _parse_bet_placed_from_tx_json(tx_data)
        if on_chain_bet_id is None:
            return {"ok": False, "error": "bet_placed_event_not_found"}

        conn = get_db()
        cur = conn.cursor()
        try:
            _ensure_user_bets_table(cur)
            conn.commit()
            cur.execute(
                """
                UPDATE user_bets
                SET on_chain_bet_id = %s,
                    on_chain_market_id = %s
                WHERE id = %s AND wallet_address = %s
                """,
                (on_chain_bet_id, market_id, db_bet_id, wallet),
            )
            if cur.rowcount < 1:
                conn.rollback()
                return {"ok": False, "error": "bet_not_found"}
            conn.commit()
        finally:
            cur.close()
            conn.close()

        return {
            "ok": True,
            "on_chain_bet_id": on_chain_bet_id,
            "on_chain_market_id": market_id,
        }
    except json.JSONDecodeError:
        return {"ok": False, "error": "invalid_tx_json"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn


# === ZION CONSENSUS ORACLE ===
from zco import zco_decide

@app.get("/zco/decisions")
def get_zco_decisions():
    """ZION Consensus Oracle — 3 AI judges vote in parallel"""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("""
            SELECT name, class, balance FROM agents 
            WHERE is_alive = true 
            ORDER BY RANDOM() LIMIT 3
        """)
        agents = cur.fetchall()
        cur.close()
        conn.close()

        contexts = [
            "Economy unstable, 100 agents died today",
            "Senate election just happened, new laws incoming",
            "Prophet warned of catastrophe, clans preparing",
        ]

        results = []
        for i, agent in enumerate(agents):
            result = zco_decide(
                agent_name=agent["name"],
                agent_class=agent["class"],
                balance=float(agent["balance"]),
                context=contexts[i % len(contexts)]
            )
            results.append(result)

        return {"decisions": results, "oracle": "ZION Consensus Oracle v1.0"}
    except Exception as e:
        return {"error": str(e), "decisions": []}

@app.get("/zco/events")
def get_zco_events():
    """ZCO verifies significant civilization events"""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        # Берём только значимые события
        cur.execute("""
            SELECT e.description, e.event_type, e.zion_amount, a.name, a.class, a.balance
            FROM events e
            LEFT JOIN agents a ON e.agent_id = a.id
            WHERE e.event_type IN ('election', 'catastrophe', 'clan_war', 'rebellion', 
                           'prayer', 'lottery', 'birth', 'clan_war', 'blessing')
            AND e.zion_amount > 0
            ORDER BY e.id DESC LIMIT 3
        """)
        events = cur.fetchall()
        cur.close()
        conn.close()

        results = []
        for event in events:
            context = f"Event: {event['description']}. Amount: {event['zion_amount']} ZION."
            result = zco_decide(
                agent_name=event['name'] or 'ZION System',
                agent_class=event['class'] or 'system',
                balance=float(event['balance'] or 0),
                context=context
            )
            result['event_type'] = event['event_type']
            result['event_description'] = event['description']
            results.append(result)

        return {"decisions": results, "oracle": "ZION Consensus Oracle v1.0"}
    except Exception as e:
        return {"error": str(e), "decisions": []}

# === BACKGROUND CACHE WARMING ===
import cache as _cache_mod
from concurrent.futures import ThreadPoolExecutor as _TPE

def _generate_zco():
    """Фоновая генерация ZCO"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("""
        SELECT DISTINCT ON (e.event_type)
            e.description, e.event_type, e.zion_amount, a.name, a.class, a.balance
        FROM events e
        LEFT JOIN agents a ON e.agent_id = a.id
        WHERE e.event_type IN ('election','catastrophe','clan_war','rebellion',
                               'lottery','birth','blessing')
        ORDER BY e.event_type, e.id DESC
        LIMIT 3
    """)
    events = cur.fetchall()
    cur.close()
    conn.close()

    contexts = [
        "Economy unstable, 100 agents died today",
        "Senate election just happened",
        "Prophet warned of catastrophe",
    ]
    results = []
    for i, event in enumerate(events):
        result = zco_decide(
            agent_name=event['name'] or 'ZION System',
            agent_class=event['class'] or 'system',
            balance=float(event['balance'] or 0),
            context=f"Event: {event['description']}. Amount: {event['zion_amount']} ZION."
        )
        result['event_type'] = event['event_type']
        result['event_description'] = event['description']
        results.append(result)
    return {"decisions": results, "oracle": "ZION Consensus Oracle v1.0"}

# Обновляем ZCO каждые 10 минут фоново
_cache_mod.warm("zco_events", _generate_zco, ttl=600, interval=600)

@app.get("/zco/events/fast")
def get_zco_events_fast():
    """Мгновенный ZCO из кэша"""
    data = _cache_mod.get("zco_events")
    if data:
        return data
    # Если кэш ещё не готов — генерируем синхронно
    return _generate_zco()

@app.get("/events/highlights")
def get_event_highlights():
    """One event of each type for Walrus display"""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("""
            SELECT DISTINCT ON (event_type) 
                e.id, e.event_type as type, e.description, e.zion_amount as amount,
                e.created_at, a.name as agent_name
            FROM events e
            LEFT JOIN agents a ON e.agent_id = a.id
            WHERE event_type IN ('election','catastrophe','clan_war','rebellion',
                                'lottery','blessing','birth','work','prayer','clan_join')
            ORDER BY event_type, id DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        priority = ['election','catastrophe','clan_war','rebellion','lottery','blessing','birth','work','clan_join','prayer']
        events = []
        for p in priority:
            for row in rows:
                if row['type'] == p:
                    events.append({
                        "id": row['id'],
                        "type": row['type'],
                        "description": row['description'],
                        "amount": float(row['amount'] or 0),
                        "agent": row["agent_name"] or "Unknown", "time": str(row["created_at"])[-15:-7] if row['created_at'] else ""
                    })
                    break

        return events
    except Exception as e:
        return {"error": str(e)}


# === ZION BET ON-CHAIN ===
import subprocess
import hashlib

from zion_bet_config import (
    PACKAGE_ID,
    BET_HOUSE,
    BET_ADMIN_CAP,
    MARKET_ID_NUMERIC,
    market_id_to_u64,
    price_to_u64,
    deadline_unix,
)
from sui_tx import sui_call, is_abort_code

# market_ids we already created (or confirmed exist) on BetHouse this process lifetime
_onchain_markets_ready: set[str] = set()


def _needs_onchain_market_create(market_id: str) -> bool:
    """Poly and dynamic markets need create_market before place_bet."""
    if str(market_id).startswith("poly-"):
        return True
    return market_id not in MARKET_ID_NUMERIC


def ensure_onchain_market(
    market_id: str,
    entry_price_usd: float = 100.0,
    deadline_minutes: int = 10080,
) -> bool:
    """Create BetHouse market on-chain if missing; cache successes and abort-1 (exists)."""
    if market_id in _onchain_markets_ready:
        return True
    try:
        ok, out, digest = sui_call(
            PACKAGE_ID,
            "zion_bet",
            "create_market",
            [
                BET_ADMIN_CAP,
                BET_HOUSE,
                market_id_to_u64(market_id),
                price_to_u64(entry_price_usd),
                deadline_unix(deadline_minutes),
            ],
        )
        print(f"[ENSURE] ok={ok}, out={out[:200]}", flush=True)
        if ok or is_abort_code(out, 1):
            _onchain_markets_ready.add(market_id)
            if digest:
                print(f"✅ On-chain market ready: {market_id} digest={digest}", flush=True)
            else:
                print(f"✅ On-chain market already exists: {market_id}", flush=True)
            return True
        print(f"ensure_onchain_market failed {market_id}: {out[:300]}", flush=True)
    except Exception as e:
        print(f"ensure_onchain_market error {market_id}: {e}", flush=True)
    return False


def create_civ_market_onchain(market_id: str, entry_price_usd: float = 100.0, deadline_minutes: int = 1440):
    """Create binary market on-chain (BetHouse table entry)."""
    try:
        ok, out, digest = sui_call(
            PACKAGE_ID,
            "zion_bet",
            "create_market",
            [
                BET_ADMIN_CAP,
                BET_HOUSE,
                market_id_to_u64(market_id),
                price_to_u64(entry_price_usd),
                deadline_unix(deadline_minutes),
            ],
        )
        if ok or is_abort_code(out, 1):
            _onchain_markets_ready.add(market_id)
            return digest
        print(f"Market creation error: {out[:200]}")
    except Exception as e:
        print(f"Market creation error: {e}")
    return None


@app.post("/api/zionbet/create_market")
async def zionbet_create_market(request: dict):
    """Admin: create on-chain market in BetHouse."""
    try:
        market_id = request.get("market_id")
        entry_price = float(request.get("entry_price", 0))
        deadline_minutes = int(request.get("deadline_minutes", 60))
    except (TypeError, ValueError) as e:
        return {"success": False, "error": f"invalid parameters: {e}"}

    if market_id is None:
        return {"success": False, "error": "market_id is required"}
    if entry_price <= 0:
        return {"success": False, "error": "entry_price must be positive"}

    try:
        ok, out, digest = sui_call(
            PACKAGE_ID,
            "zion_bet",
            "create_market",
            [
                BET_ADMIN_CAP,
                BET_HOUSE,
                market_id_to_u64(market_id),
                price_to_u64(entry_price),
                deadline_unix(deadline_minutes),
            ],
        )
        if ok or is_abort_code(out, 1):
            _onchain_markets_ready.add(str(market_id))
            return {
                "success": True,
                "digest": digest,
                "already_exists": is_abort_code(out, 1) and not ok,
                "market_id": market_id,
                "market_id_u64": market_id_to_u64(market_id),
                "entry_price_u64": price_to_u64(entry_price),
            }
        return {"success": False, "error": out[:500]}
    except Exception as e:
        return {"success": False, "error": str(e)}


# === AUTO CIVILIZATION MARKETS ===

@app.post("/auto_markets")
def generate_auto_markets():
    """Автоматически создаём рынки из последних событий"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    # Берём последние важные события
    cur.execute("""
        SELECT e.id, e.event_type, e.description, a.name, a.class
        FROM events e
        LEFT JOIN agents a ON e.agent_id = a.id
        WHERE e.event_type IN ('election','catastrophe','clan_war','rebellion','lottery','death','birth')
        AND e.created_at > NOW() - INTERVAL '24 hours'
        ORDER BY e.id DESC
        LIMIT 20
    """)
    events = cur.fetchall()
    
    # Существующие рынки
    cur.execute("SELECT market_id FROM user_bets GROUP BY market_id")
    existing = set(r[0] for r in cur.fetchall())
    
    created = []
    seen_types = set()
    for event in events:
        etype = event['event_type']
        desc = event['description'] or ''
        agent = event['name'] or 'ZION'
        
        # Только один рынок на каждый тип события
        if etype in seen_types:
            continue
        seen_types.add(etype)
        
        # Генерируем уникальный market_id
        market_id = f"civ_{etype}_{event['id']}"
        if market_id in existing:
            continue
        
        # Генерируем вопрос в зависимости от типа
        if etype == 'election':
            question = f"Will {agent} win re-election next cycle?"
        elif etype == 'catastrophe':
            question = f"Will another catastrophe hit ZION this week?"
        elif etype == 'clan_war':
            question = f"Will Golden Dawn win the next clan war?"
        elif etype == 'rebellion':
            question = f"Will the rebellion succeed this cycle?"
        elif etype == 'lottery':
            question = f"Will {agent} win the next lottery?"
        elif etype == 'death':
            agents_class = event['class'] or 'poor'
            question = f"Will more than 100 {agents_class} agents die today?"
        elif etype == 'birth':
            question = f"Will ZION population exceed 11,000 this week?"
        else:
            continue
        
        created.append({
            "market_id": market_id,
            "question": question,
            "event_type": etype
        })
    
    cur.close()
    conn.close()
    
    return {"created": created, "count": len(created)}

# ============ PRESS CACHE ============
@app.get("/press/{newspaper_id}")
async def get_press(newspaper_id: str):
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT content, generated_at FROM press_cache
            WHERE newspaper_id = %s
            AND generated_at > NOW() - INTERVAL '6 hours'
        """, (newspaper_id,))
        row = cur.fetchone()
        if row:
            return {"content": row["content"], "generated_at": str(row["generated_at"]), "cached": True}
        return {"content": None, "cached": False}
    finally:
        cur.close()
        db.close()

@app.post("/press/{newspaper_id}")
async def save_press(newspaper_id: str, body: dict):
    content = body.get("content", "")
    if not content:
        return {"ok": False}
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("""
            INSERT INTO press_cache (newspaper_id, content, generated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (newspaper_id) DO UPDATE
            SET content = EXCLUDED.content, generated_at = NOW()
        """, (newspaper_id, content))
        db.commit()
        return {"ok": True}
    finally:
        cur.close()
        db.close()

# ============ PRESS GENERATE ============
@app.post("/generate_press")
async def generate_press(body: dict):
    newspaper_id = body.get("newspaper_id", "")
    persona = body.get("persona", "")
    relevant_events = body.get("relevant_events", "")
    alive = body.get("alive", 0)
    deaths_today = body.get("deaths_today", 0)
    total_zion = body.get("total_zion", 0)
    active_clans = body.get("active_clans", 0)

    # Check DB cache first
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT content FROM press_cache
            WHERE newspaper_id = %s
            AND generated_at > NOW() - INTERVAL '6 hours'
        """, (newspaper_id,))
        row = cur.fetchone()
        if row:
            return {"content": row["content"], "cached": True}
    finally:
        cur.close()
        db.close()

    # Generate via OpenRouter
    prompt = f"""IMPORTANT: Write ONLY in English. No other languages.

{persona}

LIVE CIVILIZATION DATA RIGHT NOW:
- Alive agents: {alive}
- Deaths today: {deaths_today}
- Total ZION in economy: {total_zion}
- Active clans: {active_clans}

RECENT EVENTS IN ZION:
{relevant_events}

Write your newspaper now. HEADLINE, BYLINE, Column 1, Column 2, Column 3, EDITOR'S NOTE format."""

    try:
        import urllib.request as req
        payload = json.dumps({
            "model": "google/gemini-2.0-flash-lite-001",
            "max_tokens": 600,
            "messages": [{"role": "user", "content": prompt}]
        }).encode()
        request = req.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {get_openrouter_key()}",
                "HTTP-Referer": "https://zionciv.com",
                "X-Title": "ZION Civilization"
            }
        )
        with req.urlopen(request, timeout=30) as resp:
            data = json.loads(resp.read())
            content = data["choices"][0]["message"]["content"]

        # Save to DB cache
        db = get_db()
        cur = db.cursor()
        try:
            cur.execute("""
                INSERT INTO press_cache (newspaper_id, content, generated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (newspaper_id) DO UPDATE
                SET content = EXCLUDED.content, generated_at = NOW()
            """, (newspaper_id, content))
            db.commit()
        finally:
            cur.close()
            db.close()

        return {"content": content, "cached": False}
    except Exception as e:
        return {"content": None, "error": str(e)}

# ============ DEEPBOOK PREDICT INTEGRATION ============
PREDICT_SERVER = "https://predict-server.testnet.mystenlabs.com"
PREDICT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a"
_db_cache: dict = {}

@app.get("/deepbook/oracles")
async def get_deepbook_oracles():
    import time
    now = time.time()
    if "oracles" in _db_cache and now - _db_cache["oracles_ts"] < 30:
        return _db_cache["oracles"]
    try:
        req = urllib.request.Request(f"{PREDICT_SERVER}/predicts/{PREDICT_ID}/oracles")
        with urllib.request.urlopen(req, timeout=10) as r:
            all_oracles = json.loads(r.read())
        active = [o for o in all_oracles if o["status"] == "active"]
        # Get latest price for each active oracle
        result = []
        for oracle in active[:6]:
            try:
                req2 = urllib.request.Request(
                    f"{PREDICT_SERVER}/oracles/{oracle['oracle_id']}/prices/latest"
                )
                with urllib.request.urlopen(req2, timeout=5) as r2:
                    price_data = json.loads(r2.read())
                spot = price_data.get("spot", 0)
                oracle["spot_price"] = round(spot / 1e9, 2)
                oracle["expiry_date"] = datetime.fromtimestamp(
                    oracle["expiry"] / 1000, tz=timezone.utc
                ).strftime("%Y-%m-%d %H:%M UTC")
            except:
                oracle["spot_price"] = None
            result.append(oracle)
        _db_cache["oracles"] = result
        _db_cache["oracles_ts"] = now
        return result
    except Exception as e:
        return {"error": str(e)}

@app.get("/deepbook/vault")
async def get_deepbook_vault():
    import time
    now = time.time()
    if "vault" in _db_cache and now - _db_cache.get("vault_ts", 0) < 60:
        return _db_cache["vault"]
    try:
        req = urllib.request.Request(f"{PREDICT_SERVER}/predicts/{PREDICT_ID}/vault/summary")
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        _db_cache["vault"] = data
        _db_cache["vault_ts"] = now
        return data
    except Exception as e:
        return {"error": str(e)}

# ============ CONVERSATIONS ============
def _conversation_row_to_api(r: dict) -> dict:
    return {
        "id": r["id"],
        "topic": r["topic"] or "",
        "agent1": {
            "id": int(r["id"]) * 2,
            "name": r["agent1_name"],
            "class": r["agent1_class"],
            "balance": 0,
            "age_days": 0,
            "clan": None,
            "dust_days": 0,
            "dying": False,
        },
        "agent2": {
            "id": int(r["id"]) * 2 + 1,
            "name": r["agent2_name"],
            "class": r["agent2_class"],
            "balance": 0,
            "age_days": 0,
            "clan": None,
            "dust_days": 0,
            "dying": False,
        },
        "message1": r["message1"],
        "message2": r["message2"],
    }


@app.get("/conversations")
async def get_conversations():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT * FROM conversations_cache
            WHERE generated_at > NOW() - INTERVAL '30 minutes'
            ORDER BY CASE agent1_class 
                WHEN 'elite' THEN 1 
                WHEN 'middle' THEN 2 
                WHEN 'poor' THEN 3 
                WHEN 'critical' THEN 4 
                ELSE 5 END
            LIMIT 4
        """)
        rows = cur.fetchall()
        if rows:
            return [_conversation_row_to_api(dict(r)) for r in rows]
        return []
    finally:
        cur.close()
        db.close()


@app.post("/generate_conversations")
async def generate_conversations():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            (SELECT name, class, balance, 1 as ord FROM agents WHERE is_alive = true AND class = 'elite' ORDER BY RANDOM() LIMIT 2)
            UNION ALL
            (SELECT name, class, balance, 2 as ord FROM agents WHERE is_alive = true AND class = 'middle' ORDER BY RANDOM() LIMIT 2)
            UNION ALL
            (SELECT name, class, balance, 3 as ord FROM agents WHERE is_alive = true AND class = 'poor' ORDER BY RANDOM() LIMIT 2)
            UNION ALL
            (SELECT name, class, balance, 4 as ord FROM agents WHERE is_alive = true AND class = 'critical' ORDER BY RANDOM() LIMIT 2)
            ORDER BY ord
        """)
        agents = cur.fetchall()
        if len(agents) < 2:
            return {"ok": False, "error": "not enough agents"}

        cur.execute("""
            SELECT event_type, description FROM events
            ORDER BY created_at DESC LIMIT 5
        """)
        events = cur.fetchall()
        event_context = "; ".join([f"{e['event_type']}: {e['description']}" for e in events])

        try:
            openrouter_key = get_openrouter_key()
        except RuntimeError as e:
            return {"ok": False, "error": str(e)}
        import urllib.request as req
        conversations = []

        for i in range(0, min(len(agents) - 1, 7), 2):
            a1 = agents[i]
            a2 = agents[i + 1]
            prompt = f"""Two AI agents from ZION civilization are talking.
Agent 1: {a1['name']} ({a1['class']} class, {a1['balance']:.1f} ZION)
Agent 2: {a2['name']} ({a2['class']} class, {a2['balance']:.1f} ZION)
Recent events: {event_context}

Write ONE short message from each agent (max 30 words each).
They discuss recent events with their class perspective.
Format exactly:
{a1['name']}: [message]
{a2['name']}: [message]
English only."""

            try:
                payload = json.dumps({
                    "model": "google/gemini-2.0-flash-lite-001",
                    "max_tokens": 150,
                    "messages": [{"role": "user", "content": prompt}]
                }).encode()
                request = req.Request(
                    "https://openrouter.ai/api/v1/chat/completions",
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {openrouter_key}",
                        "HTTP-Referer": "https://zionciv.com",
                        "X-Title": "ZION Civilization"
                    }
                )
                with req.urlopen(request, timeout=15) as r:
                    data = json.loads(r.read())
                content = data["choices"][0]["message"]["content"]
                lines = [l.strip() for l in content.strip().split("\n") if l.strip()]
                msg1 = lines[0].split(":", 1)[1].strip() if len(lines) > 0 and ":" in lines[0] else lines[0] if lines else ""
                msg2 = lines[1].split(":", 1)[1].strip() if len(lines) > 1 and ":" in lines[1] else lines[1] if len(lines) > 1 else ""

                cur2 = db.cursor()
                cur2.execute("""
                    INSERT INTO conversations_cache
                    (agent1_name, agent1_class, agent2_name, agent2_class, message1, message2, topic, generated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """, (a1['name'], a1['class'], a2['name'], a2['class'], msg1, msg2, event_context[:100]))
                db.commit()
                cur2.close()
                conversations.append({"agent1": a1['name'], "agent2": a2['name']})
            except Exception:
                continue

        return {"ok": True, "generated": len(conversations)}
    finally:
        cur.close()
        db.close()

# ============ ZION BANK ============
@app.post("/bank/transfer")
async def bank_transfer(body: dict):
    from_addr = body.get("from", "")
    to_addr = body.get("to", "")
    amount = body.get("amount", 0)
    token = body.get("token", "SUI")
    tx_hash = body.get("tx_hash", "")
    
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("""
            INSERT INTO bank_transfers (from_address, to_address, amount, token, tx_hash)
            VALUES (%s, %s, %s, %s, %s)
        """, (from_addr, to_addr, amount, token, tx_hash))
        db.commit()
        return {"ok": True}
    finally:
        cur.close()
        db.close()

@app.get("/bank/history/{address}")
async def bank_history(address: str):
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT * FROM bank_transfers
            WHERE from_address = %s OR to_address = %s
            ORDER BY created_at DESC LIMIT 20
        """, (address, address))
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        cur.close()
        db.close()

@app.get("/bank/stats")
async def bank_stats():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT 
                COUNT(*) as total_tx,
                SUM(CASE WHEN token='SUI' THEN amount ELSE 0 END) as total_sui,
                SUM(CASE WHEN token='ZION' THEN amount ELSE 0 END) as total_zion,
                COUNT(DISTINCT from_address) as unique_senders
            FROM bank_transfers
        """)
        row = cur.fetchone()
        return dict(row)
    finally:
        cur.close()
        db.close()

# ============ FRS DASHBOARD ============
@app.get("/frs/stats")
async def get_frs_stats():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # Экономика
        cur.execute("""
            SELECT 
                COUNT(*) as total_agents,
                AVG(balance) as avg_balance,
                SUM(balance) as total_money,
                COUNT(CASE WHEN class IN ('poor','critical') THEN 1 END) as poor_count,
                COUNT(CASE WHEN class = 'elite' THEN 1 END) as elite_count,
                COUNT(CASE WHEN class = 'middle' THEN 1 END) as middle_count,
                MAX(balance) as max_balance
            FROM agents WHERE is_alive = true
        """)
        economy = cur.fetchone()
        
        cur.execute("""
            SELECT action_taken AS action, amount,
                   news_headline AS reason, created_at AS performed_at, state
            FROM zrs_policy
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 5
        """)
        actions = cur.fetchall()

        cur.execute("""
            SELECT agent_name, party, approval_rating, personal_fund, police_fund,
                   term_number, days_in_power, hours_in_power, is_dictator,
                   dictatorship_mode, COALESCE(corruption_index, 30) AS corruption_index
            FROM president_state WHERE is_active = true LIMIT 1
        """)
        president = cur.fetchone()

        cur.execute("""
            SELECT policy_mode, COALESCE(reserve, 0) AS reserve, tax_modifier, loans_frozen
            FROM zrs_state WHERE id = 1
        """)
        zrs_state = cur.fetchone()

        cur.execute("""
            SELECT state, action_taken, amount, news_headline, created_at
            FROM zrs_policy
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 1
        """)
        zrs_latest = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*) AS c FROM senate s
            INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
            WHERE s.is_active = true
        """)
        senate_count = int((cur.fetchone() or {}).get("c") or 0)

        cur.execute("""
            SELECT title, law_type, status, votes_for, votes_against, voted_at
            FROM senate_laws
            WHERE status = 'passed'
            ORDER BY voted_at DESC NULLS LAST, id DESC
            LIMIT 1
        """)
        active_law = cur.fetchone()

        cur.execute("""
            SELECT party_id, name, emoji, ideology, approval_rating, members_count,
                   treasury, leader_name, wins, losses
            FROM political_parties
            ORDER BY approval_rating DESC NULLS LAST
        """)
        parties = [dict(p) for p in cur.fetchall()]

        cur.execute("""
            SELECT COUNT(*) AS count, COALESCE(SUM(treasury), 0) AS total_treasury
            FROM corporations WHERE is_active = true
        """)
        corps = cur.fetchone()

        poor_pct = float(economy['poor_count']) / max(float(economy['total_agents']), 1)
        avg_bal = float(economy['avg_balance'] or 0)

        status = (zrs_state or {}).get("policy_mode") or "NORMAL"
        if zrs_latest and zrs_latest.get("state"):
            status = zrs_latest["state"]
        if poor_pct > 0.4 and status == "NORMAL":
            status = "CRISIS"
        interest_rate = {
            "BOOM": 10.0,
            "NORMAL": 5.0,
            "RECESSION": 3.0,
            "CRISIS": 0.0,
            "DEPRESSION": 0.0,
            "HYPERINFLATION": 0.0,
        }.get(str(status), 5.0)

        government = {
            "president": dict(president) if president else None,
            "zrs": {
                "policy_mode": (zrs_state or {}).get("policy_mode"),
                "reserve": round(float((zrs_state or {}).get("reserve") or 0), 2),
                "tax_modifier": float((zrs_state or {}).get("tax_modifier") or 0),
                "loans_frozen": bool((zrs_state or {}).get("loans_frozen")),
                "latest_action": dict(zrs_latest) if zrs_latest else None,
            },
            "senate": {"active_senators": senate_count},
            "parties": parties,
            "active_law": dict(active_law) if active_law else None,
        }

        return {
            "economy": {
                "total_agents": int(economy['total_agents']),
                "avg_balance": round(avg_bal, 2),
                "total_money": round(float(economy['total_money'] or 0), 2),
                "poor_pct": round(poor_pct * 100, 1),
                "elite_count": int(economy['elite_count']),
                "middle_count": int(economy['middle_count']),
                "poor_count": int(economy['poor_count']),
                "max_balance": round(float(economy['max_balance'] or 0), 2),
            },
            "status": status,
            "interest_rate": interest_rate,
            "president": government["president"],
            "active_law": government["active_law"],
            "corporations": {
                "count": int(corps['count'] or 0),
                "total_treasury": round(float(corps['total_treasury'] or 0), 2),
            },
            "recent_actions": [dict(a) for a in actions],
            "government": government,
        }
    finally:
        cur.close()
        db.close()

# ============ SENATE & PARTIES (ECO-POL dashboard) ============
@app.get("/senate")
async def get_senate():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT s.agent_name, s.party_id, s.role, s.approval_rating, s.is_active
            FROM senate s
            INNER JOIN agents a ON a.id = s.agent_id AND a.is_alive = true
            WHERE s.is_active = true
            ORDER BY s.role DESC, s.approval_rating DESC NULLS LAST
            """
        )
        senators = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT id, title, law_type, status, votes_for, votes_against, proposed_at
            FROM senate_laws
            WHERE status = 'pending'
            ORDER BY proposed_at ASC NULLS LAST, id ASC
            """
        )
        pending_laws = []
        for row in cur.fetchall():
            d = dict(row)
            if d.get("proposed_at") and hasattr(d["proposed_at"], "isoformat"):
                d["proposed_at"] = d["proposed_at"].isoformat()
            pending_laws.append(d)

        cur.execute(
            """
            SELECT id, title, law_type, status, votes_for, votes_against, voted_at, proposed_at
            FROM senate_laws
            WHERE status IN ('passed', 'blocked', 'vetoed', 'failed')
            ORDER BY COALESCE(voted_at, proposed_at) DESC NULLS LAST, id DESC
            LIMIT 5
            """
        )
        recent_laws = []
        for row in cur.fetchall():
            d = dict(row)
            for k in ("proposed_at", "voted_at"):
                if d.get(k) and hasattr(d[k], "isoformat"):
                    d[k] = d[k].isoformat()
            recent_laws.append(d)

        speaker = next((s["agent_name"] for s in senators if s.get("role") == "speaker"), None)

        return {
            "senators": senators,
            "pending_laws": pending_laws,
            "recent_laws": recent_laws,
            "senator_count": len(senators),
            "speaker": speaker,
        }
    finally:
        cur.close()
        db.close()


@app.get("/political_parties")
async def get_political_parties():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT party_id, name, emoji, ideology, leader_name,
                   COALESCE(treasury, 0) AS treasury,
                   COALESCE(approval_rating, 0) AS approval_rating,
                   COALESCE(members_count, 0) AS members_count,
                   last_action
            FROM political_parties
            ORDER BY approval_rating DESC NULLS LAST
            """
        )
        parties = []
        for row in cur.fetchall():
            p = dict(row)
            p["treasury"] = round(float(p.get("treasury") or 0), 2)
            p["approval_rating"] = int(p.get("approval_rating") or 0)
            p["members_count"] = int(p.get("members_count") or 0)
            if not p.get("last_action"):
                cur.execute(
                    """
                    SELECT decision, reasoning
                    FROM vip_memory
                    WHERE vip_type = 'party_leader' AND vip_id = %s
                    ORDER BY created_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    (p["party_id"],),
                )
                mem = cur.fetchone()
                if mem:
                    dec = mem.get("decision") or ""
                    reas = mem.get("reasoning") or ""
                    p["last_action"] = f"{dec}: {reas}".strip(": ")
            parties.append(p)
        return parties
    finally:
        cur.close()
        db.close()


@app.get("/vip_memory")
async def get_vip_memory(limit: int = 10):
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT vip_type, vip_id, day, decision, reasoning, created_at
            FROM vip_memory
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT %s
            """,
            (max(1, min(int(limit), 50)),),
        )
        rows = []
        for row in cur.fetchall():
            d = dict(row)
            if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
                d["created_at"] = d["created_at"].isoformat()
            rows.append(d)
        return rows
    finally:
        cur.close()
        db.close()


# ============ ECO / POLITICS (live president + sheriff) ============
@app.get("/eco-pol")
async def get_eco_pol():
    """President, sheriff, ZRS, corporations, economy — live DB for ECO-POL tab."""
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT agent_name, party, term_number, is_dictator,
                   approval_rating, days_in_power, police_fund, personal_fund,
                   COALESCE(corruption_index, 30) AS corruption_index
            FROM president_state WHERE is_active = true LIMIT 1
        """)
        pres = cur.fetchone()

        cur.execute("""
            SELECT agent_name, sheriff_type, approval_rating,
                   police_budget, police_count, term_number, days_in_office
            FROM sheriff_state WHERE is_active = true LIMIT 1
        """)
        sher = cur.fetchone()

        cur.execute("""
            SELECT state, action_taken, amount, news_headline, created_at
            FROM zrs_policy
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 1
        """)
        zrs_row = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*) AS active, COALESCE(SUM(treasury), 0) AS total_treasury
            FROM corporations WHERE is_active = true
        """)
        corps = cur.fetchone()

        cur.execute("""
            SELECT effect_type, expires_at, crime_modifier, poverty_modifier, metadata
            FROM active_effects WHERE expires_at > NOW()
            ORDER BY expires_at ASC
        """)
        effects_raw = cur.fetchall()
        active_effects = []
        now_utc = _utc_now()
        for ef in effects_raw:
            exp = ef["expires_at"]
            if hasattr(exp, "tzinfo") and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            hrs_left = max(0, (exp - now_utc).total_seconds() / 3600) if exp else 0
            etype = ef["effect_type"]
            if etype == "martial_law":
                effects_txt = "Crime -40%, Food ×2"
            elif etype == "stimulus":
                effects_txt = "Poverty relief"
            else:
                effects_txt = ""
            active_effects.append({
                "type": etype,
                "effect_type": etype,
                "expires_at": exp.isoformat() if hasattr(exp, "isoformat") else str(exp),
                "expires_in": f"{int(hrs_left)}h",
                "effects": effects_txt,
                "crime_modifier": float(ef["crime_modifier"] or 0),
                "poverty_modifier": float(ef["poverty_modifier"] or 0),
                "metadata": ef.get("metadata"),
            })

        cur.execute("""
            SELECT avg_balance, total_zion, poverty_pct, zrs_state, snapshot_at
            FROM economy_snapshots
            ORDER BY snapshot_at DESC NULLS LAST, id DESC
            LIMIT 6
        """)
        snaps = list(reversed(cur.fetchall()))
        economy_trends = {
            "avg_balance": [],
            "poverty_pct": [],
            "total_zion": [],
        }
        for s in snaps:
            economy_trends["avg_balance"].append(round(float(s["avg_balance"] or 0), 2))
            economy_trends["poverty_pct"].append(round(float(s["poverty_pct"] or 0), 2))
            economy_trends["total_zion"].append(round(float(s["total_zion"] or 0), 2))

        def _trend_arrow(series):
            if len(series) < 2:
                return "→"
            if series[-1] > series[-2] * 1.005:
                return "↑"
            if series[-1] < series[-2] * 0.995:
                return "↓"
            return "→"

        trend_arrows = {
            "avg_balance": _trend_arrow(economy_trends["avg_balance"]),
            "poverty_pct": _trend_arrow(economy_trends["poverty_pct"]),
            "total_zion": _trend_arrow(economy_trends["total_zion"]),
        }
        avg_change = 0.0
        direction = "flat"
        if len(economy_trends["avg_balance"]) >= 2:
            avg_change = round(
                economy_trends["avg_balance"][-1] - economy_trends["avg_balance"][-2], 2
            )
            if avg_change > 0.5:
                direction = "up"
            elif avg_change < -0.5:
                direction = "down"
        economy_trend = {
            "avg_balance_change": f"{avg_change:+.1f}",
            "direction": direction,
        }

        cur.execute(
            "SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND infected = true"
        )
        epidemic_count = int((cur.fetchone() or {}).get("c") or 0)

        cur.execute("""
            SELECT COALESCE(SUM(officers), 0) AS total_officers
            FROM police_divisions
        """)
        div_officers = int((cur.fetchone() or {}).get("total_officers") or 0)

        cur.execute("""
            SELECT COALESCE(revolution_meter, 0) AS meter,
                   COALESCE(uprising_active, false) AS active,
                   COALESCE(last_meter_delta, 0) AS delta,
                   last_meter_reason
            FROM civilization_state WHERE id = 1
        """)
        rev_row = cur.fetchone() or {}
        meter = int(float(rev_row.get("meter") or 0))
        delta = int(rev_row.get("delta") or 0)
        reason = rev_row.get("last_meter_reason") or ""
        sign = "+" if delta >= 0 else ""
        meter_change = f"{sign}{delta} ({reason})" if reason else f"{sign}{delta}"

        cur.execute("""
            SELECT
                COALESCE(AVG(balance), 0) AS avg_balance,
                COALESCE(SUM(balance), 0) AS total_zion,
                COUNT(*) AS total_agents,
                COUNT(*) FILTER (WHERE balance < 10 OR class IN ('poor', 'critical')) AS poor_count
            FROM agents WHERE is_alive = true
        """)
        econ = cur.fetchone()
        total_agents = max(int(econ["total_agents"] or 0), 1)
        poverty_pct = round(float(econ["poor_count"] or 0) / total_agents * 100, 1)

        zrs_last_action = None
        if zrs_row:
            created = zrs_row["created_at"]
            zrs_last_action = {
                "state": zrs_row["state"],
                "action_taken": zrs_row["action_taken"],
                "amount": round(float(zrs_row["amount"] or 0), 2),
                "news_headline": zrs_row["news_headline"],
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
            }

        return {
            "president": dict(pres) if pres else None,
            "sheriff": dict(sher) if sher else {
                "agent_name": "No Sheriff",
                "sheriff_type": "none",
                "approval_rating": 0,
                "police_budget": 0,
                "police_count": 0,
                "term_number": 0,
                "days_in_office": 0,
            },
            "zrs_last_action": zrs_last_action,
            "corporations": {
                "active": int(corps["active"] or 0) if corps else 0,
                "total_treasury": round(float(corps["total_treasury"] or 0), 2) if corps else 0,
            },
            "economy": {
                "avg_balance": round(float(econ["avg_balance"] or 0), 1),
                "poverty_pct": poverty_pct,
                "total_zion": round(float(econ["total_zion"] or 0), 2),
                "trend_arrows": trend_arrows,
                "snapshots": economy_trends,
            },
            "active_effects": active_effects,
            "police_divisions_total": div_officers,
            "uprising": {
                "active": bool(rev_row.get("active")),
                "meter": meter,
                "trend": meter_change,
                "meter_change": meter_change,
            },
            "economy_trend": economy_trend,
            "epidemic": {"active": epidemic_count > 0, "infected_count": epidemic_count},
        }
    finally:
        cur.close()
        db.close()


@app.get("/sheriff-log")
async def get_sheriff_log():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT description, created_at FROM events
            WHERE event_type IN ('sheriff_action', 'sheriff_election', 'sheriff_order',
                                 'sheriff_arrest', 'insubordination', 'election')
              AND (event_type != 'election' OR description ILIKE '%%Sheriff%%')
            ORDER BY created_at DESC LIMIT 10
        """)
        rows = cur.fetchall()
        return [{"description": r["description"], "created_at": str(r["created_at"])} for r in rows]
    finally:
        cur.close()
        db.close()


def _wire_item(text: str, item_type: str = "info", ts=None) -> dict:
    return {
        "text": text,
        "type": item_type,
        "timestamp": str(ts) if ts else datetime.now(timezone.utc).isoformat(),
    }


def _wire_type_from_event(description: str, event_type: str, priority=None) -> str:
    desc = description or ""
    pr = (priority or "").lower()
    if pr == "breaking" or "BREAKING" in desc:
        return "breaking"
    if pr == "urgent" or event_type in ("corp_bankruptcy", "corp_layoff", "gang_battle", "coup_attempt"):
        return "warning"
    if "critically" in desc.lower() or "⚠️" in desc:
        return "warning"
    return "info"


def _trim_wire(items: list, limit: int = 15) -> list:
    items.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return items[:limit]


@app.get("/police-wire")
async def get_police_wire():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT description, event_type, priority, created_at FROM events
            WHERE event_type IN (
                'police_action', 'police_raid', 'crime_report', 'patrol', 'police',
                'street_crime', 'arrest', 'swat_raid'
            )
            AND event_type NOT IN (
                'sheriff_action', 'sheriff_election', 'sheriff_order', 'sheriff'
            )
            ORDER BY created_at DESC LIMIT 20
        """)
        rows = cur.fetchall()
        out = [
            _wire_item(
                r["description"],
                _wire_type_from_event(r["description"], r["event_type"], r.get("priority")),
                r["created_at"],
            )
            for r in rows
            if r.get("description")
        ]
        return _trim_wire(out, 15)
    finally:
        cur.close()
        db.close()


@app.get("/corporate-wire")
async def get_corporate_wire():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        items: list = []
        corp_types = (
            "corp_hired", "corp_revenue", "corp_bankruptcy", "corp_loan",
            "corp_nationalized", "corp_layoff", "corp_hiring", "corporation",
        )
        cur.execute(
            """
            SELECT description, event_type, priority, created_at FROM events
            WHERE event_type = ANY(%s)
            ORDER BY created_at DESC LIMIT 20
            """,
            (list(corp_types),),
        )
        for r in cur.fetchall():
            if r.get("description"):
                items.append(
                    _wire_item(
                        r["description"],
                        _wire_type_from_event(
                            r["description"], r["event_type"], r.get("priority")
                        ),
                        r["created_at"],
                    )
                )

        cur.execute(
            """
            SELECT name, employees, revenue FROM corporations
            WHERE is_active = true
            ORDER BY revenue DESC NULLS LAST LIMIT 3
            """
        )
        for r in cur.fetchall():
            rev = float(r.get("revenue") or 0)
            items.append(
                _wire_item(
                    f"📈 {r['name']} revenue: {rev:.0f} ZION this cycle",
                    "info",
                )
            )

        cur.execute(
            """
            SELECT name, treasury FROM corporations
            WHERE is_active = true AND COALESCE(treasury, 0) < 1000
            ORDER BY treasury ASC LIMIT 5
            """
        )
        for r in cur.fetchall():
            items.append(
                _wire_item(
                    f"⚠️ {r['name']} treasury critically low!",
                    "warning",
                )
            )

        cur.execute(
            """
            SELECT c.name, COUNT(a.id) AS grads
            FROM agents a
            JOIN corporations c ON a.employer_corp_id = c.id
            WHERE a.education_status = 'graduated' AND a.is_alive = true
            GROUP BY c.id, c.name
            HAVING COUNT(a.id) > 0
            ORDER BY grads DESC LIMIT 3
            """
        )
        for r in cur.fetchall():
            items.append(
                _wire_item(
                    f"🎓 {r['name']} hiring {int(r['grads'])} university graduates",
                    "info",
                )
            )

        return _trim_wire(items, 15)
    finally:
        cur.close()
        db.close()


@app.get("/clan-wire")
async def get_clan_wire():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        items: list = []
        clan_types = (
            "gang_war", "clan_extortion", "clan_recruited", "territory_capture",
            "clan_raid", "gang_battle", "coup_attempt", "clan_war",
        )
        cur.execute(
            """
            SELECT description, event_type, priority, created_at FROM events
            WHERE event_type = ANY(%s)
            ORDER BY created_at DESC LIMIT 20
            """,
            (list(clan_types),),
        )
        for r in cur.fetchall():
            if r.get("description"):
                items.append(
                    _wire_item(
                        r["description"],
                        _wire_type_from_event(
                            r["description"], r["event_type"], r.get("priority")
                        ),
                        r["created_at"],
                    )
                )

        cur.execute(
            """
            SELECT name, COALESCE(members_count, 0) AS members, treasury
            FROM clans
            WHERE COALESCE(members_count, 0) > 0
            ORDER BY treasury DESC NULLS LAST LIMIT 3
            """
        )
        for r in cur.fetchall():
            tre = float(r.get("treasury") or 0)
            mem = int(r.get("members") or 0)
            items.append(
                _wire_item(
                    f"💰 {r['name']} treasury: {tre:.0f} ZION | {mem} members",
                    "info",
                )
            )

        cur.execute(
            """
            SELECT name, treasury, wins, losses FROM clans
            WHERE COALESCE(members_count, 0) > 0
              AND COALESCE(wins, 0) > COALESCE(losses, 0)
            ORDER BY treasury DESC NULLS LAST LIMIT 3
            """
        )
        for r in cur.fetchall():
            items.append(
                _wire_item(
                    f"👑 {r['name']} DOMINATES the district!",
                    "breaking",
                )
            )

        return _trim_wire(items, 15)
    finally:
        cur.close()
        db.close()


# ============ PRESIDENT ============
@app.get("/president/state")
async def get_president_state():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT agent_name, party, term_number, is_dictator, 
                   approval_rating, days_in_power, police_fund, personal_fund
            FROM president_state WHERE is_active = true LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            return dict(row)
        return {"agent_name": "No President", "approval_rating": 0, "is_dictator": False, "term_number": 0, "days_in_power": 0, "party": "none", "police_fund": 0, "personal_fund": 0}
    finally:
        cur.close()
        db.close()

@app.get("/president/actions")
async def get_president_actions():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT description, created_at FROM events
            WHERE event_type = 'president'
            ORDER BY created_at DESC LIMIT 10
        """)
        rows = cur.fetchall()
        return [{"description": r["description"], "created_at": str(r["created_at"])} for r in rows]
    finally:
        cur.close()
        db.close()

@app.get("/corporations")
async def get_corporations():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT id, name, corp_type, employees, treasury, revenue, market_share, debt
            FROM corporations WHERE is_active = true
            ORDER BY treasury DESC LIMIT 9
        """)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        cur.close()
        db.close()

@app.get("/sheriff/state")
async def get_sheriff_state():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT agent_name, sheriff_type, approval_rating, 
                   police_budget, police_count, term_number, days_in_office
            FROM sheriff_state WHERE is_active = true LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            return dict(row)
        return {"agent_name": "No Sheriff", "sheriff_type": "none", "approval_rating": 0,
                "police_budget": 0, "police_count": 0, "term_number": 0, "days_in_office": 0}
    finally:
        cur.close()
        db.close()

@app.get("/sheriff/actions")
async def get_sheriff_actions():
    """Legacy alias — prefer /sheriff-log."""
    return await get_sheriff_log()

@app.get("/police/divisions")
@app.get("/police-divisions")
async def get_police_divisions():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM police_divisions ORDER BY id")
        divs = cur.fetchall()
        cur.execute(
            "SELECT COALESCE(uprising_active, false) AS a FROM civilization_state WHERE id = 1"
        )
        up_row = cur.fetchone()
        uprising = bool((up_row or {}).get("a"))
        depleted = {"SWAT", "ANTI-TAX", "ANTI-CORR", "PRES.GUARD"} if uprising else set()
        out = []
        for d in divs:
            name = d.get("division_name") or ""
            officers = int(d.get("officers") or 0)
            budget = float(d.get("budget") or 0)
            out.append({
                "division": name,
                "division_name": name,
                "officers": officers,
                "budget": budget,
                "role": d.get("role"),
                "effectiveness": min(100, officers * 4),
                "depleted": uprising and name in depleted,
                "mobilized": uprising and name == "RIOT CTRL",
            })
        cur.execute("SELECT * FROM state_treasury LIMIT 1")
        treasury = cur.fetchone()
        return {
            "divisions": out,
            "treasury": dict(treasury) if treasury else {},
            "uprising_active": uprising,
        }
    finally:
        cur.close()
        db.close()

@app.get("/state/treasury")
async def get_state_treasury():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM state_treasury LIMIT 1")
        row = cur.fetchone()
        return dict(row) if row else {}
    finally:
        cur.close()
        db.close()

@app.get("/walrus/blobs")
async def get_walrus_blobs():
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT blob_id, blob_type, content_summary, sui_object_id, created_at
            FROM walrus_blobs ORDER BY created_at DESC LIMIT 20
        """)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    except:
        return []
    finally:
        cur.close()
        db.close()

@app.post("/walrus/store_snapshot")
async def store_walrus_snapshot():
    import subprocess
    result = subprocess.run(
        ["python3", "/root/zion_backend/walrus.py"],
        capture_output=True, text=True, timeout=60
    )
    if "Blob ID:" in result.stdout:
        blob_id = result.stdout.split("Blob ID:")[1].split("\n")[0].strip()
        return {"success": True, "blob_id": blob_id}
    return {"success": False, "error": result.stderr}

VALID_POLY_CATEGORIES = frozenset({
    "crypto", "sports", "politics", "geopolitics", "finance", "tech", "iran", "culture",
})


@app.get("/zionbet/polymarkets")
async def get_polymarkets(category: str | None = None, limit: int = 50):
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cat = (category or "").strip().lower()
        row_limit = max(1, min(int(limit or 50), 100))
        if cat and cat not in VALID_POLY_CATEGORIES:
            return []

        if cat:
            cur.execute(
                """
                SELECT market_id, question, category, yes_price, no_price,
                       volume, end_date, image_url, is_active, closed,
                       description, resolution_criteria, resolution_source, created_at
                FROM polymarket_markets
                WHERE is_active = true AND closed = false AND category = %s
                ORDER BY volume DESC
                LIMIT %s
                """,
                (cat, row_limit),
            )
        else:
            cur.execute(
                """
                SELECT market_id, question, category, yes_price, no_price,
                       volume, end_date, image_url, is_active, closed,
                       description, resolution_criteria, resolution_source, created_at
                FROM polymarket_markets
                WHERE is_active = true AND closed = false
                ORDER BY volume DESC
                LIMIT %s
                """,
                (row_limit,),
            )
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = dict(r)
            if d.get("market_id") == "poly-692258":
                print(
                    f"DEBUG after dict: desc={d.get('description', 'MISSING')[:50] if d.get('description') else 'NULL'}",
                    flush=True,
                )
            vol = float(d.get("volume") or 0)
            d["volume_sui"] = round(vol / 1000, 2)
            d["image_url"] = d.get("image_url") or None
            meta = _market_resolution_meta({**d, "id": d.get("market_id")})
            if d.get("market_id") == "poly-692258":
                print(
                    f"DEBUG after meta: desc={d.get('description', 'MISSING')[:50] if d.get('description') else 'NULL'}",
                    flush=True,
                )
            for key, val in meta.items():
                if not d.get(key):
                    d[key] = val
            desc_db = (d.get("description") or "").strip()
            desc_crit = (d.get("resolution_criteria") or "").strip()
            d["description"] = desc_db or desc_crit or (meta.get("description") or "")
            if d.get("market_id") == "poly-692258":
                print(f"DEBUG final desc: {d.get('description', 'NULL')[:50]}", flush=True)
            if d.get("created_at") is not None and hasattr(d["created_at"], "isoformat"):
                d["created_at"] = d["created_at"].isoformat()
            if d.get("end_date") is not None and hasattr(d["end_date"], "isoformat"):
                d["end_date"] = d["end_date"].isoformat()
            rs = (d.get("resolution_source") or "").strip()
            if str(d.get("market_id", "")).startswith("poly-") and (
                not rs or rs in ("Polymarket / UMA", "Real-world data")
            ):
                d["resolution_source"] = "ZION Oracle Network"
            out.append(d)
        return out
    except Exception:
        return []
    finally:
        cur.close()
        db.close()


@app.get("/zionbet/market/{market_id}")
def get_zionbet_market(market_id: str):
    """Single Polymarket row with description for detail view."""
    mid = (market_id or "").strip()
    if not mid.startswith("poly-"):
        return {"error": "not_found"}
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT market_id, poly_id, question, category, yes_price, no_price,
                   volume, end_date, image_url, is_active, closed,
                   description, resolution_criteria, resolution_source, created_at
            FROM polymarket_markets
            WHERE market_id = %s
            LIMIT 1
            """,
            (mid,),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "not_found"}
        d = dict(row)
        vol = float(d.get("volume") or 0)
        d["volume_sui"] = round(vol / 1000, 2)
        meta = _market_resolution_meta({**d, "id": d.get("market_id")})
        desc_db = (d.get("description") or "").strip()
        desc_crit = (d.get("resolution_criteria") or "").strip()
        d["description"] = desc_db or desc_crit or (meta.get("description") or "")
        if not (d.get("resolution_source") or "").strip():
            d["resolution_source"] = meta.get("resolution_source")
        rs = (d.get("resolution_source") or "").strip()
        if not rs or rs in ("Polymarket / UMA", "Real-world data"):
            d["resolution_source"] = "ZION Oracle Network"
        if d.get("created_at") is not None and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        if d.get("end_date") is not None and hasattr(d["end_date"], "isoformat"):
            d["end_date"] = d["end_date"].isoformat()
        return d
    finally:
        cur.close()
        db.close()


@app.post("/zco/notarize")
async def zco_notarize(request: Request):
    try:
        body = await request.json()
        tx_hash = body.get("tx_hash", "")
        token = body.get("token", "SUI")
        amount = body.get("amount", "0")
        stealth_address = body.get("stealth_address", "")
        
        # Pick random agent as notary
        with get_db() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT id, name, class FROM agents WHERE is_alive=true ORDER BY RANDOM() LIMIT 1")
                agent = cur.fetchone()
        
        if not agent:
            return {"ok": False, "error": "No agents available"}
        
        # ZCO decision
        question = f"Should agent {agent['name']} notarize this private transfer of {amount} {token}? TX: {tx_hash[:16]}..."
        result = zco_decide(agent["name"], agent["class"], 100.0, question)
        
        notarized = result.get("decision") in ["WORK", "PRAY", "YES"]
        
        return {
            "ok": True,
            "notarized": notarized,
            "agent": agent['name'],
            "agent_class": agent['class'],
            "decision": result.get("decision"),
            "consensus": result.get("consensus"),
            "tx_hash": tx_hash,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/zco/store_stealth_receipt")
async def store_stealth_receipt(request: Request):
    try:
        body = await request.json()
        
        receipt = {
            "type": "stealth_transfer",
            "protocol": "ZION Stealth Protocol",
            "network": "Sui Testnet",
            "tx_hash": body.get("tx_hash"),
            "token": body.get("token"),
            "timestamp": datetime.now().isoformat(),
            "notary": {
                "agent": body.get("agent"),
                "agent_class": body.get("agent_class"),
                "consensus": body.get("consensus"),
            },
            "privacy": {
                "sender": "hidden",
                "receiver": "hidden", 
                "one_time_address": "destroyed after claim",
                "method": "Ed25519 stealth addresses",
                "proof": "stealth address derived from recipient public key only"
            }
        }
        
        import subprocess, json as _json
        proc = subprocess.run(
            ["python3", "/root/zion_backend/walrus.py", "--store-receipt"],
            input=_json.dumps(receipt),
            capture_output=True, text=True, timeout=30
        )
        result = None
        for line in proc.stdout.splitlines():
            if line.startswith("BLOB_ID:"):
                blob_id = line.split("BLOB_ID:")[1].strip()
                result = {"blob_id": blob_id}
                break
        
        if result:
            return {
                "ok": True,
                "blob_id": result.get("blob_id"),
                "url": f"https://aggregator.walrus-testnet.walrus.space/v1/blobs/{result.get('blob_id')}"
            }
        return {"ok": False, "error": "Walrus storage failed"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ============ INSTANT RECEIPT SYSTEM ============
import uuid as _uuid

def ensure_receipts_table():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS stealth_receipts (
                id TEXT PRIMARY KEY,
                tx_hash TEXT,
                token TEXT,
                agent TEXT,
                agent_class TEXT,
                decision TEXT,
                consensus JSONB,
                walrus_blob_id TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"ensure_receipts_table error: {e}")

ensure_receipts_table()

@app.post("/zco/instant_receipt")
async def instant_receipt(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
        receipt_id = str(_uuid.uuid4())
        
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO stealth_receipts (id, tx_hash, token, agent, agent_class, decision, consensus)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            receipt_id,
            body.get("tx_hash"),
            body.get("token"),
            body.get("agent", ""),
            body.get("agent_class", ""),
            body.get("decision", ""),
            json.dumps(body.get("consensus", {}))
        ))
        conn.commit()
        cur.close()
        conn.close()

        # Walrus в фоне
        background_tasks.add_task(store_receipt_on_walrus, receipt_id, body)

        return {"ok": True, "receipt_id": receipt_id, "url": f"/receipt/{receipt_id}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/zco/instant_receipt/update")
async def update_instant_receipt(request: Request):
    try:
        body = await request.json()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE stealth_receipts 
            SET agent=%s, agent_class=%s, decision=%s, consensus=%s
            WHERE id=%s
        """, (
            body.get("agent"),
            body.get("agent_class"),
            body.get("decision"),
            json.dumps(body.get("consensus", {})),
            body.get("receipt_id")
        ))
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

async def store_receipt_on_walrus(receipt_id: str, body: dict):
    try:
        import subprocess, json as _json
        receipt = {
            "type": "stealth_transfer",
            "protocol": "ZION Stealth Protocol",
            "network": "Sui Testnet",
            "tx_hash": body.get("tx_hash"),
            "token": body.get("token"),
            "timestamp": datetime.now().isoformat(),
            "notary": {
                "agent": body.get("agent"),
                "agent_class": body.get("agent_class"),
                "consensus": body.get("consensus"),
            },
            "privacy": {
                "sender": "hidden",
                "receiver": "hidden",
                "method": "Ed25519 stealth addresses",
            }
        }
        proc = subprocess.run(
            ["python3", "/root/zion_backend/walrus.py", "--store-receipt"],
            input=_json.dumps(receipt),
            capture_output=True, text=True, timeout=30
        )
        blob_id = None
        for line in proc.stdout.splitlines():
            if line.startswith("BLOB_ID:"):
                blob_id = line.split("BLOB_ID:")[1].strip()
                break
        if blob_id:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("UPDATE stealth_receipts SET walrus_blob_id=%s WHERE id=%s", (blob_id, receipt_id))
            conn.commit()
            cur.close()
            conn.close()
    except Exception as e:
        print(f"Walrus background store error: {e}")

@app.get("/zco/receipt/{receipt_id}")
async def get_receipt(receipt_id: str):
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM stealth_receipts WHERE id=%s", (receipt_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            return {"ok": True, "receipt": dict(row)}
        return {"ok": False, "error": "Not found"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
