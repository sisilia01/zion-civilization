#!/usr/bin/env python3
"""ZION Language — private seed generation and access (Layer 3 key)."""
from __future__ import annotations

import os
import secrets
import sys

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
_SEED_SHOWN_FLAG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".zion_lang_seed_shown")


def _load_env() -> None:
    if not os.path.isfile(ENV_PATH):
        return
    with open(ENV_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())


def _read_env_seed() -> str | None:
    val = os.environ.get("ZION_LANG_SEED", "").strip()
    return val if val else None


def _append_seed_to_env(seed: str) -> None:
    with open(ENV_PATH, "a", encoding="utf-8") as f:
        f.write(f"\nZION_LANG_SEED={seed}\n")
    os.environ["ZION_LANG_SEED"] = seed


def ensure_seed() -> str:
    """Generate seed on first run if missing; return the active seed."""
    _load_env()
    seed = _read_env_seed()
    if seed:
        return seed

    seed = secrets.token_hex(32)
    _append_seed_to_env(seed)

    if not os.path.isfile(_SEED_SHOWN_FLAG):
        print(
            "\n" + "=" * 72 + "\n"
            "ZION LANGUAGE SEED GENERATED\n"
            f"ZION_LANG_SEED={seed}\n\n"
            "SAVE THIS SEED SECURELY — it is the ONLY key to decode the ZION language\n"
            "and prove authorship. It will not be shown again.\n"
            + "=" * 72 + "\n",
            flush=True,
        )
        with open(_SEED_SHOWN_FLAG, "w", encoding="utf-8") as f:
            f.write("1")

    return seed


def get_seed() -> str | None:
    """Return seed from environment, or None if not configured."""
    _load_env()
    return _read_env_seed()


if __name__ == "__main__":
    ensure_seed()
    if _read_env_seed() and os.path.isfile(_SEED_SHOWN_FLAG):
        print("[zion_language_seed] seed configured (not displayed).")
    sys.exit(0)
