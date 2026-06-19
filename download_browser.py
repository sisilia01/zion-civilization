#!/usr/bin/env python3
"""Download books from Z-Library via headless Playwright browser automation."""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
import zipfile
from html.parser import HTMLParser
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("/root/zion_backend/knowledge_base/books")
DOWNLOAD_DIR = Path("/root/zion_backend/knowledge_base/downloads")

MIRRORS = [
    "https://z-lib.id",
    "https://z-library.se",
]

BOOKS = [
    ("Being and Time", "Heidegger"),
    ("Consciousness Explained", "Dennett"),
    ("Thinking Fast and Slow", "Kahneman"),
    ("Man's Search for Meaning", "Frankl"),
    ("Sapiens", "Harari"),
    ("The Black Swan", "Taleb"),
    ("Antifragile", "Taleb"),
    ("The Selfish Gene", "Dawkins"),
    ("Guns Germs and Steel", "Diamond"),
    ("Superintelligence", "Bostrom"),
    ("Godel Escher Bach", "Hofstadter"),
    ("The Order of Time", "Rovelli"),
    ("Debt The First 5000 Years", "Graeber"),
    ("Governing the Commons", "Ostrom"),
    ("Life 3.0", "Tegmark"),
    ("Emergence", "Holland"),
    ("Linked", "Barabasi"),
    ("The Structure of Scientific Revolutions", "Kuhn"),
    ("Behave", "Sapolsky"),
    ("Misbehaving", "Thaler"),
    ("The Gene", "Mukherjee"),
    ("Pale Blue Dot", "Sagan"),
    ("A Brief History of Time", "Hawking"),
    ("The Lucifer Effect", "Zimbardo"),
    ("Obedience to Authority", "Milgram"),
    ("Descartes Error", "Damasio"),
    ("The Body Keeps the Score", "Van der Kolk"),
    ("Capital in the Twenty First Century", "Piketty"),
    ("The Road to Serfdom", "Hayek"),
    ("Applied Cryptography", "Schneier"),
    ("Ghost in the Wires", "Mitnick"),
    ("The Art of Intrusion", "Mitnick"),
    ("Countdown to Zero Day", "Zetter"),
    ("Real World Bug Hunting", "Yaworski"),
    ("Black Hat Python", "Seitz"),
    ("Hacking The Art of Exploitation", "Erickson"),
    ("The Singularity Is Near", "Kurzweil"),
    ("Human Compatible", "Russell"),
    ("The Alignment Problem", "Christian"),
    ("Thinking in Systems", "Meadows"),
]

SEARCH_SELECTORS = 'input[name="q"], input[placeholder*="search"], #searchInput'
RESULT_SELECTORS = ".book-item h3 a, .bookItem a, .item-wrap h3 a, .resItemBox h3 a"
DOWNLOAD_SELECTORS = (
    "a.addDownloadedBook, a[href*='/dl/'], "
    "a.btn-primary, button:has-text('Download'), a:has-text('Download')"
)
LOGIN_CAPTCHA_HINTS = ("login", "captcha", "sign in", "log in", "verify")


def slug(title: str) -> str:
    s = title.lower().replace(" ", "_").replace("'", "").replace(",", "")
    return s[:50] + ".txt"


class _HTMLTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in ("script", "style"):
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip and data.strip():
            self.parts.append(data.strip())


def extract_epub_text(epub_path: str | Path) -> str:
    parts: list[str] = []
    try:
        with zipfile.ZipFile(epub_path) as zf:
            for name in sorted(zf.namelist()):
                if name.endswith((".html", ".htm", ".xhtml")):
                    parser = _HTMLTextParser()
                    parser.feed(zf.read(name).decode("utf-8", errors="ignore"))
                    parts.append(" ".join(parser.parts))
    except Exception:
        pass
    return "\n\n".join(parts)


