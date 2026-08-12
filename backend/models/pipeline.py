"""
models/pipeline.py
──────────────────
All Pydantic models for the FlowCAD pipeline.
Extends the original schemas with:
  - GenerationStatus enum
  - ProjectRow  (mirrors the frontend's `projects` Supabase table)
"""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Requirements
# ─────────────────────────────────────────────────────────────────────────────

class PowerConstraints(BaseModel):
    input_voltage: str = "5V USB"
    output_voltage: str = "3.3V"
    max_current_ma: int = 500
    battery_operated: bool = False


class BoardConstraints(BaseModel):
    max_width_mm: float = 100.0
    max_height_mm: float = 80.0
    layers: int = 2
    min_trace_mm: float = 0.2
    min_clearance_mm: float = 0.2


class RequirementsInput(BaseModel):
    prompt: str = Field(..., min_length=10, description="Natural language circuit description")


class RequirementsOutput(BaseModel):
    microcontroller: str
    sensors: list[str]
    actuators: list[str]
    interfaces: list[str]
    power_constraints: PowerConstraints
    board_constraints: BoardConstraints
    requirements: list[str] = Field(default_factory=list)
    raw_prompt: str = ""
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Architecture
# ─────────────────────────────────────────────────────────────────────────────

BlockKind = Literal["power", "mcu", "sensor", "actuator", "io"]


class ArchitectureNode(BaseModel):
    id: str
    label: str
    sub: str = ""
    kind: BlockKind
    x: int = 0
    y: int = 0
    w: int = 170
    h: int = 62


class ArchitectureEdge(BaseModel):
    from_: str = Field(..., alias="from")
    to: str
    net: str

    model_config = {"populate_by_name": True}


class ArchitectureOutput(BaseModel):
    nodes: list[ArchitectureNode]
    edges: list[ArchitectureEdge]
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Components
# ─────────────────────────────────────────────────────────────────────────────

class ComponentSelection(BaseModel):
    node_id: str
    ref: str
    name: str
    footprint: str
    package: str
    datasheet_url: str
    unit_cost: float
    qty: int = 1
    justification: str
    specs: list[list[str]] = Field(default_factory=list)
    description: str = ""


class ComponentsInput(BaseModel):
    architecture: ArchitectureOutput
    requirements: RequirementsOutput


class ComponentsOutput(BaseModel):
    components: list[ComponentSelection]
    bom_total: float
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4 — Schematic / Netlist
# ─────────────────────────────────────────────────────────────────────────────

class NetEntry(BaseModel):
    from_ref: str
    to_ref: str
    net: str


class SchematicInput(BaseModel):
    components: ComponentsOutput
    architecture: ArchitectureOutput


class SchematicOutput(BaseModel):
    netlist_path: str
    nets: list[NetEntry]
    parts: list[dict[str, Any]]
    net_count: int
    part_count: int
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5 — PCB generation
# ─────────────────────────────────────────────────────────────────────────────

class PcbInput(BaseModel):
    netlist_path: str
    board_constraints: BoardConstraints
    project_id: Optional[str] = None


class PcbOutput(BaseModel):
    pcb_path: str
    board: dict[str, float]
    footprint_count: int
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 6 — Place & Route
# ─────────────────────────────────────────────────────────────────────────────

class PlaceRouteInput(BaseModel):
    pcb_path: str
    board_constraints: BoardConstraints
    project_id: Optional[str] = None


class PlaceRouteOutput(BaseModel):
    pcb_path: str
    board: dict[str, float]
    placed_count: int
    routed_count: int
    unrouted_count: int
    status: str = "done"               # "done" | "partial"
    routed_percentage: float = 100.0   # e.g. 94.0
    unrouted_nets: list[str] = Field(default_factory=list)
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 7 — Verification
# ─────────────────────────────────────────────────────────────────────────────

StatusLiteral = Literal["PASS", "WARNING", "FAIL"]


class VerificationCheck(BaseModel):
    name: str
    status: StatusLiteral
    score: int = Field(..., ge=0, le=100)
    note: str


class VerifyInput(BaseModel):
    pcb_path: str
    netlist_path: Optional[str] = None
    project_id: Optional[str] = None


class VerificationOutput(BaseModel):
    electrical: VerificationCheck
    power: VerificationCheck
    connectivity: VerificationCheck
    erc: VerificationCheck
    drc: VerificationCheck
    manufacturing: VerificationCheck
    thermal: VerificationCheck
    checks: list[VerificationCheck]
    confidence: int
    drc_note: Optional[str] = None
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 8 — Export
# ─────────────────────────────────────────────────────────────────────────────

class ExportInput(BaseModel):
    pcb_path: str
    netlist_path: Optional[str] = None
    components: Optional[ComponentsOutput] = None
    verification: Optional[VerificationOutput] = None
    project_id: Optional[str] = None


class ExportArtifact(BaseModel):
    name: str
    file: str
    size: str
    fmt: str


class ExportOutput(BaseModel):
    zip_path: str
    artifacts: list[ExportArtifact]
    bom_csv: str
    report_md: str
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stage 9 — Apply Edit
# ─────────────────────────────────────────────────────────────────────────────

class ApplyEditInput(BaseModel):
    current_design_state: dict[str, Any]
    command: str


class ApplyEditOutput(BaseModel):
    updated_design_state: dict[str, Any]
    action_taken: str
    verification: Optional[VerificationOutput] = None


# ─────────────────────────────────────────────────────────────────────────────
# Full pipeline convenience types
# ─────────────────────────────────────────────────────────────────────────────

class FullPipelineInput(BaseModel):
    prompt: str


class FullPipelineOutput(BaseModel):
    project_id: str
    requirements: RequirementsOutput
    architecture: ArchitectureOutput
    components: ComponentsOutput
    netlist: SchematicOutput
    pcb: PcbOutput
    routed_pcb: PlaceRouteOutput
    verification: VerificationOutput
    export: ExportOutput


# ─────────────────────────────────────────────────────────────────────────────
# Project / Orchestration models (new — match Supabase projects table)
# ─────────────────────────────────────────────────────────────────────────────

class GenerationStatus(str, enum.Enum):
    pending    = "pending"
    generating = "generating"
    done       = "done"
    failed     = "failed"


class ProjectRow(BaseModel):
    """Mirrors the `projects` table row returned to the frontend."""
    id: str
    user_id: Optional[str] = None
    name: str
    status: GenerationStatus = GenerationStatus.pending
    design_state: dict[str, Any] = Field(default_factory=dict)
    thumbnail_url: Optional[str] = None
    share_token: Optional[str] = None
    prompt: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"use_enum_values": True}


class GenerateProjectInput(BaseModel):
    """Body for POST /projects/{id}/generate"""
    prompt: str = Field(..., min_length=10)
    user_id: Optional[str] = None   # override for dev/testing without auth
