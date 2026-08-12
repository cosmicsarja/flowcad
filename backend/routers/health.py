"""routers/health.py — GET /health"""
from fastapi import APIRouter
from core import gemini_client

router = APIRouter()


@router.get("/health", tags=["health"])
def health_check():
    gemini_connected = False
    model_name = "unknown"
    error = None
    try:
        gemini_client._client()
        gemini_connected = True
        model_name = gemini_client.active_model_name()
    except Exception as e:
        error = str(e)
    
    return {
        "status": "ok",
        "service": "FlowCAD Pipeline API",
        "version": "1.0.0",
        "gemini_connected": gemini_connected,
        "model": model_name,
        "error": error
    }
