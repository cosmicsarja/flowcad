"""routers/verification.py — POST /verify"""
from fastapi import APIRouter, HTTPException
from models import VerifyInput, VerificationOutput
from services.verifier import verify
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/verify", response_model=VerificationOutput)
def endpoint_verify(body: VerifyInput):
    """Stage 7 — run ERC/DRC checks and heuristic verification."""
    try:
        return verify(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("verify failed")
        raise HTTPException(500, detail=str(e))
