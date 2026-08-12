"""
schemas/__init__.py
────────────────────
Backward-compatibility shim.
All models have moved to models/pipeline.py.
Existing `from schemas import ...` statements continue to work unchanged.
"""
from models.pipeline import (
    PowerConstraints, BoardConstraints,
    RequirementsInput, RequirementsOutput,
    BlockKind, ArchitectureNode, ArchitectureEdge, ArchitectureOutput,
    ComponentSelection, ComponentsInput, ComponentsOutput,
    NetEntry, SchematicInput, SchematicOutput,
    PcbInput, PcbOutput,
    PlaceRouteInput, PlaceRouteOutput,
    StatusLiteral, VerificationCheck, VerifyInput, VerificationOutput,
    ExportArtifact, ExportInput, ExportOutput,
    ApplyEditInput, ApplyEditOutput,
    FullPipelineInput, FullPipelineOutput,
    GenerationStatus, ProjectRow, GenerateProjectInput,
)

__all__ = [
    "PowerConstraints", "BoardConstraints",
    "RequirementsInput", "RequirementsOutput",
    "BlockKind", "ArchitectureNode", "ArchitectureEdge", "ArchitectureOutput",
    "ComponentSelection", "ComponentsInput", "ComponentsOutput",
    "NetEntry", "SchematicInput", "SchematicOutput",
    "PcbInput", "PcbOutput",
    "PlaceRouteInput", "PlaceRouteOutput",
    "StatusLiteral", "VerificationCheck", "VerifyInput", "VerificationOutput",
    "ExportArtifact", "ExportInput", "ExportOutput",
    "ApplyEditInput", "ApplyEditOutput",
    "FullPipelineInput", "FullPipelineOutput",
    "GenerationStatus", "ProjectRow", "GenerateProjectInput",
]
