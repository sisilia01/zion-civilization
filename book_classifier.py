#!/usr/bin/env python3
"""Auto-classify knowledge_base books into research tracks."""
from __future__ import annotations

import os
import re
from pathlib import Path

import httpx

try:
    from openrouter_key import _load_env_file, get_openrouter_key

    _load_env_file()
except ImportError:

    def get_openrouter_key():
        return os.environ.get("OPENROUTER_KEY", "")


BOOKS_DIR = Path(os.path.expanduser("~/zion_backend/knowledge_base/books"))
MODEL = "deepseek/deepseek-chat-v3-0324"

# (regex pattern on filename stem, track)
FILENAME_RULES: list[tuple[str, str]] = [
    (r"hack_|bounty|exploit|vulnerability|smashing_stack|return_oriented|audit|immunefi|certik|slowmist|rekt", "SECURITY"),
    (r"paper_attention|paper_deep_learning|paper_emergent|superintelligence|human_compatible|paper_sparks_agi|paper_reward|paper_computing_machinery|paper_constitutional_ai|meta_agent", "ARTIFICIAL_INTELLIGENCE"),
    (r"das_kapital|wealth_of_nations|antifragile|thinking_fast|theory_leisure|principles_political_economy|paper_flash_boys|paper_noise_trader|paper_prospect_theory|paper_market_lemons|theory_moral_sentiments|theory_leisure_class|utilitarianism_mill|on_liberty_mill", "ECONOMICS"),
    (r"leviathan|republic|politics|federalist|common_sense|democracy_america|communist_manifesto|second_treatise|spirit_laws|the_prince|rights_man|social_contract|decline_fall|gallic_wars|peloponnesian", "POLITICS"),
    (r"critique_pure|beyond_good_evil|meditations|thus_spoke|ethics_spinoza|nicomachean|discourse_method|tao_te|dhammapada|enchiridion|groundwork|monadology|philosophical_investigations|apology_|phaedrus|prolegomena|categories_aristotle|treatise_human_nature|essays_moral", "PHILOSOPHY"),
    (r"interpretation_dreams|principles_psychology|beyond_pleasure|psychopathology|varieties_religious|demian", "PSYCHOLOGY"),
    (r"origin_species|relativity|mathematical_principles|dialogue.*galileo|revolutions_celestial|de_rerum_natura|descent_man|naturalist_voyage|molecular_structure|opticks|mendel|experiments_plant|novum_organum|expression_emotions", "SCIENCE"),
    (r"conlang|linguistic_|proto_indo|undeciphered|language_shapes|hopi_time|piraha|meta_language|paper_language_as_virus|meta_zion_language", "LINGUISTICS"),
    (r"bible|bhagavad_gita|rigveda|upanishads|summa_theologica|confessions|city_of_god|book_of_job|zhuangzi|i_ching|golden_bough", "RELIGION"),
    (r"histories_herodotus|peloponnesian|decline_fall|lives_plutarch|gallic_wars|anabasis|anglo_saxon_chronicle", "HISTORY"),
    (r"hamlet|don_quixote|iliad|odyssey|divine_comedy|paradise_lost|crime_punishment|faust|moby_dick|brothers_karamazov|war_peace|shakespeare|dickens|dostoevsky|tolstoy|homer|dante|goethe|twain|austen|bronte|wilde|kafka|melville|verne|conrad|wells|stoker|kipling|london|hawthorne|paine|chaucer|milton|virgil|sophocles|euripides|beowulf|aeneid|merchant_venice|macbeth|sonnets|pride_prejudice|jane_eyre|bleak_house|david_copperfield|tom_sawyer|sherlock|idiot_|fathers_sons|death_ivan|picture_dorian|invisible_man|time_machine|journey_center|around_world|jungle_book|kim_|scarlet_letter|white_fang|antigone|oedipus|theogony", "LITERATURE"),
    (r"paper_bitcoin|paper_ethereum|paper_uniswap|paper_flash_loans|hack_dao|hack_euler|paper_sui_lutris|paper_move_prover", "BLOCKCHAIN"),
    (r"paper_fermi|paper_communication_extraterrestrial|paper_thermodynamic_black_holes|paper_are_you_living_simulation|paper_can_quantum", "COSMOLOGY"),
    (r"meta_zion|paper_dao_autonomous|paper_cooperative_ai|paper_evolution_cooperation|paper_the_nature_of_love|meta_zion_love_death|meta_zion_time|meta_zion_horizon", "ZION_RESEARCH"),
    (r"anthropolog|sociology|social_behavior|tribal|cultural_evolution|human_nature", "ANTHROPOLOGY"),
]

