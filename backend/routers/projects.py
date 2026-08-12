"""
routers/projects.py
────────────────────
POST /projects/{project_id}/generate
  Orchestrates all 8 pipeline stages for a project stored in Supabase.
  • Checks monthly generation limit (default 5) → 429 if exceeded
  • Writes design_state back to Supabase after every stage
  • Snapshots completed state to project_versions
  • Increments profiles.generations_this_month on success

DEV NOTE:
  If Supabase is not configured or there is no logged-in user,
  pass ?user_id=<uuid> to override, or set DEV_USER_ID in .env.
  The pipeline still runs; Supabase writes are best-effort.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from core import supabase_client as db
from core.config import settings
from models.pipeline import (
    GenerationStatus,
    GenerateProjectInput,
    ProjectRow,
    BoardConstraints,
)

# Services
from services.requirement_extractor import extract_requirements
from services.architecture_generator import generate_architecture
from services.component_selector import select_components
from services.schematic_generator import generate_schematic
from services.pcb_generator import generate_pcb
from services.placer_router import place_and_route
from services.verifier import verify
from services.exporter import export_design

# Input models for chaining
from models.pipeline import (
    ComponentsInput,
    SchematicInput,
    PcbInput,
    PlaceRouteInput,
    VerifyInput,
    ExportInput,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["projects"])

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_user_id(override: Optional[str]) -> Optional[str]:
    """Pick user_id from: request override → DEV_USER_ID env → None."""
    return override or settings.dev_user_id or None


def _check_usage_limit(user_id: Optional[str]) -> None:
    """
    If user_id is known, load their profile and raise 429 if they've hit
    the free-tier monthly limit. Silently passes when Supabase is offline.
    """
    if not user_id:
        return
    rows = db.select("profiles", {"id": user_id})
    if not rows:
        return  # profile not found — allow (will be created on success)
    profile = rows[0]

    # Auto-reset counter if we've rolled into a new calendar month
    reset_at_raw = profile.get("month_reset_at")
    if reset_at_raw:
        reset_dt = datetime.fromisoformat(reset_at_raw.replace("Z", "+00:00"))
        current_month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        reset_month_start = reset_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if current_month_start > reset_month_start:
            db.update("profiles", {"id": user_id}, {
                "generations_this_month": 0,
                "month_reset_at": _now_iso(),
            })
            return

    count = profile.get("generations_this_month", 0)
    limit = settings.free_tier_monthly_limit
    if count >= limit:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "monthly_limit_reached",
                "message": (
                    f"You've used {count}/{limit} free generations this month. "
                    "Upgrade to continue, or wait until next month."
                ),
                "used": count,
                "limit": limit,
            },
        )


def _set_project_status(project_id: str, status: GenerationStatus, extra: dict | None = None) -> None:
    """Update project status + optional extra fields in Supabase (best-effort)."""
    data: dict = {"status": status.value, "updated_at": _now_iso()}
    if extra:
        data.update(extra)
    db.update("projects", {"id": project_id}, data)


def _write_design_state(project_id: str, design_state: dict) -> None:
    """Persist current pipeline progress to projects.design_state (best-effort)."""
    db.update("projects", {"id": project_id}, {
        "design_state": design_state,
        "updated_at": _now_iso(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# Orchestration endpoint
# ─────────────────────────────────────────────────────────────────────────────

from pydantic import BaseModel

class CreateProjectInput(BaseModel):
    prompt: str
    user_id: Optional[str] = None
    title: Optional[str] = "New Project"

@router.post("/projects", response_model=ProjectRow)
def create_project(body: CreateProjectInput):
    """Creates a new project row in Supabase and returns it."""
    project_id = str(uuid.uuid4())
    resolved_user = _resolve_user_id(body.user_id)
    
    # Check usage limit before creating project
    _check_usage_limit(resolved_user)
    
    data = {
        "id": project_id,
        "prompt": body.prompt,
        "title": body.title,
        "status": GenerationStatus.pending.value,
        "design_state": {},
    }
    if resolved_user:
        data["user_id"] = resolved_user
        
    inserted = db.insert("projects", data)
    if not inserted:
        # Fallback to returning a mocked row if Supabase is down
        return ProjectRow(**data)
    
    return ProjectRow(**inserted[0])

@router.post("/projects/{project_id}/generate", response_model=ProjectRow)
def generate_project(
    project_id: str,
    body: GenerateProjectInput,
    user_id: Optional[str] = Query(None, description="Override user_id for dev/testing"),
):
    """
    Orchestrate all 8 pipeline stages for the given project.
    Writes incremental progress to Supabase after each stage.
    """
    resolved_user = _resolve_user_id(user_id or body.user_id)

    # ── 1. Check usage limit ─────────────────────────────────────────────────
    _check_usage_limit(resolved_user)

    # ── 2. Mark project as generating ────────────────────────────────────────
    _set_project_status(project_id, GenerationStatus.generating)

    design_state: dict = {
        "prompt": body.prompt,
        "stage": "requirements",
        "stages_done": [],
        "last_error": None,
    }

    try:
        # ── Stage 1: Requirements ────────────────────────────────────────────
        logger.info("[%s] Stage 1 — requirements", project_id)
        reqs = extract_requirements(body.prompt, project_id=project_id)
        design_state["requirements"] = reqs.model_dump()
        design_state["stages_done"].append("requirements")
        design_state["stage"] = "architecture"
        _write_design_state(project_id, design_state)

        time.sleep(1.5)  # respect Gemini RPM limit

        # ── Stage 2: Architecture ─────────────────────────────────────────────
        logger.info("[%s] Stage 2 — architecture", project_id)
        arch = generate_architecture(reqs)
        design_state["architecture"] = arch.model_dump()
        design_state["stages_done"].append("architecture")
        design_state["stage"] = "components"
        _write_design_state(project_id, design_state)

        time.sleep(1.5)  # respect Gemini RPM limit

        # ── Stage 3: Components ───────────────────────────────────────────────
        logger.info("[%s] Stage 3 — components", project_id)
        comps = select_components(ComponentsInput(architecture=arch, requirements=reqs))
        design_state["components"] = comps.model_dump()
        design_state["bom_total"] = comps.bom_total
        design_state["stages_done"].append("components")
        design_state["stage"] = "schematic"
        _write_design_state(project_id, design_state)

        # ── Stage 4: Schematic / Netlist ──────────────────────────────────────
        logger.info("[%s] Stage 4 — schematic", project_id)
        netlist = generate_schematic(SchematicInput(components=comps, architecture=arch))
        design_state["netlist"] = netlist.model_dump()
        design_state["nets"] = [n.model_dump() for n in netlist.nets]
        design_state["parts"] = netlist.parts
        design_state["stages_done"].append("schematic")
        design_state["stage"] = "pcb"
        _write_design_state(project_id, design_state)

        # ── Stage 5: PCB ──────────────────────────────────────────────────────
        logger.info("[%s] Stage 5 — pcb", project_id)
        board_c = reqs.board_constraints
        pcb = generate_pcb(PcbInput(
            netlist_path=netlist.netlist_path,
            board_constraints=board_c,
            project_id=project_id,
        ))
        design_state["pcb"] = pcb.model_dump()
        design_state["board"] = pcb.board
        design_state["stages_done"].append("pcb")
        design_state["stage"] = "placement"
        _write_design_state(project_id, design_state)

        # ── Stage 6: Place & Route ────────────────────────────────────────────
        logger.info("[%s] Stage 6 — place-and-route", project_id)
        routed = place_and_route(PlaceRouteInput(
            pcb_path=pcb.pcb_path,
            board_constraints=board_c,
            project_id=project_id,
        ))
        design_state["routed_pcb"] = routed.model_dump()
        design_state["stages_done"].append("placement")
        design_state["stage"] = "verification"
        _write_design_state(project_id, design_state)

        # ── Stage 7: Verification ─────────────────────────────────────────────
        logger.info("[%s] Stage 7 — verify", project_id)
        verification = verify(VerifyInput(
            pcb_path=routed.pcb_path,
            netlist_path=netlist.netlist_path,
            project_id=project_id,
        ))
        design_state["verification"] = verification.model_dump()
        design_state["checks"] = [c.model_dump() for c in verification.checks]
        design_state["confidence"] = verification.confidence
        design_state["drc_note"] = verification.drc_note
        design_state["stages_done"].append("verification")
        design_state["stage"] = "export"
        _write_design_state(project_id, design_state)

        # ── Stage 8: Export ───────────────────────────────────────────────────
        logger.info("[%s] Stage 8 — export", project_id)
        export = export_design(ExportInput(
            pcb_path=routed.pcb_path,
            netlist_path=netlist.netlist_path,
            components=comps,
            verification=verification,
            project_id=project_id,
        ))
        design_state["export"] = export.model_dump()
        design_state["stages_done"].append("export")
        design_state["stage"] = "done"
        _write_design_state(project_id, design_state)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[%s] Pipeline failed", project_id)
        design_state["last_error"] = str(exc)
        _set_project_status(project_id, GenerationStatus.failed, {
            "design_state": design_state,
        })
        raise HTTPException(
            status_code=500,
            detail={"error": "pipeline_failed", "stage": design_state.get("stage"), "message": str(exc)},
        )

    # ── Success: finalise project row ─────────────────────────────────────────
    _set_project_status(project_id, GenerationStatus.done, {
        "design_state": design_state,
        "name": f"{reqs.microcontroller} Design",
    })

    # Snapshot to project_versions
    rows = db.select("projects", {"id": project_id})
    current_version = 1
    if rows:
        versions = db.select("project_versions", {"project_id": project_id}, limit=100)
        if versions:
            current_version = max(v.get("version_num", 0) for v in versions) + 1
    db.insert("project_versions", {
        "project_id": project_id,
        "version_num": current_version,
        "design_state": design_state,
    })

    # Increment generations_this_month
    if resolved_user:
        rows = db.select("profiles", {"id": resolved_user})
        if rows:
            count = rows[0].get("generations_this_month", 0)
            db.update("profiles", {"id": resolved_user}, {
                "generations_this_month": count + 1,
            })
        else:
            # Create profile on first generation (e.g. OAuth sign-up)
            db.insert("profiles", {
                "id": resolved_user,
                "generations_this_month": 1,
                "month_reset_at": _now_iso(),
            })

    logger.info(
        "[%s] Generation complete — confidence %d%%, %d stages done",
        project_id, design_state.get("confidence", 0), len(design_state["stages_done"]),
    )

    return ProjectRow(
        id=project_id,
        user_id=resolved_user,
        name=f"{reqs.microcontroller} Design",
        status=GenerationStatus.done,
        design_state=design_state,
        prompt=body.prompt,
        updated_at=datetime.now(timezone.utc),
    )


# ── Convenience: create a new project and immediately generate ────────────────

@router.post("/projects", response_model=ProjectRow, status_code=201)
def create_and_generate(
    body: GenerateProjectInput,
    user_id: Optional[str] = Query(None),
):
    """
    Create a new project (auto-generates a UUID) and run the full pipeline.
    Shortcut for clients that don't have a pre-created project row.
    """
    project_id = str(uuid.uuid4())
    resolved_user = _resolve_user_id(user_id or body.user_id)

    # Insert stub row so downstream Supabase writes have a foreign key target
    db.insert("projects", {
        "id": project_id,
        "user_id": resolved_user,
        "name": "Generating…",
        "status": GenerationStatus.pending.value,
        "prompt": body.prompt,
        "design_state": {},
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    })

    # Delegate to the main orchestration handler
    # (re-use the same function, pass the new project_id via path param emulation)
    return generate_project(project_id, body, user_id=user_id)


# ── GET project status ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}", response_model=ProjectRow)
def get_project(project_id: str):
    """Fetch current project row (status + design_state)."""
    rows = db.select("projects", {"id": project_id})
    if not rows:
        raise HTTPException(404, detail="Project not found")
    row = rows[0]
    return ProjectRow(
        id=row["id"],
        user_id=row.get("user_id"),
        name=row.get("name", ""),
        status=GenerationStatus(row.get("status", "pending")),
        design_state=row.get("design_state") or {},
        thumbnail_url=row.get("thumbnail_url"),
        share_token=row.get("share_token"),
        prompt=row.get("prompt"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )
