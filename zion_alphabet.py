#!/usr/bin/env python3
"""ZION Language Layer 1 — fully synthetic procedural SVG alphabet."""
from __future__ import annotations

import hashlib
import hmac
import math
import os
from pathlib import Path

import psycopg2
import psycopg2.extras

from sql_identifiers import safe_column_name
from zion_language_seed import ensure_seed, get_seed

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

GLYPHS_DIR = Path(__file__).resolve().parent / "zion_glyphs"

PHONEMES_48 = [
    "a", "e", "i", "o", "u", "aa", "ii", "uu",
    "ba", "da", "fa", "ga", "ha", "ja", "ka", "la",
    "ma", "na", "pa", "ra", "sa", "ta", "va", "wa",
    "za", "sha", "cha", "tha", "nga", "zh", "ya", "ye",
    "ki", "ti", "ni", "mi", "lo", "ro", "so", "to",
    "ku", "tu", "nu", "mu", "ri", "si", "zi", "xon",
]

ALPHABET_SIZE = 48
STROKE_COLOR = "#1a1a2e"


def db():
    return psycopg2.connect(**DB)


def glyph_token(symbol_id: int) -> str:
    """Compact deterministic token used in encoded ZION words."""
    return f"Z{symbol_id:02d}"


def _digest(seed: str, label: str) -> bytes:
    return hmac.new(seed.encode("utf-8"), label.encode("utf-8"), hashlib.sha256).digest()


def _grid_point(digest: bytes, offset: int, margin: int = 12) -> tuple[float, float]:
    span = 100 - 2 * margin
    x = margin + (digest[offset % 32] / 255.0) * span
    y = margin + (digest[(offset + 7) % 32] / 255.0) * span
    return round(x, 2), round(y, 2)


def _stroke_line(digest: bytes, offset: int) -> str:
    x1, y1 = _grid_point(digest, offset)
    x2, y2 = _grid_point(digest, offset + 3)
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>'


def _stroke_arc(digest: bytes, offset: int) -> str:
    cx, cy = _grid_point(digest, offset)
    r = 8 + (digest[(offset + 1) % 32] % 18)
    start = digest[(offset + 2) % 32] % 360
    end = start + 60 + (digest[(offset + 4) % 32] % 180)
    large = 1 if (end - start) % 360 > 180 else 0
    sweep = digest[(offset + 5) % 32] % 2
    ex = cx + r * math.cos(math.radians(end))
    ey = cy + r * math.sin(math.radians(end))
    sx = cx + r * math.cos(math.radians(start))
    sy = cy + r * math.sin(math.radians(start))
    return (
        f'<path d="M {sx:.2f} {sy:.2f} A {r} {r} 0 {large} {sweep} {ex:.2f} {ey:.2f}"/>'
    )


def _stroke_dot(digest: bytes, offset: int) -> str:
    cx, cy = _grid_point(digest, offset)
    r = 2.5 + (digest[(offset + 2) % 32] % 4) / 2.0
    return f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="{STROKE_COLOR}" stroke="none"/>'


def _stroke_circle(digest: bytes, offset: int) -> str:
    cx, cy = _grid_point(digest, offset)
    r = 6 + (digest[(offset + 2) % 32] % 14)
    return f'<circle cx="{cx}" cy="{cy}" r="{r}"/>'


