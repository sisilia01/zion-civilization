#!/usr/bin/env python3
"""Convert PDF files in new_books_pdf/ to .txt using pdftotext (poppler-utils)."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

PDF_DIR = Path(
    os.environ.get("NEW_BOOKS_PDF_DIR", "/root/zion_backend/new_books_pdf")
)
PDFTOTEXT = os.environ.get("PDFTOTEXT_BIN", "pdftotext")


def _find_pdftotext() -> str:
    path = shutil.which(PDFTOTEXT)
    if not path:
        raise RuntimeError(
            f"{PDFTOTEXT} not found. Install poppler-utils: apt-get install -y poppler-utils"
        )
    return path


def convert_pdf(pdf_path: Path, pdftotext_bin: str) -> tuple[bool, str]:
    """Convert one PDF to .txt. Returns (success, message)."""
    txt_path = pdf_path.with_suffix(".txt")
    if txt_path.exists() and txt_path.stat().st_size > 0:
        return True, f"skip (txt exists): {txt_path.name}"

    try:
        result = subprocess.run(
            [pdftotext_bin, "-enc", "UTF-8", "-layout", str(pdf_path), str(txt_path)],
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.TimeoutExpired:
        return False, f"timeout after 600s: {pdf_path.name}"
    except OSError as exc:
        return False, f"os error: {exc}"

    if result.returncode != 0:
        err = (result.stderr or result.stdout or "unknown error").strip()
        if txt_path.exists():
            txt_path.unlink(missing_ok=True)
        return False, f"pdftotext exit {result.returncode}: {err[:200]}"

    if not txt_path.exists() or txt_path.stat().st_size == 0:
        txt_path.unlink(missing_ok=True)
        return False, "empty output (possibly scanned/image-only PDF)"

    size_kb = txt_path.stat().st_size // 1024
    return True, f"ok → {txt_path.name} ({size_kb} KB)"


def convert_all_pdfs(*, force: bool = False) -> dict:
    if not PDF_DIR.is_dir():
        raise FileNotFoundError(f"PDF directory not found: {PDF_DIR}")

    pdftotext_bin = _find_pdftotext()
    pdf_files = sorted(PDF_DIR.glob("*.pdf"))

    converted = 0
    skipped = 0
    failed = 0
    errors: list[str] = []

    print(f"[convert_pdfs_to_txt] dir={PDF_DIR} pdfs={len(pdf_files)}")

    for i, pdf_path in enumerate(pdf_files, 1):
        txt_path = pdf_path.with_suffix(".txt")
        if force and txt_path.exists():
            txt_path.unlink()

        ok, msg = convert_pdf(pdf_path, pdftotext_bin)
        prefix = f"[{i}/{len(pdf_files)}] {pdf_path.name}"

        if ok:
            if msg.startswith("skip"):
                skipped += 1
                print(f"  {prefix}: {msg}")
            else:
                converted += 1
                print(f"  {prefix}: {msg}")
        else:
            failed += 1
            errors.append(f"{pdf_path.name}: {msg}")
            print(f"  {prefix}: FAIL — {msg}")

    stats = {
        "total": len(pdf_files),
        "converted": converted,
        "skipped": skipped,
        "failed": failed,
        "errors": errors,
    }
    print(
        f"[convert_pdfs_to_txt] done: converted={converted} skipped={skipped} "
        f"failed={failed} total={len(pdf_files)}"
    )
    return stats


if __name__ == "__main__":
    force_flag = "--force" in sys.argv
    convert_all_pdfs(force=force_flag)
