import os

_ENV_LOADED = False


def _load_env_file():
    """Parse ~/zion_backend/.env into os.environ (setdefault — does not override)."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())


def get_openrouter_key():
    key = os.environ.get("OPENROUTER_KEY")
    if key:
        return key
    _load_env_file()
    return os.environ.get("OPENROUTER_KEY", "")
