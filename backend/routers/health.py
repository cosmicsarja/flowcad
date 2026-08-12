"""routers/health.py — GET /health"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": "FlowCAD Pipeline API", "version": "1.0.0"}
