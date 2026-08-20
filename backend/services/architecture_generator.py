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
      "id": "<short_id, e.g. usb, reg, mcu, dht22, relay, ac_in, rectifier>",
      "label": "<human label, e.g. USB-C 5V IN, AC Mains Input, Bridge Rectifier>",
      "sub": "<ref · value, e.g. J1 · 5V/2A, BR1 · 2A 400V>",
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
      "net": "<net name, e.g. +5V, +3V3, GPIO4, I2C, ADC1_CH0, AC_L, DC_BUS>"
    }
  ]
}

Layout rules:
- Power/input nodes: x=24, y=180–300, w=150, h=62
- Regulator/converter node: x=214, y=200, w=150, h=62
- MCU node: x=424, y=180, w=190, h=90
- Sensors/actuators/io: x=674, y=60–400, w=170, h=62
- Passive components (caps, inductors, bridges): x=424, y=320, w=150, h=62
- All x/y/w/h are integer SVG units

Electrical rules:
- IMPORTANT: If there is NO microcontroller in the design (e.g. pure power supply, AC-DC converter), do NOT include an MCU node — use power, passive, and actuator nodes only
- For AC-DC converters: include AC input node → bridge rectifier → filter capacitor → regulator → DC output
- For MCU designs: power input → regulator → MCU → sensors/actuators
- Power flows from input to output via regulators/converters
- Use net names like: AC_L, AC_N, DC_BUS, +5V, +3V3, GND, GPIO<n>, I2C, SPI, UART
- kind must be exactly one of: power, mcu, sensor, actuator, io, passive
"""

# Valid node kinds + aliases for LLM variants
_VALID_KINDS = {"power", "mcu", "sensor", "actuator", "io", "passive"}
_KIND_ALIASES: dict[str, str] = {
    "regulator": "power", "converter": "power", "supply": "power",
    "ldo": "power", "psu": "power", "voltage_regulator": "power",
    "microcontroller": "mcu", "processor": "mcu", "controller": "mcu",
    "cpu": "mcu", "soc": "mcu",
    "display": "io", "interface": "io", "peripheral": "io",
    "output": "actuator", "input": "sensor",
    "filter": "passive", "capacitor": "passive", "resistor": "passive",
    "inductor": "passive", "transformer": "passive", "diode": "passive",
    "bridge": "passive", "rectifier": "passive",
}


def _normalise_kind(kind: str) -> str:
    """Map LLM kind variants to valid enum values."""
    k = kind.lower().strip()
    if k in _VALID_KINDS:
        return k
    return _KIND_ALIASES.get(k, "passive")


def _layout_nodes(nodes: list[dict]) -> list[dict]:
    """Apply deterministic layout positions if the LLM didn't set them."""
    x_map = {"power": 24, "mcu": 424, "sensor": 674, "actuator": 674, "io": 674, "passive": 424}
    y_base = {"power": 180, "mcu": 180, "sensor": 60, "actuator": 60, "io": 60, "passive": 320}
    counters: dict[str, int] = {}

    for node in nodes:
        kind = node.get("kind", "io")
        i = counters.get(kind, 0)
        counters[kind] = i + 1
        # Use `is None` — x=0 or y=0 are valid SVG coordinates and must not be overwritten
        if node.get("x") is None:
            node["x"] = x_map.get(kind, 674)
        if node.get("y") is None:
            node["y"] = y_base.get(kind, 60) + i * 90
        if not node.get("w"):
            node["w"] = 190 if kind == "mcu" else 150 if kind == "power" else 170
        if not node.get("h"):
            node["h"] = 90 if kind == "mcu" else 62
    return nodes


