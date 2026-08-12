"""routers/requirements.py — POST /extract-requirements"""
from fastapi import APIRouter, HTTPException
from models import RequirementsInput, RequirementsOutput
from services.requirement_extractor import extract_requirements
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/extract-requirements", response_model=RequirementsOutput)
def endpoint_extract_requirements(body: RequirementsInput):
    """Stage 1 — parse prompt into structured design requirements."""
    try:
        return extract_requirements(body.prompt)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("extract-requirements failed")
        raise HTTPException(500, detail=str(e))
