"""
services/llm_client.py
───────────────────────
Backward-compatibility shim.
The real Gemini client (with retry, model fallback, rate-limit back-off)
now lives in core/gemini_client.py.

call_llm() delegates to core.gemini_client.call_gemini() so all existing
services continue to work without changes.
"""
from core.gemini_client import call_gemini as _call_gemini

import os
import json
import re
from typing import Any


def call_llm(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    """Delegate to core.gemini_client.call_gemini with retry logic."""
    return _call_gemini(
        system=system_prompt,
        user=user_prompt,
        max_tokens=max_tokens,
        retries=5,
    )
