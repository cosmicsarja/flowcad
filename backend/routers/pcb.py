"""routers/pcb.py — POST /generate-pcb"""
from fastapi import APIRouter, HTTPException
from models import PcbInput, PcbOutput
from services.pcb_generator import generate_pcb
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/generate-pcb", response_model=PcbOutput)
def endpoint_generate_pcb(body: PcbInput):
    """Stage 5 — generate .kicad_pcb file from netlist."""
    try:
        return generate_pcb(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("generate-pcb failed")
        raise HTTPException(500, detail=str(e))
