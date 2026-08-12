"""
services/supabase_client.py
───────────────────────────
Thin wrapper around supabase-py.  All writes are best-effort — if the
service role key is missing the pipeline continues and just returns the
in-memory response.
"""
from __future__ import annotations

import os
from typing import Any, Optional
import logging

logger = logging.getLogger(__name__)

_client = None
_client_disabled = False


def _get_client():
    global _client, _client_disabled
    if _client_disabled:
        return None
    if _client is not None:
        return _client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get(
        "SUPABASE_PUBLISHABLE_KEY", ""
    )
    if not url or not key:
        logger.info("Supabase credentials not configured — persistence disabled.")
        _client_disabled = True
        return None

    try:
        from supabase import create_client  # type: ignore

        _client = create_client(url, key)
        return _client
    except Exception as exc:
        logger.info("Supabase client unavailable: %s", exc)
        _client_disabled = True
        return None


def upsert(table: str, data: dict[str, Any]) -> Optional[dict]:
    """Insert or update a row; returns the row or None on failure."""
    client = _get_client()
    if client is None:
        return None
    try:
        resp = client.table(table).upsert(data).execute()
        if resp.data:
            return resp.data[0]
    except Exception as exc:
        logger.warning("Supabase upsert(%s) failed: %s", table, exc)
    return None


def insert(table: str, data: dict[str, Any]) -> Optional[dict]:
    """Insert a row; returns the row or None on failure."""
    client = _get_client()
    if client is None:
        return None
    try:
        resp = client.table(table).insert(data).execute()
        if resp.data:
            return resp.data[0]
    except Exception as exc:
        logger.warning("Supabase insert(%s) failed: %s", table, exc)
    return None


def select(table: str, filters: dict[str, Any]) -> list[dict]:
    """Select rows matching filters."""
    client = _get_client()
    if client is None:
        return []
    try:
        query = client.table(table).select("*")
        for col, val in filters.items():
            query = query.eq(col, val)
        resp = query.execute()
        return resp.data or []
    except Exception as exc:
        logger.warning("Supabase select(%s) failed: %s", table, exc)
        return []
