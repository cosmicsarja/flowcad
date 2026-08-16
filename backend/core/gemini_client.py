"""
core/gemini_client.py
─────────────────────
Singleton Gemini client with:
  • Model auto-discovery + fallback list
  • call_gemini(system, user, retries=3) → dict
  • Retry on malformed JSON  → re-prompt with correction hint
  • Retry on 429/quota      → exponential back-off (1 s → 4 s → 16 s)
  • Retry on transient 5xx  → same back-off
  • thinking_budget=0 + max_output_tokens=8192 (proven fix for gemini-3.5-flash)
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

# ── Module-level singletons ─────────────────────────────────────────────────
_genai_client = None
_active_model: str | None = None   # set on first successful call

# Ordered fallback list (first match wins)
_FALLBACK_MODELS = [
    # 2.5 Series
    "models/gemini-2.5-pro",
    "models/gemini-2.5-flash",
    "models/gemini-2.5-flash-lite",
    
    # 2.0 Series
    "models/gemini-2.0-pro-exp-02-05",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-lite-preview-02-05",
    "models/gemini-2.0-flash-thinking-exp-01-21",
    
    # 3.x Series (Existing future versions from current codebase)
    "models/gemini-3.5-flash",
    "models/gemini-3.1-flash-lite",
    "models/gemini-3-flash-preview",
    
    # 1.5 Series
    "models/gemini-1.5-pro",
    "models/gemini-1.5-pro-latest",
    "models/gemini-1.5-flash",
    "models/gemini-1.5-flash-latest",
    "models/gemini-1.5-flash-8b",
    
    # Legacy / 1.0 Series
    "models/gemini-1.0-pro",
    "models/gemini-pro",
    
    # Generic aliases
    "models/gemini-flash-latest",
    "models/gemini-pro-latest",
]


def _client():
    """Return (or create) the singleton genai.Client."""
    global _genai_client
    if _genai_client is None:
        from google import genai  # type: ignore
        from core.config import settings
        key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to backend/.env"
            )
        _genai_client = genai.Client(api_key=key)
    return _genai_client


def _normalise_model(name: str) -> str:
    """Ensure model name has the models/ prefix."""
    return name if name.startswith("models/") else f"models/{name}"


def _extract_json(raw: str) -> str:
    """
    Extract the first complete JSON object from a string.
    Handles markdown code fences and leading prose.
    """
    # Strip markdown fences
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if fence:
        candidate = fence.group(1).strip()
        if candidate.startswith("{"):
            return candidate

    # Walk from first '{' counting depth
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
    """Single Gemini API call; returns raw text or raises."""
    from google.genai import types  # type: ignore

    config = types.GenerateContentConfig(
        system_instruction=system,
        max_output_tokens=token_limit,
        temperature=0.1,
    )
    response = _client().models.generate_content(
        model=model,
        contents=user,
        config=config,
    )
    if not response.text:
        raise ValueError(f"Empty response from {model}")
    return response.text


def call_gemini(
    system: str,
    user: str,
    max_tokens: int = 4096,
    retries: int = 5,
) -> dict[str, Any]:
    """
    Call Gemini and return a parsed JSON dict.

    Retry logic:
      - Malformed/truncated JSON → re-prompt with correction hint
      - 429 / quota exceeded     → exponential back-off
      - 5xx / transient errors   → same back-off
      - NOT_FOUND (model gone)   → auto-switch to next fallback model
    """
    global _active_model
    from core.config import settings

    token_limit = max(max_tokens, 8192)

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
                if "NOT_FOUND" in err or "no longer available" in err.lower():
                    logger.warning("Model %s unavailable — trying next", model)
                    continue  # next model
                if "429" in err or "quota" in err.lower() or "rate" in err.lower():
                    waits = [2, 5, 10, 20, 30]
                    wait = waits[min(attempt - 1, len(waits) - 1)]
                    logger.warning(
                        "Rate-limited by Gemini (attempt %d/%d) — waiting %d s",
                        attempt, retries, wait,
                    )
                    time.sleep(wait)
                    break  # retry same model next attempt
                if "500" in err or "503" in err or "unavailable" in err.lower():
                    wait = 2 ** (attempt - 1)
                    logger.warning("Transient Gemini error — waiting %d s", wait)
                    time.sleep(wait)
                    break
                raise  # unrecoverable — propagate immediately

            # ── Parse JSON ────────────────────────────────────────────────
            try:
                json_str = _extract_json(raw)
                result = json.loads(json_str)
            except (json.JSONDecodeError, ValueError) as parse_exc:
                last_error = parse_exc
                if attempt < retries:
                    logger.warning(
                        "Attempt %d/%d — malformed JSON (%s) — retrying with correction hint",
                        attempt, retries, parse_exc,
                    )
                    current_user_prompt = (
                        f"{user}\n\n"
                        f"[IMPORTANT — RETRY] Your previous response was not valid JSON.\n"
                        f"Error: {parse_exc}\n"
                        f"Return ONLY a single valid JSON object with no markdown, no prose, "
                        f"no trailing text."
                    )
                    break  # next attempt (same model order)
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
            # All models exhausted
            raise RuntimeError(
                f"All Gemini model candidates unavailable: {candidates}"
            )

    if last_error:
        raise ValueError(f"Gemini call failed after {retries} retries: {last_error}")
    raise RuntimeError("call_gemini exhausted retries with no result")


def active_model_name() -> str:
    """Return the model currently being used (or config default)."""
    from core.config import settings
    return _active_model or _normalise_model(settings.gemini_model)
