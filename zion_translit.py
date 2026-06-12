#!/usr/bin/env python3
"""ZION transliteration — English text/names/numbers → glyph_id sequences (visual only)."""
from __future__ import annotations

import hashlib
import hmac
import re

from zion_language_seed import get_seed

_TOKEN_RE = re.compile(r"Z(\d{2})")
_WORD_RE = re.compile(r"[A-Za-z0-9']+")

_char_map: dict[str, int] | None = None
_digit_map: dict[str, int] | None = None
_space_glyph: int | None = None


def _seed() -> str:
    return get_seed() or "zion_translit_fallback"


def _glyph_for_label(label: str) -> int:
    digest = hmac.new(_seed().encode(), label.encode(), hashlib.sha256).digest()
    return int(digest[0]) % 48


def _ensure_maps() -> None:
    global _char_map, _digit_map, _space_glyph
    if _char_map is not None:
        return
    _char_map = {}
    for ch in "abcdefghijklmnopqrstuvwxyz":
        _char_map[ch] = _glyph_for_label(f"char:{ch}")
    _digit_map = {}
    for d in "0123456789":
        _digit_map[d] = _glyph_for_label(f"digit:{d}")
    _space_glyph = _glyph_for_label("space")


def char_to_glyph(ch: str) -> int | None:
    """Map a single letter or digit to glyph_id."""
    _ensure_maps()
    c = ch.lower()
    if c in _char_map:
        return _char_map[c]
    if c in _digit_map:
        return _digit_map[c]
    return None


def parse_zion_tokens(text: str) -> list[int]:
    """Parse Z00 Z01 ... token strings into glyph_ids."""
    return [int(m.group(1)) for m in _TOKEN_RE.finditer(text or "")]


def _vocab_glyph_ids(word: str) -> list[int] | None:
    try:
        from zion_crypto_lang import lookup_zion_word

        zw = lookup_zion_word(word.lower())
        if not zw:
            return None
        ids = parse_zion_tokens(zw.replace("\u205f", " ").replace("\u2060", " "))
        return ids if ids else None
    except Exception:
        return None


def translit_to_zion(text: str) -> list[int]:
    """
    Convert English text (names, numbers, sentences) to glyph_id sequence.
    Uses zion_vocab encoded words when available; otherwise per-character transliteration.
    """
    if not text:
        return []

    if _TOKEN_RE.search(text):
        return parse_zion_tokens(text)

    _ensure_maps()
    out: list[int] = []

    for part in re.split(r"(\s+)", text):
        if not part:
            continue
        if part.isspace():
            if _space_glyph is not None:
                out.append(_space_glyph)
            continue

        for word in _WORD_RE.findall(part):
            vocab_ids = _vocab_glyph_ids(word)
            if vocab_ids:
                out.extend(vocab_ids)
                continue
            for ch in word:
                gid = char_to_glyph(ch)
                if gid is not None:
                    out.append(gid)

        for ch in part:
            if ch in ".,!?;:-":
                out.append(_glyph_for_label(f"punct:{ch}"))

    return out


def glyph_ids_to_tokens(glyph_ids: list[int]) -> str:
    return " ".join(f"Z{g:02d}" for g in glyph_ids)