VALID_TRACKS = {
    "SECURITY",
    "ARTIFICIAL_INTELLIGENCE",
    "ECONOMICS",
    "POLITICS",
    "PHILOSOPHY",
    "PSYCHOLOGY",
    "SCIENCE",
    "LINGUISTICS",
    "RELIGION",
    "HISTORY",
    "LITERATURE",
    "BLOCKCHAIN",
    "COSMOLOGY",
    "ZION_RESEARCH",
    "ANTHROPOLOGY",
}


def _read_first_chars(path: Path, n: int = 500) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    return re.sub(r"\s+", " ", text).strip()[:n]


def _keyword_classify(filename: str, excerpt: str = "") -> str | None:
    stem = Path(filename).stem.lower()
    blob = f"{stem} {excerpt[:500].lower()}"
    for pattern, track in FILENAME_RULES:
        if re.search(pattern, blob, re.IGNORECASE):
            return track
    return None


def _llm_classify(filename: str, excerpt: str) -> str:
    key = get_openrouter_key()
    if not key:
        return "SCIENCE"
    prompt = (
        f"Classify this book into ONE topic category: {filename}\n"
        f"First lines: {excerpt[:500]}\n"
        "Return only the category name in CAPS with underscores (e.g. ECONOMICS, ARTIFICIAL_INTELLIGENCE)."
    )
    try:
        with httpx.Client(timeout=45) as client:
            r = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 40,
                    "temperature": 0.1,
                },
            )
            r.raise_for_status()
            raw = (r.json()["choices"][0]["message"]["content"] or "").strip().upper()
            raw = re.sub(r"[^A-Z_]", "", raw.replace(" ", "_"))
            if raw in VALID_TRACKS:
                return raw
            for track in VALID_TRACKS:
                if track in raw or raw in track:
                    return track
    except Exception as e:
        print(f"[book_classifier] LLM error: {e}")
    return "SCIENCE"


def classify_book(filename: str, excerpt: str | None = None) -> str:
    """Classify a book file into a track name."""
    path = BOOKS_DIR / filename if not Path(filename).is_absolute() else Path(filename)
    if excerpt is None and path.is_file():
        excerpt = _read_first_chars(path)
    excerpt = excerpt or ""
    hit = _keyword_classify(filename, excerpt)
    if hit:
        return hit
    return _llm_classify(filename, excerpt)


def ensure_book_tracks_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS book_tracks (
            filename VARCHAR(300) PRIMARY KEY,
            track VARCHAR(50) NOT NULL,
            auto_classified BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def sync_book_tracks(cur, verbose: bool = True) -> dict:
    """Scan knowledge_base/books and classify any new files."""
    ensure_book_tracks_schema(cur)
    if not BOOKS_DIR.is_dir():
        return {"scanned": 0, "new": 0, "tracks": {}}

    cur.execute("SELECT filename FROM book_tracks")
    known = {r["filename"] if isinstance(r, dict) else r[0] for r in cur.fetchall()}
    new_count = 0
    track_counts: dict[str, int] = {}

    for path in sorted(BOOKS_DIR.glob("*.txt")):
        fname = path.name
        if fname in known:
            continue
        track = classify_book(fname, _read_first_chars(path))
        cur.execute(
            """
            INSERT INTO book_tracks (filename, track, auto_classified)
            VALUES (%s, %s, true)
            ON CONFLICT (filename) DO NOTHING
            """,
            (fname, track),
        )
        new_count += 1
        track_counts[track] = track_counts.get(track, 0) + 1
        if verbose:
            print(f"[book_classifier] {fname} → {track}")

    cur.execute("SELECT track, COUNT(*) AS c FROM book_tracks GROUP BY track ORDER BY track")
    all_tracks = {r["track"]: int(r["c"]) for r in cur.fetchall()}
    return {"scanned": len(list(BOOKS_DIR.glob("*.txt"))), "new": new_count, "tracks": all_tracks}


def list_discovered_tracks(cur) -> list[dict]:
    ensure_book_tracks_schema(cur)
    cur.execute(
        """
        SELECT track, COUNT(*) AS book_count
        FROM book_tracks
        GROUP BY track
        ORDER BY book_count DESC, track ASC
        """
    )
    return [dict(r) for r in cur.fetchall()]


def get_books_for_track(cur, track: str) -> list[str]:
    cur.execute(
        "SELECT filename FROM book_tracks WHERE track = %s ORDER BY filename",
        (track.upper(),),
    )
    return [r["filename"] if isinstance(r, dict) else r[0] for r in cur.fetchall()]


if __name__ == "__main__":
    import psycopg2
    import psycopg2.extras
    from zlab import db_conn

    conn = db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    result = sync_book_tracks(cur)
    conn.commit()
    print(result)
    cur.close()
    conn.close()
