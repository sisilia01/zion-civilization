#!/usr/bin/env python3
"""Download books from Internet Archive using direct identifiers."""

from __future__ import annotations

import json
import os
import random
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

BOOKS_DIR = Path.home() / "zion_backend" / "knowledge_base" / "books"
TIMEOUT = 30
DELAY_MIN = 3
DELAY_MAX = 5
MIN_CHARS = 50_000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ZION-Archive-Downloader/1.0)",
    "Accept": "text/plain,text/html,application/json,*/*",
}

IDENTIFIERS = [
    ("being_and_time", "beingtime0000heid", "Heidegger"),
    ("brave_new_world", "bravenewworld00huxl", "Huxley"),
    ("nineteen_eighty_four", "nineteen-eighty-four-1984", "Orwell"),
    ("consciousness_explained", "consciousnessexp00denn", "Dennett"),
    ("the_selfish_gene", "selfishgene00dawk", "Dawkins"),
    ("guns_germs_steel", "gunsgermssteelf00diam", "Diamond"),
    ("thinking_fast_slow", "thinkingfastands0000kahn", "Kahneman"),
    ("the_black_swan", "blackswanimpactof00tale", "Taleb"),
    ("mans_search_meaning", "manssearchformea00fran", "Frankl"),
    ("sapiens", "sapiensbriefhist00hara", "Harari"),
    ("cybernetics", "cyberneticsorcont00wien", "Wiener"),
    ("the_structure_scientific_revolutions", "structureofscien00kuhn", "Kuhn"),
    ("godel_escher_bach", "godelescherbachet00hofs", "Hofstadter"),
    ("debt_first_5000_years", "debtfirst5000year00grае", "Graeber"),
    ("governing_commons", "governingcommons00ostr", "Ostrom"),
    ("the_order_of_time", "orderoftimecarlo00rove", "Rovelli"),
    ("emergence", "emergencefromcha00holl", "Holland"),
    ("linked", "linkednewhafnetwo00bara", "Barabasi"),
    ("superintelligence", "superintelligence0000bost", "Bostrom"),
    ("life_3_0", "life30beinghumanin00teg", "Tegmark"),
    ("the_alignment_problem", "alignmentproblem0000chri", "Christian"),
    ("antifragile", "antifragilethings00tale", "Taleb"),
    ("misbehaving", "misbehavingmaking00thal", "Thaler"),
    ("predictably_irrational", "predictablyirrati00arie", "Ariely"),
    ("the_lucifer_effect", "lucifereffectunde00zimb", "Zimbardo"),
    ("obedience_to_authority", "obediencetoauthor00milg", "Milgram"),
    ("the_society_of_mind", "societyofmind00mins", "Minsky"),
    ("the_emperors_new_mind", "emperorsnewmindco00penr", "Penrose"),
    ("descartes_error", "descartesrroremo00dama", "Damasio"),
    ("the_body_keeps_score", "bodykeepsscorebra00vand", "Van der Kolk"),
]

TITLE_OVERRIDES: dict[str, str] = {
    "nineteen_eighty_four": "Nineteen Eighty-Four",
    "the_selfish_gene": "The Selfish Gene",
    "guns_germs_steel": "Guns Germs and Steel",
    "thinking_fast_slow": "Thinking Fast and Slow",
    "the_black_swan": "The Black Swan",
    "mans_search_meaning": "Man's Search for Meaning",
    "the_structure_scientific_revolutions": "The Structure of Scientific Revolutions",
    "debt_first_5000_years": "Debt The First 5000 Years",
    "governing_commons": "Governing the Commons",
    "the_order_of_time": "The Order of Time",
    "life_3_0": "Life 3.0",
    "the_alignment_problem": "The Alignment Problem",
    "predictably_irrational": "Predictably Irrational",
    "the_lucifer_effect": "The Lucifer Effect",
    "obedience_to_authority": "Obedience to Authority",
    "the_society_of_mind": "The Society of Mind",
    "the_emperors_new_mind": "The Emperor's New Mind",
    "descartes_error": "Descartes' Error",
    "the_body_keeps_score": "The Body Keeps the Score",
}


def clear_proxy_env() -> None:
    for key in (
        "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
        "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy",
    ):
        os.environ.pop(key, None)


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    session.trust_env = False
    session.proxies = {"http": None, "https": None}
    return session


def search_title(name: str) -> str:
    if name in TITLE_OVERRIDES:
        return TITLE_OVERRIDES[name]
    return name.replace("_", " ").title()


def download_text(session: requests.Session, identifier: str) -> tuple[str | None, str]:
    """Try djvu.txt then plain .txt. Returns (content, source_label)."""
    base = f"https://archive.org/download/{identifier}/{identifier}"
    for suffix, label in (("_djvu.txt", "djvu"), (".txt", "txt")):
        url = base + suffix
        try:
            resp = session.get(url, timeout=TIMEOUT)
            if resp.status_code == 404:
                continue
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or "utf-8"
            text = resp.text
            if text and len(text.strip()) > 0:
                return text, label
        except requests.RequestException:
            continue
    return None, ""


def archive_search(session: requests.Session, title: str) -> str | None:
    q = quote(f'title:"{title}"')
    url = (
        f"https://archive.org/advancedsearch.php"
        f"?q={q}&fl[]=identifier&output=json&rows=3"
    )
    try:
        resp = session.get(url, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        docs = data.get("response", {}).get("docs", [])
        if docs:
            return docs[0].get("identifier")
    except (requests.RequestException, json.JSONDecodeError, KeyError, TypeError):
        pass
    return None


def save_book(name: str, content: str) -> bool:
    if len(content) <= MIN_CHARS:
        return False
    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = BOOKS_DIR / f"{name}.txt"
    out_path.write_text(content, encoding="utf-8")
    return True


def process_book(session: requests.Session, name: str, identifier: str, author: str) -> None:
    label = f"{name} ({author})"
    content, source = download_text(session, identifier)

    if content is None:
        title = search_title(name)
        alt_id = archive_search(session, title)
        if alt_id and alt_id != identifier:
            content, source = download_text(session, alt_id)
            if content:
                identifier = alt_id

    if content and save_book(name, content):
        print(f"✅ {label} — {len(content):,} chars via {source} [{identifier}]")
    else:
        chars = len(content) if content else 0
        print(f"❌ {label} — {chars:,} chars (need >{MIN_CHARS:,}) [{identifier}]")


def main() -> None:
    clear_proxy_env()
    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()

    for i, (name, identifier, author) in enumerate(IDENTIFIERS):
        process_book(session, name, identifier, author)
        if i < len(IDENTIFIERS) - 1:
            time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


if __name__ == "__main__":
    main()
