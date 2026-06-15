#!/usr/bin/env python3
"""Local Ollama LLM with optional OpenRouter fallback."""
import os

import requests

try:
    from openrouter_key import _load_env_file, get_openrouter_key

    _load_env_file()
except ImportError:
    def get_openrouter_key():
        return os.environ.get("OPENROUTER_KEY", "")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_URL_2 = os.getenv("OLLAMA_URL_2", "")
OLLAMA_MODEL_2 = os.getenv("OLLAMA_MODEL_2", "llama3.2:1b")
OLLAMA_MODEL_2_GEMMA = os.getenv("OLLAMA_MODEL_2_GEMMA", "gemma2:2b")
OLLAMA_MODEL_2_QWEN = "qwen2.5:1.5b"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-chat-v3-0324")


def use_local_model() -> bool:
    return os.getenv("USE_LOCAL_MODEL", "").lower() in ("true", "1", "yes")


def generate_local(prompt: str, max_tokens: int = 200) -> str | None:
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": 0.8,
                    "top_p": 0.9,
                },
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["response"].strip()
    except Exception:
        return None


def generate_remote(
    prompt: str,
    max_tokens: int = 200,
    model: str | None = None,
) -> str | None:
    """Второй Ollama сервер для мелких частых задач."""
    if not OLLAMA_URL_2:
        return generate_local(prompt, max_tokens)
    use_model = model or OLLAMA_MODEL_2
    try:
        resp = requests.post(
            f"{OLLAMA_URL_2}/api/generate",
            json={
                "model": use_model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": 0.7,
                },
            },
            timeout=30,
        )
        data = resp.json()
        return (data.get("response") or "").strip() or None
    except Exception:
        return generate_local(prompt, max_tokens)


def generate_openrouter(
    prompt: str,
    max_tokens: int = 200,
    system: str | None = None,
    model: str | None = None,
) -> str | None:
    key = get_openrouter_key()
    if not key:
        return None
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model or OPENROUTER_MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.7,
            },
            timeout=45,
        )
        response.raise_for_status()
        return (response.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        return None


def generate_local_only(
    prompt: str,
    max_tokens: int = 200,
    system: str = "",
) -> str | None:
    """Ollama only — no OpenRouter fallback (perps, predict mass calls)."""
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    return generate_local(full_prompt, max_tokens=max_tokens)


def generate_agent_text(
    prompt: str,
    max_tokens: int = 200,
    system: str | None = None,
    model: str | None = None,
) -> str | None:
    """Prefer local Ollama when USE_LOCAL_MODEL=true; fall back to OpenRouter."""
    if use_local_model():
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        result = generate_local(full_prompt, max_tokens=max_tokens)
        if result:
            return result
    return generate_openrouter(prompt, max_tokens=max_tokens, system=system, model=model)