def extract_pdf_text(pdf_path: str | Path) -> str | None:
    try:
        import pdfminer.high_level

        return pdfminer.high_level.extract_text(str(pdf_path))
    except Exception:
        return None


def page_blocked(page) -> bool:
    title = (page.title() or "").lower()
    url = page.url.lower()
    combined = f"{title} {url}"
    return any(hint in combined for hint in LOGIN_CAPTCHA_HINTS)


def goto_mirror(page, mirror: str) -> str:
    page.goto(mirror, timeout=15000)
    time.sleep(random.uniform(1, 2))
    title = page.title()
    print(f"🌐 {mirror} — page title: {title!r}", flush=True)
    return title


def pick_working_mirror(page) -> str | None:
    for mirror in MIRRORS:
        try:
            goto_mirror(page, mirror)
            if not page_blocked(page):
                return mirror
            print(f"⚠️  {mirror} blocked (login/captcha) — trying next mirror", flush=True)
        except Exception as exc:
            print(f"⚠️  {mirror} failed: {exc}", flush=True)
    return None


def search_and_download(page, mirror: str, title: str, author: str) -> Path | None:
    goto_mirror(page, mirror)

    page.fill(SEARCH_SELECTORS, f"{title} {author}")
    time.sleep(0.5)
    page.keyboard.press("Enter")
    time.sleep(random.uniform(2, 3))

    first = page.query_selector(RESULT_SELECTORS)
    if not first:
        return None
    first.click()
    time.sleep(random.uniform(1, 2))

    dl_btn = page.query_selector(DOWNLOAD_SELECTORS)
    if not dl_btn:
        return None

    with page.expect_download(timeout=30000) as dl_info:
        dl_btn.click()

    download = dl_info.value
    dl_path = DOWNLOAD_DIR / download.suggested_filename
    download.save_as(str(dl_path))
    time.sleep(1)
    return dl_path


def extract_text_from_file(dl_path: Path) -> str | None:
    suffix = dl_path.suffix.lower()
    if suffix == ".epub":
        return extract_epub_text(dl_path)
    if suffix == ".txt":
        return dl_path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".pdf":
        return extract_pdf_text(dl_path)
    return None


def process_book(page, mirror: str, title: str, author: str) -> None:
    fpath = OUT / slug(title)
    if fpath.exists() and fpath.stat().st_size > 50_000:
        print(f"⏭️  {title} — cached", flush=True)
        return

    print(f"📖 {title}...", flush=True)

    try:
        dl_path = search_and_download(page, mirror, title, author)
        if dl_path is None:
            print(f"❌ {title} — no results or download button", flush=True)
            return

        text = extract_text_from_file(dl_path)
        if text and len(text) > 10_000:
            fpath.write_text(text[:5_000_000], encoding="utf-8")
            ext = dl_path.suffix.lstrip(".")
            print(f"✅ {title} ({len(text) // 1024}kb from {ext})", flush=True)
        else:
            print(f"❌ {title} — downloaded but empty", flush=True)

    except Exception as exc:
        print(f"❌ {title} — error: {exc}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download books from Z-Library via Playwright")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N books (0 = all)")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    books = BOOKS[: args.limit] if args.limit > 0 else BOOKS

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
        except Exception as exc:
            if "Executable doesn't exist" in str(exc):
                print(
                    "❌ Chromium not installed. Run:\n"
                    "   pip install playwright pdfminer.six --break-system-packages\n"
                    "   playwright install chromium",
                    flush=True,
                )
                sys.exit(1)
            raise
        context = browser.new_context(
            accept_downloads=True,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        mirror = pick_working_mirror(page)
        if mirror is None:
            print("❌ All mirrors blocked or unreachable", flush=True)
            browser.close()
            sys.exit(1)

        for i, (title, author) in enumerate(books):
            process_book(page, mirror, title, author)
            if i < len(books) - 1:
                time.sleep(random.uniform(3, 6))

        browser.close()


if __name__ == "__main__":
    main()
