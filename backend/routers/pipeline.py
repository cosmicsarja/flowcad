"""
routers/pipeline.py
────────────────────
Legacy / convenience full-pipeline endpoint.
Per-stage endpoints are handled by their respective router modules:
  - routers/requirements.py
  - routers/architecture.py
  - routers/components.py
  - routers/schematic.py
  - routers/pcb.py
  - routers/placement.py
  - routers/verification.py
  - routers/export.py
  - routers/edit.py
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from models import (
    FullPipelineInput, FullPipelineOutput,
    ComponentsInput, SchematicInput, PcbInput, PlaceRouteInput, VerifyInput, ExportInput,
)
from services.requirement_extractor import extract_requirements
from services.architecture_generator import generate_architecture
from services.component_selector import select_components
from services.schematic_generator import generate_schematic
from services.pcb_generator import generate_pcb
from services.placer_router import place_and_route
from services.verifier import verify
from services.exporter import export_design

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pipeline"])


@router.post("/run-pipeline", response_model=FullPipelineOutput)
def endpoint_run_pipeline(body: FullPipelineInput):
    """
    Run all pipeline stages 1–8 in sequence and return the complete result.
    Useful for CLI scripts and local automated testing.
    """
    try:
        reqs = extract_requirements(body.prompt)
        arch = generate_architecture(reqs)
        comps = select_components(ComponentsInput(architecture=arch, requirements=reqs))
        netlist = generate_schematic(SchematicInput(components=comps, architecture=arch))
        pcb = generate_pcb(PcbInput(netlist_path=netlist.netlist_path, board_constraints=reqs.board_constraints))
        routed = place_and_route(PlaceRouteInput(pcb_path=pcb.pcb_path, board_constraints=reqs.board_constraints))
        verification = verify(VerifyInput(pcb_path=routed.pcb_path, netlist_path=netlist.netlist_path))
        export = export_design(ExportInput(pcb_path=routed.pcb_path, netlist_path=netlist.netlist_path, components=comps, verification=verification))

        return FullPipelineOutput(
            project_id=reqs.project_id or "local",
            requirements=reqs,
            architecture=arch,
            components=comps,
            netlist=netlist,
            pcb=pcb,
            routed_pcb=routed,
            verification=verification,
            export=export,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Full pipeline execution failed")
        raise HTTPException(status_code=500, detail=str(e))
