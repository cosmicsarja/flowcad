"""routers/edit.py — POST /apply-edit"""
from fastapi import APIRouter, HTTPException
from models import ApplyEditInput, ApplyEditOutput
from services.edit_commander import apply_edit
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/apply-edit", response_model=ApplyEditOutput)
def endpoint_apply_edit(body: ApplyEditInput):
    """Stage 9 — parse an edit command, apply it, and re-verify."""
    try:
        return apply_edit(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("apply-edit failed")
        raise HTTPException(500, detail=str(e))
