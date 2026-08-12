"""routers/architecture.py — POST /generate-architecture"""
from fastapi import APIRouter, HTTPException
from models import RequirementsOutput, ArchitectureOutput
from services.architecture_generator import generate_architecture
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/generate-architecture", response_model=ArchitectureOutput)
def endpoint_generate_architecture(body: RequirementsOutput):
    """Stage 2 — generate block-diagram architecture from requirements."""
    try:
        return generate_architecture(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("generate-architecture failed")
        raise HTTPException(500, detail=str(e))
