"""routers/schematic.py — POST /generate-schematic"""
from fastapi import APIRouter, HTTPException
from models import SchematicInput, SchematicOutput
from services.schematic_generator import generate_schematic
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/generate-schematic", response_model=SchematicOutput)
def endpoint_generate_schematic(body: SchematicInput):
    """Stage 4 — generate SKiDL netlist from selected components."""
    try:
        return generate_schematic(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("generate-schematic failed")
        raise HTTPException(500, detail=str(e))
