"""routers/placement.py — POST /place-and-route"""
from fastapi import APIRouter, HTTPException
from models import PlaceRouteInput, PlaceRouteOutput
from services.placer_router import place_and_route
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/place-and-route", response_model=PlaceRouteOutput)
def endpoint_place_and_route(body: PlaceRouteInput):
    """Stage 6 — auto-place footprints and auto-route traces."""
    try:
        return place_and_route(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("place-and-route failed")
        raise HTTPException(500, detail=str(e))
