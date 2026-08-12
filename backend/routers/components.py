"""routers/components.py — POST /select-components"""
from fastapi import APIRouter, HTTPException
from models import ComponentsInput, ComponentsOutput
from services.component_selector import select_components
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/select-components", response_model=ComponentsOutput)
def endpoint_select_components(body: ComponentsInput):
    """Stage 3 — match architecture nodes to local component library."""
    try:
        return select_components(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("select-components failed")
        raise HTTPException(500, detail=str(e))
