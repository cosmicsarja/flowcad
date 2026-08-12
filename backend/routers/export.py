"""routers/export.py — POST /export"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from models import ExportInput, ExportOutput
from services.exporter import export_design
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/export", response_model=ExportOutput)
def endpoint_export(body: ExportInput):
    """Stage 8 — generate Gerbers, BOM, STEP, design report, and zip."""
    try:
        return export_design(body)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception("export failed")
        raise HTTPException(500, detail=str(e))


@router.get("/export/download/{project_id}")
def endpoint_download(project_id: str):
    """Download the export zip for a project."""
    from core.config import settings
    zip_path = os.path.join(settings.work_dir, project_id, "flowcad_export.zip")
    if not os.path.exists(zip_path):
        raise HTTPException(404, detail="Export not found — run /export first")
    return FileResponse(zip_path, media_type="application/zip",
                        filename=f"flowcad_{project_id[:8]}.zip")
