"""routers/health.py — GET /health"""
from fastapi import APIRouter
from core.config import settings
import os

router = APIRouter()


@router.get("/health", tags=["health"])
def health_check():
    llm_connected = False
    model_name = "unknown"
    provider = "none"
    error = None
    try:
        groq_key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
        if groq_key:
            from core.groq_client import active_model_name, _FALLBACK_MODELS
            provider = "groq"
            model_name = active_model_name()
            llm_connected = True
        else:
            from core import gemini_client
            gemini_client._client()
            provider = "gemini"
            model_name = gemini_client.active_model_name()
            llm_connected = True
    except Exception as e:
        error = str(e)

    return {
        "status": "ok",
        "service": "FlowCAD Pipeline API",
        "version": "1.0.0",
        "llm_provider": provider,
        "llm_connected": llm_connected,
        "gemini_connected": llm_connected,  # kept for backwards compat
        "model": model_name,
        "error": error,
    }