def generate_synthetic_glyph(symbol_id: int, seed: str) -> tuple[str, str, str]:
    """Return (full_svg_markup, inner_path_markup, stroke_signature)."""
    digest = _digest(seed, f"glyph:{symbol_id}")
    global_weight = 4.2 + (digest[31] % 8) / 10.0
    n_strokes = 3 + (digest[0] % 4)  # 3-6

    stroke_fns = (_stroke_line, _stroke_arc, _stroke_dot, _stroke_circle)
    inner_parts: list[str] = []
    sig_parts: list[str] = []

    for i in range(n_strokes):
        kind = digest[1 + i] % 4
        offset = 4 + i * 5
        fn = stroke_fns[kind]
        element = fn(digest, offset)
        inner_parts.append(element)
        sig_parts.append(f"{kind}:{element[:40]}")

    inner = "\n    ".join(inner_parts)
    svg_path = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
        f'data-symbol-id="{symbol_id}">\n'
        f'  <g stroke="{STROKE_COLOR}" stroke-width="{global_weight:.1f}" '
        f'fill="none" stroke-linecap="round" stroke-linejoin="round">\n'
        f"    {inner}\n"
        f"  </g>\n</svg>"
    )
    stroke_signature = "|".join(sig_parts)
    return svg_path, inner, stroke_signature


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zion_alphabet (
            symbol_id INTEGER PRIMARY KEY,
            svg_path TEXT NOT NULL,
            phoneme VARCHAR(20) NOT NULL,
            stroke_signature TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    # Migrate legacy columns from ancient-Unicode alphabet
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'zion_alphabet'
        """
    )
    cols = set()
    for r in cur.fetchall():
        cols.add(r["column_name"] if isinstance(r, dict) else r[0])
    if "svg_path" not in cols:
        cur.execute("ALTER TABLE zion_alphabet ADD COLUMN svg_path TEXT")
    if "stroke_signature" not in cols:
        cur.execute("ALTER TABLE zion_alphabet ADD COLUMN stroke_signature TEXT")
    for legacy in ("glyph", "source_scripts"):
        if legacy in cols:
            try:
                safe_legacy = safe_column_name(legacy)
                cur.execute(
                    f"ALTER TABLE zion_alphabet DROP COLUMN IF EXISTS {safe_legacy}"
                )
            except Exception:
                cur.connection.rollback()


def save_glyph_file(symbol_id: int, svg_path: str) -> Path:
    GLYPHS_DIR.mkdir(parents=True, exist_ok=True)
    out = GLYPHS_DIR / f"glyph_{symbol_id:02d}.svg"
    out.write_text(svg_path, encoding="utf-8")
    return out


def build_alphabet(seed: str | None = None, store: bool = True) -> list[dict]:
    seed = seed or ensure_seed()
    rows: list[dict] = []

    for sid in range(ALPHABET_SIZE):
        svg_path, inner, stroke_sig = generate_synthetic_glyph(sid, seed)
        save_glyph_file(sid, svg_path)
        rows.append(
            {
                "symbol_id": sid,
                "svg_path": svg_path,
                "glyph": glyph_token(sid),
                "phoneme": PHONEMES_48[sid],
                "stroke_signature": stroke_sig,
            }
        )

    if store:
        conn = db()
        cur = conn.cursor()
        ensure_schema(cur)
        for row in rows:
            cur.execute(
                """
                INSERT INTO zion_alphabet
                    (symbol_id, svg_path, phoneme, stroke_signature, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (symbol_id) DO UPDATE SET
                    svg_path = EXCLUDED.svg_path,
                    phoneme = EXCLUDED.phoneme,
                    stroke_signature = EXCLUDED.stroke_signature
                """,
                (
                    row["symbol_id"],
                    row["svg_path"],
                    row["phoneme"],
                    row["stroke_signature"],
                ),
            )
        conn.commit()
        cur.close()
        conn.close()

    return rows


def load_alphabet_from_db() -> list[dict]:
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ensure_schema(cur)
    conn.commit()
    cur.execute(
        """
        SELECT symbol_id, svg_path, phoneme, stroke_signature
        FROM zion_alphabet ORDER BY symbol_id
        """
    )
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["glyph"] = glyph_token(d["symbol_id"])
        rows.append(d)
    cur.close()
    conn.close()
    return rows


def reencode_vocabulary() -> int:
    """Re-encode all vocab entries with the current synthetic alphabet."""
    from zion_crypto_lang import CORE_VOCAB, encode, ensure_schema as ensure_vocab

    seed = ensure_seed()
    build_alphabet(seed=seed, store=True)
    conn = db()
    cur = conn.cursor()
    ensure_vocab(cur)
    conn.commit()
    cur.close()
    conn.close()

    count = 0
    for concept in CORE_VOCAB:
        encode(concept, seed=seed, store=True)
        count += 1
    return count


def print_alphabet(rows: list[dict] | None = None) -> None:
    rows = rows or load_alphabet_from_db()
    if not rows:
        rows = build_alphabet()
    print("\n" + "=" * 60)
    print("  ZION ALPHABET — 48 synthetic SVG glyphs (Layer 1)")
    print("=" * 60)
    for row in rows[:5]:
        preview = row["svg_path"].replace("\n", " ")[:80]
        print(
            f"  [{row['symbol_id']:02d}] token={glyph_token(row['symbol_id'])}  "
            f"phoneme={row['phoneme']}"
        )
        print(f"       svg: {preview}...")
    print(f"  ... ({len(rows)} total)")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    ensure_seed()
    alphabet = build_alphabet()
    n = reencode_vocabulary()
    print(f"48 glyphs generated, saved to {GLYPHS_DIR}/")
    print(f"Vocabulary re-encoded: {n} words")
    if alphabet:
        sample = alphabet[0]
        print(f"\nExample svg_path [00]:\n{sample['svg_path']}")
    print_alphabet(alphabet)
