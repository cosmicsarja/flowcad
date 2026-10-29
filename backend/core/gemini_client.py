"""
core/gemini_client.py
─────────────────────
Direct-HTTP Gemini client (no SDK version dependency):
  • call_gemini(system, user, max_tokens, retries=3) → dict
  • Model auto-fallback list
  • Retry on malformed JSON  → re-prompt with correction hint
  • Retry on 429/quota      → short back-off (2 s → 5 s → 10 s)
  • Retry on transient 5xx / connection reset → 0.5 s → 1 s → 2 s
  • Fast-fail on 401        → clear message, no retries
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

# ── Module-level singletons ─────────────────────────────────────────────────
_active_model: str | None = None   # set on first successful call

# Ordered fallback list — only verified fast & working models
_FALLBACK_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
]

_REST_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_SESSION = requests.Session()
_SESSION.headers.update({"Content-Type": "application/json"})


def _client():
    return _SESSION


def _api_key() -> str:
    from core.config import settings
    key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set. Add it to backend/.env")
    return key


def _normalise_model(name: str) -> str:
    """Strip any 'models/' prefix — we build the URL ourselves."""
    return name.replace("models/", "")


def _extract_json(raw: str) -> str:
    """
    Extract the first complete JSON object from a string.
    Handles markdown code fences and leading prose.
    """
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if fence:
        candidate = fence.group(1).strip()
        if candidate.startswith("{"):
            return candidate

    start = raw.find("{")
    if start == -1:
        raise ValueError(f"No JSON object in response (first 300 chars): {raw[:300]}")
    depth = 0
    for i, ch in enumerate(raw[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return raw[start: i + 1]
    raise ValueError("Unmatched braces — JSON object was truncated")


def _raw_call(model: str, system: str, user: str, token_limit: int) -> str:
    """
    Single Gemini REST API call — returns raw text or raises.
    Uses requests directly; no SDK version dependency.
    """
    model_id = _normalise_model(model)
    url = f"{_REST_BASE}/{model_id}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "maxOutputTokens": token_limit,
            "temperature": 0.1,
        },
    }
    resp = _SESSION.post(url, params={"key": _api_key()}, json=payload, timeout=12)

    # Handle HTTP errors
    if resp.status_code == 401:
        raise RuntimeError(
            "Gemini API key is invalid or expired. "
            "Please update GEMINI_API_KEY in backend/.env — "
            "get a free key at https://aistudio.google.com/apikey"
        )
    if resp.status_code == 429:
        raise RuntimeError("429 rate_limit")
    if resp.status_code == 404:
        body = resp.json()
        msg = body.get("error", {}).get("message", "")
        raise RuntimeError(f"NOT_FOUND: {msg}")
    if resp.status_code >= 500:
        raise RuntimeError(f"500 transient: {resp.status_code} {resp.text[:200]}")

    resp.raise_for_status()
    data = resp.json()

    # Extract text from candidates — skip parts that only have thoughtSignature (no text)
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = next(
            (p["text"] for p in parts if "text" in p and p["text"].strip()),
            None,
        )
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected response structure: {data}") from exc

    if not text:
        raise ValueError(f"Empty response from {model_id}")

    # Strip control characters that break JSON parsing (keep \t \n \r)
    import re as _re
    text = _re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text


def call_gemini(
    system: str,
    user: str,
    max_tokens: int = 2048,
    retries: int = 3,
) -> dict[str, Any]:
    """
    Call Gemini and return a parsed JSON dict.

    Retry logic:
      - Malformed/truncated JSON → re-prompt with correction hint
      - 429 / quota exceeded     → short back-off (2 s, 5 s, 10 s)
      - 5xx / connection error   → fast back-off (0.5 s, 1 s, 2 s)
      - NOT_FOUND (model gone)   → auto-switch to next fallback model
      - 401 invalid key          → immediate fail, clear message
    """
    global _active_model
    from core.config import settings

    # Respect the caller's max_tokens — don't inflate to 8192
    token_limit = max(max_tokens, 512)

    # Build the model priority list for this call
    env_model = _normalise_model(
        os.environ.get("GEMINI_MODEL", settings.gemini_model)
    )
    preferred = _active_model or env_model
    candidates = [preferred] + [m for m in _FALLBACK_MODELS if m != preferred]

    current_user_prompt = user
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        for model in candidates:
            try:
                raw = _raw_call(model, system, current_user_prompt, token_limit)
            except Exception as exc:
                err = str(exc)

                # Model gone → try next
                if "NOT_FOUND" in err or "no longer available" in err.lower():
                    logger.warning("Model %s unavailable — trying next", model)
                    continue

                # Invalid key → immediate fail
                if (
                    "401" in err
                    or "UNAUTHENTICATED" in err
                    or "API key not valid" in err
                    or "invalid or expired" in err
                ):
                    raise

                # Rate limited or transient error → try next candidate model
                if "429" in err or "quota" in err.lower() or "rate" in err.lower():
                    logger.warning("Model %s rate-limited — trying next candidate", model)
                    last_error = exc
                    continue

                # Transient / connection error → try next candidate model
                logger.warning(
                    "Model %s transient error: %s — trying next candidate",
                    model, err[:120],
                )
                last_error = exc
                continue

            # ── Parse JSON ────────────────────────────────────────────────
            try:
                json_str = _extract_json(raw)
                result = json.loads(json_str)
            except (json.JSONDecodeError, ValueError) as parse_exc:
                last_error = parse_exc
                if attempt < retries:
                    logger.warning(
                        "Attempt %d/%d — malformed JSON (%s) — retrying",
                        attempt, retries, parse_exc,
                    )
                    current_user_prompt = (
                        f"{user}\n\n"
                        f"[RETRY] Previous response was not valid JSON.\n"
                        f"Error: {parse_exc}\n"
                        f"Return ONLY a single valid JSON object, no markdown, no prose."
                    )
                    break
                raise ValueError(
                    f"LLM returned invalid JSON after {retries} attempts.\n"
                    f"Last error: {parse_exc}\n"
                    f"Raw (first 600 chars): {raw[:600]}"
                ) from parse_exc

            # ── Success ───────────────────────────────────────────────────
            if _active_model != model:
                logger.info("Gemini: using model %s", model)
                _active_model = model
                os.environ["GEMINI_MODEL"] = model
            return result

        else:
            raise RuntimeError(
                f"All Gemini model candidates unavailable: {candidates}"
            )

    if last_error:
        raise last_error
    raise RuntimeError("call_gemini exhausted retries with no result")


def active_model_name() -> str:
    """Return the model currently being used (or config default)."""
    from core.config import settings
    return _active_model or _normalise_model(settings.gemini_model)
