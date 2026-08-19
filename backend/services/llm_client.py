"""
services/llm_client.py
───────────────────────
Central LLM dispatcher.

Priority:
  1. Groq  (GROQ_API_KEY set)  — free, fast, open-source Llama 3.3 70B
  2. Gemini (GEMINI_API_KEY set) — fallback

All existing services call call_llm() unchanged.
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def call_llm(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    """
    Dispatch to the best available LLM provider.
    Groq is preferred (free + fast). Falls back to Gemini.
    """
    from core.config import settings

    # ── Groq (preferred) ──────────────────────────────────────────────────────
    groq_key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        logger.info("LLM: using Groq")
        from core.groq_client import call_groq
        return call_groq(system=system_prompt, user=user_prompt, max_tokens=max_tokens, retries=5)

    # ── Gemini (fallback) ─────────────────────────────────────────────────────
    gemini_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
    if gemini_key:
        logger.info("LLM: using Gemini (fallback)")
        from core.gemini_client import call_gemini
        return call_gemini(system=system_prompt, user=user_prompt, max_tokens=max_tokens, retries=5)

    raise RuntimeError(
        "No LLM API key found. Set GROQ_API_KEY (preferred) or GEMINI_API_KEY in backend/.env"
    )
