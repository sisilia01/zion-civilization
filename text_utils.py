"""Shared text quality helpers for knowledge base ingestion and quotes."""
from __future__ import annotations


def is_clean_text(text: str, min_printable_ratio: float = 0.85, min_len: int = 20) -> bool:
    """Return True when text is mostly printable ASCII/whitespace."""
    if not text or len(text) < min_len:
        return False
    printable = sum(1 for c in text if c.isprintable() or c in "\n\r\t")
    return (printable / len(text)) >= min_printable_ratio
