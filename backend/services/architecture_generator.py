"""
services/architecture_generator.py
────────────────────────────────────
Stage 2: POST /generate-architecture
  Input : RequirementsOutput
  Output: ArchitectureOutput  (nodes + edges block diagram)
"""
from __future__ import annotations

import logging
import json
from typing import Any

from schemas.requirements import (
    RequirementsOutput,
    ArchitectureOutput,
    ArchitectureNode,
    ArchitectureEdge,
)
from services.llm_client import call_llm
from services import supabase_client as db

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an expert electronics system architect.
Given hardware requirements, produce a block-diagram graph with nodes and edges.
Return ONLY a valid JSON object — no prose, no markdown, no explanation.

Schema:
{
  "nodes": [
    {
      "id": "<short_id, e.g. usb, reg, mcu, dht22, relay>",
      "label": "<human label, e.g. USB-C 5V IN>",
      "sub": "<ref · value, e.g. J1 · 5V/2A>",
      "kind": "<one of: power | mcu | sensor | actuator | io | passive>",
      "x": <integer, layout x>,
      "y": <integer, layout y>,
      "w": <integer, box width, e.g. 150>,
      "h": <integer, box height, e.g. 62>
    }
  ],
  "edges": [
    {
      "from": "<node id>",
      "to": "<node id>",
      "net": "<net name, e.g. +5V, +3V3, GPIO4, I2C, ADC1_CH0>"
    }
  ]
}

Layout rules:
- Power nodes: x=24, y=180–300, w=150, h=62
- Regulator node: x=214, y=200, w=150, h=62
- MCU node: x=424, y=180, w=190, h=90
- Sensors/actuators/io: x=674, y=60–400, w=170, h=62
- All x/y/w/h are integer SVG units

Electrical rules:
- Always include: power input node, voltage regulator node (if 3.3V required), MCU node
- Power flows: USB → regulator → MCU
- Sensors/actuators connect FROM the MCU with the correct GPIO/bus net name
- Use net names like: +5V, +3V3, GND, GPIO<n>, ADC1_CH<n>, I2C, SPI, UART, PWM<n>
"""


def _layout_nodes(nodes: list[dict]) -> list[dict]:
    """Apply deterministic layout positions if the LLM didn't set them."""
    x_map = {"power": 24, "mcu": 424, "sensor": 674, "actuator": 674, "io": 674, "passive": 674}
    y_base = {"power": 180, "mcu": 180, "sensor": 60, "actuator": 60, "io": 60, "passive": 60}
    counters: dict[str, int] = {}

    for node in nodes:
        kind = node.get("kind", "io")
        i = counters.get(kind, 0)
        counters[kind] = i + 1
        if not node.get("x"):
            node["x"] = x_map.get(kind, 674)
        if not node.get("y"):
            node["y"] = y_base.get(kind, 60) + i * 90
        if not node.get("w"):
            node["w"] = 190 if kind == "mcu" else 150 if kind == "power" else 170
        if not node.get("h"):
            node["h"] = 90 if kind == "mcu" else 62
    return nodes


def generate_architecture(requirements: RequirementsOutput) -> ArchitectureOutput:
    """Generate block diagram from requirements using LLM."""
    logger.info("Generating architecture for: %s", requirements.microcontroller)

    user_prompt = f"""Requirements:
- Microcontroller: {requirements.microcontroller}
- Sensors: {', '.join(requirements.sensors) or 'none'}
- Actuators: {', '.join(requirements.actuators) or 'none'}
- Interfaces: {', '.join(requirements.interfaces) or 'none'}
- Power input: {requirements.power_constraints.input_voltage}
- Output voltage: {requirements.power_constraints.output_voltage}
- Board: {requirements.board_constraints.max_width_mm}×{requirements.board_constraints.max_height_mm}mm, {requirements.board_constraints.layers}-layer
- Requirements:
{chr(10).join(f'  - {r}' for r in requirements.requirements)}

Generate the block diagram JSON."""

    raw: dict[str, Any] = call_llm(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=2048,
    )

    # Normalise and validate nodes
    raw_nodes = _layout_nodes(raw.get("nodes", []))
    nodes = [ArchitectureNode(**n) for n in raw_nodes]

    # Normalise edges (handle both "from" and "from_" key)
    edges = []
    for e in raw.get("edges", []):
        if "from" in e and "from_" not in e:
            e["from_"] = e.pop("from")
        edges.append(ArchitectureEdge(**e))

    result = ArchitectureOutput(nodes=nodes, edges=edges, project_id=requirements.project_id)

    # Persist
    db.insert("architectures", {
        "project_id": requirements.project_id,
        "nodes": json.dumps([n.model_dump() for n in nodes]),
        "edges": json.dumps([e.model_dump(by_alias=True) for e in edges]),
    })

    logger.info(
        "Architecture: %d nodes, %d edges", len(nodes), len(edges)
    )
    return result
