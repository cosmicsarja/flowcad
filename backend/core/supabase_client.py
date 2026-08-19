"""
core/supabase_client.py
────────────────────────
Singleton Supabase client. All persistence is best-effort:
if Supabase is not configured or unreachable, operations return None
and the pipeline continues with in-memory data only.

Exposes: upsert, insert, select, update, delete
"""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_client = None
_client_disabled = False   # cached after first failure so we don't retry every call


def _get_client():
    global _client, _client_disabled
    if _client_disabled:
        return None
    if _client is not None:
        return _client

    from core.config import settings
    url = settings.supabase_url
    key = settings.supabase_effective_key

    if not url or not key:
        logger.info("Supabase not configured — persistence disabled")
        _client_disabled = True
        return None

    try:
        from supabase import create_client  # type: ignore
        _client = create_client(url, key)
        logger.info("Supabase connected: %s", url)
        return _client
    except Exception as exc:
        logger.info("Supabase unavailable: %s — persistence disabled", exc)
        _client_disabled = True
        return None


# ── CRUD helpers ─────────────────────────────────────────────────────────────

def insert(table: str, data: dict[str, Any]) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return None
    try:
        resp = client.table(table).insert(data).execute()
        return resp.data[0] if resp.data else None
    except Exception as exc:
        logger.warning("Supabase insert(%s) failed: %s", table, exc)
        return None


def upsert(table: str, data: dict[str, Any]) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return None
    try:
        resp = client.table(table).upsert(data).execute()
        return resp.data[0] if resp.data else None
    except Exception as exc:
        logger.warning("Supabase upsert(%s) failed: %s", table, exc)
        return None


def update(table: str, match: dict[str, Any], data: dict[str, Any]) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return None
    try:
        # supabase-py v2: .update(data) first, then .eq() filters
        q = client.table(table).update(data)
        for col, val in match.items():
            q = q.eq(col, val)
        resp = q.execute()
        return resp.data[0] if resp.data else None
    except Exception as exc:
        logger.warning("Supabase update(%s) failed: %s", table, exc)
        return None


def select(table: str, match: dict[str, Any], limit: int = 1) -> Optional[list[dict]]:
    client = _get_client()
    if client is None:
        return None
    try:
        # supabase-py v2: .select("*") first, then .eq() filters
        q = client.table(table).select("*")
        for col, val in match.items():
            q = q.eq(col, val)
        resp = q.limit(limit).execute()
        return list(resp.data) if resp.data else []
    except Exception as exc:
        logger.warning("Supabase select(%s) failed: %s", table, exc)
        return None


def delete(table: str, match: dict[str, Any]) -> bool:
    client = _get_client()
    if client is None:
        return False
    try:
        q = client.table(table)
        for col, val in match.items():
            q = q.eq(col, val)
        q.delete().execute()
        return True
    except Exception as exc:
        logger.warning("Supabase delete(%s) failed: %s", table, exc)
        return False