def _synthesize_from_requirements(requirements: RequirementsOutput) -> tuple[list[ArchitectureNode], list[ArchitectureEdge]]:
    """
    Build a minimal architecture from RequirementsOutput when the LLM fails.
    Handles both MCU-based and pure-analog (no-MCU) designs.
    """
    nodes: list[ArchitectureNode] = []
    edges: list[ArchitectureEdge] = []

    inp_v = requirements.power_constraints.input_voltage or "5V"
    out_v = requirements.power_constraints.output_voltage or "3.3V"
    is_ac = any(x in inp_v.lower() for x in ("ac", "220", "110", "mains", "230", "115"))

    # Power input node
    nodes.append(ArchitectureNode(
        id="pwr_in", label=f"{inp_v} Input", sub=f"J1 · {inp_v}",
        kind="power", x=24, y=180, w=150, h=62,
    ))

    if is_ac:
        # AC-DC path
        nodes.append(ArchitectureNode(
            id="rectifier", label="Bridge Rectifier", sub="BR1 · 2A 400V",
            kind="passive", x=214, y=180, w=150, h=62,
        ))
        edges.append(ArchitectureEdge(from_="pwr_in", to="rectifier", net="AC_L"))

        nodes.append(ArchitectureNode(
            id="filter_cap", label="Filter Capacitor", sub="C1 · 470µF 25V",
            kind="passive", x=214, y=280, w=150, h=62,
        ))
        edges.append(ArchitectureEdge(from_="rectifier", to="filter_cap", net="DC_BUS"))

        nodes.append(ArchitectureNode(
            id="reg", label="Voltage Regulator", sub=f"U1 · {out_v}",
            kind="power", x=404, y=200, w=150, h=62,
        ))
        edges.append(ArchitectureEdge(from_="filter_cap", to="reg", net="DC_UNREG"))

        nodes.append(ArchitectureNode(
            id="dc_out", label=f"{out_v} DC Output", sub=f"J2 · {out_v}",
            kind="io", x=594, y=200, w=150, h=62,
        ))
        out_net = out_v.replace(" ", "").replace(".", "_")
        if not out_net.startswith("+"):
            out_net = "+" + out_net
        edges.append(ArchitectureEdge(from_="reg", to="dc_out", net=out_net))
    else:
        # MCU-based / simple DC design
        nodes.append(ArchitectureNode(
            id="reg", label="Voltage Regulator", sub=f"U1 · {out_v}",
            kind="power", x=214, y=200, w=150, h=62,
        ))
        edges.append(ArchitectureEdge(from_="pwr_in", to="reg", net="+5V"))

        mcu_str = requirements.microcontroller
        if mcu_str:
            nodes.append(ArchitectureNode(
                id="mcu", label=mcu_str, sub="U2 · MCU",
                kind="mcu", x=424, y=180, w=190, h=90,
            ))
            edges.append(ArchitectureEdge(from_="reg", to="mcu", net="+3V3"))

            right_y = 60
            for i, sensor in enumerate(requirements.sensors[:4]):
                sid = f"sensor_{i}"
                nodes.append(ArchitectureNode(
                    id=sid, label=sensor.title(), sub=f"U{i+3} · Sensor",
                    kind="sensor", x=674, y=right_y, w=170, h=62,
                ))
                edges.append(ArchitectureEdge(from_="mcu", to=sid, net=f"GPIO{i+4}"))
                right_y += 80

            for i, actuator in enumerate(requirements.actuators[:3]):
                aid = f"actuator_{i}"
                nodes.append(ArchitectureNode(
                    id=aid, label=actuator.title(), sub=f"K{i+1} · Actuator",
                    kind="actuator", x=674, y=right_y, w=170, h=62,
                ))
                edges.append(ArchitectureEdge(from_="mcu", to=aid, net=f"GPIO{i+8}"))
                right_y += 80

    logger.info("Synthesized fallback architecture: %d nodes, %d edges", len(nodes), len(edges))
    return nodes, edges


def generate_architecture(requirements: RequirementsOutput) -> ArchitectureOutput:
    """Generate block diagram from requirements using LLM."""
    logger.info("Generating architecture for: %s", requirements.microcontroller or "(no MCU — analog/power design)")

    user_prompt = f"""Requirements:
- Microcontroller: {requirements.microcontroller or 'none (pure analog/power design)'}
- Sensors: {', '.join(requirements.sensors) or 'none'}
- Actuators: {', '.join(requirements.actuators) or 'none'}
- Interfaces: {', '.join(requirements.interfaces) or 'none'}
- Power input: {requirements.power_constraints.input_voltage}
- Output voltage: {requirements.power_constraints.output_voltage}
- Board: {requirements.board_constraints.max_width_mm}×{requirements.board_constraints.max_height_mm}mm, {requirements.board_constraints.layers}-layer
- Requirements:
{chr(10).join(f'  - {r}' for r in requirements.requirements)}

Generate the block diagram JSON."""

    nodes: list[ArchitectureNode] = []
    edges: list[ArchitectureEdge] = []

    try:
        raw: dict[str, Any] = call_llm(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=2048,
        )

        # Apply layout defaults then validate per-node with try/except
        raw_nodes = _layout_nodes(raw.get("nodes", []))
        for n in raw_nodes:
            try:
                if "kind" in n:
                    n["kind"] = _normalise_kind(n["kind"])
                nodes.append(ArchitectureNode(**n))
            except Exception as node_exc:
                logger.warning("Skipping malformed arch node %s: %s", n.get("id", "?"), node_exc)

        # Normalise edges — handle both "from" and "from_" key
        for e in raw.get("edges", []):
            try:
                if "from" in e and "from_" not in e:
                    e["from_"] = e.pop("from")
                edges.append(ArchitectureEdge(**e))
            except Exception as edge_exc:
                logger.warning("Skipping malformed arch edge %s: %s", e, edge_exc)

    except Exception as llm_exc:
        logger.warning("Architecture LLM call failed (%s) — using synthesized fallback", llm_exc)

    # If LLM produced no usable nodes, synthesize from requirements
    if not nodes:
        logger.warning("Architecture LLM returned 0 valid nodes — synthesizing from requirements")
        nodes, edges = _synthesize_from_requirements(requirements)

    result = ArchitectureOutput(nodes=nodes, edges=edges, project_id=requirements.project_id)

    # Persist
    db.insert("architectures", {
        "project_id": requirements.project_id,
        "nodes": json.dumps([n.model_dump() for n in nodes]),
        "edges": json.dumps([e.model_dump(by_alias=True) for e in edges]),
    })

    logger.info("Architecture: %d nodes, %d edges", len(nodes), len(edges))
    return result
