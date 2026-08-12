"""models/__init__.py — convenience re-exports from models.pipeline"""
from .pipeline import (
    # Stage 1
    PowerConstraints, BoardConstraints,
    RequirementsInput, RequirementsOutput,
    # Stage 2
    BlockKind, ArchitectureNode, ArchitectureEdge, ArchitectureOutput,
    # Stage 3
    ComponentSelection, ComponentsInput, ComponentsOutput,
    # Stage 4
    NetEntry, SchematicInput, SchematicOutput,
    # Stage 5
    PcbInput, PcbOutput,
    # Stage 6
    PlaceRouteInput, PlaceRouteOutput,
    # Stage 7
    StatusLiteral, VerificationCheck, VerifyInput, VerificationOutput,
    # Stage 8
    ExportArtifact, ExportInput, ExportOutput,
    # Stage 9
    ApplyEditInput, ApplyEditOutput,
    # Full pipeline
    FullPipelineInput, FullPipelineOutput,
    # Orchestration
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
