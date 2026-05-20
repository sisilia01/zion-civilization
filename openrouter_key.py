"""Load OPENROUTER_KEY from environment or zion_backend/.env (never hardcode keys)."""
import os
from pathlib import Path

_ENV_LOADED = False


def _load_dotenv() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.is_file():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = value
    _ENV_LOADED = True


def get_openrouter_key() -> str:
    """Return OpenRouter API key from OPENROUTER_KEY env var or .env file."""
    _load_dotenv()
    key = os.environ.get("OPENROUTER_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "OPENROUTER_KEY is not set. Export OPENROUTER_KEY or add it to zion_backend/.env"
        )
    return key
