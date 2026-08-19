"""
core/groq_client.py
────────────────────
Groq API client (OpenAI-compatible) with:
  - Model fallback list (Llama 3.3 70B → Llama 3.1 70B → Mixtral → Llama 3 8B)
  - Retry on malformed JSON → re-prompt with correction hint
  - Retry on 429 / quota    → exponential back-off
  - Retry on transient 5xx  → same back-off
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

_groq_client = None
_active_model: str | None = None

# Ordered fallback list — best first (verified live models as of Aug 2026)
_FALLBACK_MODELS = [
    "qwen/qwen3.6-27b",          # Best available for structured JSON (no 413 issues)
    "groq/compound",             # Groq compound model
    "groq/compound-mini",        # Lightweight fallback
    "openai/gpt-oss-120b",       # Large model (may hit 413 on big prompts)
]


def _client():
    global _groq_client
    if _groq_client is None:
        from groq import Groq  # type: ignore
        from core.config import settings
        key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
        if not key:
            raise RuntimeError("GROQ_API_KEY is not set. Add it to backend/.env")
        _groq_client = Groq(api_key=key)
    return _groq_client


def _extract_json(raw: str) -> str:
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
    response = _client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=token_limit,
        temperature=0.1,
    )
    text = response.choices[0].message.content
    if not text:
        raise ValueError(f"Empty response from {model}")
    return text


def call_groq(
    system: str,
    user: str,
    max_tokens: int = 4096,
    retries: int = 5,
) -> dict[str, Any]:
    global _active_model
    token_limit = max(max_tokens, 4096)
    preferred = _active_model or _FALLBACK_MODELS[0]
    candidates = [preferred] + [m for m in _FALLBACK_MODELS if m != preferred]
    current_user_prompt = user
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        for model in candidates:
            try:
                raw = _raw_call(model, system, current_user_prompt, token_limit)
            except Exception as exc:
                err = str(exc)
                if "model_not_found" in err.lower() or "does not exist" in err.lower() or "decommissioned" in err.lower():
                    logger.warning("Groq model %s unavailable — trying next", model)
                    continue
                if "413" in err or "payload too large" in err.lower() or "too large" in err.lower():
                    # Prompt too big for this model — skip to next (smaller) model
                    logger.warning("Groq model %s: 413 Payload Too Large — trying next model", model)
                    continue
                if "429" in err or "rate" in err.lower() or "quota" in err.lower():
                    waits = [2, 5, 10, 20, 30]
                    wait = waits[min(attempt - 1, len(waits) - 1)]
                    logger.warning("Rate-limited by Groq (attempt %d/%d) — waiting %d s", attempt, retries, wait)
                    time.sleep(wait)
                    break
                if "500" in err or "503" in err or "unavailable" in err.lower():
                    wait = 2 ** (attempt - 1)
                    logger.warning("Transient Groq error — waiting %d s", wait)
                    time.sleep(wait)
                    break
                raise

            try:
                json_str = _extract_json(raw)
                result = json.loads(json_str)
            except (json.JSONDecodeError, ValueError) as parse_exc:
                last_error = parse_exc
                if attempt < retries:
                    logger.warning("Attempt %d/%d — malformed JSON (%s) — retrying", attempt, retries, parse_exc)
                    current_user_prompt = (
                        f"{user}\n\n"
                        f"[IMPORTANT — RETRY] Your previous response was not valid JSON.\n"
                        f"Error: {parse_exc}\n"
                        f"Return ONLY a single valid JSON object with no markdown, no prose, no trailing text."
                    )
                    break
                raise ValueError(
                    f"Groq returned invalid JSON after {retries} attempts.\nLast error: {parse_exc}\nRaw (first 600 chars): {raw[:600]}"
                ) from parse_exc

            if _active_model != model:
                logger.info("Groq: using model %s", model)
                _active_model = model
            return result

        else:
            raise RuntimeError(f"All Groq model candidates unavailable: {candidates}")

    if last_error:
        raise ValueError(f"Groq call failed after {retries} retries: {last_error}")
    raise RuntimeError("call_groq exhausted retries with no result")


def active_model_name() -> str:
    return _active_model or _FALLBACK_MODELS[0]
