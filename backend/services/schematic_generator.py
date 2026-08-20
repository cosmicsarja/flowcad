"""
services/schematic_generator.py
─────────────────────────────────
Stage 4: POST /generate-schematic
  Input : SchematicInput (components + architecture)
  Output: SchematicOutput (netlist file path + JSON net list)

Generates a KiCad-compatible netlist using SKiDL when available,
with a robust hand-crafted XML fallback for environments without
KiCad libraries installed.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from schemas.requirements import (
    SchematicInput,
    SchematicOutput,
    NetEntry,
    ComponentSelection,
    ArchitectureEdge,
)
from services import supabase_client as db

logger = logging.getLogger(__name__)

WORK_DIR = Path(os.environ.get("WORK_DIR", "./tmp"))


def generate_schematic(inp: SchematicInput) -> SchematicOutput:
    """
    Attempt SKiDL netlist generation, fall back to hand-crafted KiCad netlist XML.
    """
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    project_id = inp.components.project_id or str(uuid.uuid4())
    out_dir = WORK_DIR / project_id
    out_dir.mkdir(parents=True, exist_ok=True)
    netlist_path = str(out_dir / "schematic.net")

    comps = inp.components.components
    edges = inp.architecture.edges

    try:
        _generate_with_skidl(comps, edges, netlist_path)
        logger.info("SKiDL netlist generated: %s", netlist_path)
    except Exception as exc:
        logger.warning("SKiDL failed (%s) — using fallback netlist generator", exc)
        _generate_fallback_netlist(comps, edges, netlist_path)
        logger.info("Fallback netlist generated: %s", netlist_path)

    # Build JSON net list for frontend
    net_entries = _build_net_entries(comps, edges)
    parts_json = _build_parts_json(comps)

    result = SchematicOutput(
        netlist_path=netlist_path,
        nets=net_entries,
        parts=parts_json,
        net_count=len(net_entries),
        part_count=len(comps),
        project_id=project_id,
    )

    # Persist nets
    for net in net_entries:
        db.insert("nets", {
            "project_id": project_id,
            "from_ref": net.from_ref,
            "to_ref": net.to_ref,
            "net_name": net.net,
        })

    return result


# ── SKiDL path ──────────────────────────────────────────────────────────────

def _generate_with_skidl(
    comps: list[ComponentSelection],
    edges: list[ArchitectureEdge],
    output_path: str,
) -> None:
    """Use SKiDL to build the netlist programmatically."""
    import skidl  # type: ignore  # noqa: F401

    skidl.reset()
    skidl.lib_search_paths[skidl.KICAD].append(
        os.environ.get("KICAD_SYMBOL_LIBS", "/usr/share/kicad/library")
    )

    # Map ref → SKiDL Part (simplified: use generic 2-pin part for passives)
    ref_to_part: dict[str, Any] = {}
    nets: dict[str, Any] = {}

    def get_net(name: str):
        if name not in nets:
            nets[name] = skidl.Net(name)
        return nets[name]

    # Create power nets
    vcc = get_net("+3V3")
    gnd = get_net("GND")
    v5 = get_net("+5V")

    for comp in comps:
        try:
            # Try to instantiate from KiCad library
            part = skidl.Part(
                comp.library or "Device",
                comp.name,
                footprint=comp.footprint,
                dest=skidl.NETLIST,
            )
            part.ref = comp.ref
            part.value = comp.name
            ref_to_part[comp.ref] = part
        except Exception:
            # Generic 2-pin part fallback
            part = skidl.Part(
                "Device",
                "R",
                footprint=comp.footprint,
                dest=skidl.NETLIST,
            )
            part.ref = comp.ref
            part.value = comp.name
            ref_to_part[comp.ref] = part

    # Connect nets from edges
    for edge in edges:
        net_obj = get_net(edge.net)
        # Find parts by node_id matching
        for comp in comps:
            if comp.node_id == edge.from_ or comp.ref == edge.from_:
                part = ref_to_part.get(comp.ref)
                if part and len(part.pins) >= 1:
                    net_obj += part.pins[0]
            if comp.node_id == edge.to or comp.ref == edge.to:
                part = ref_to_part.get(comp.ref)
                if part and len(part.pins) >= 2:
                    net_obj += part.pins[1]

    skidl.generate_netlist(file_=output_path)


# ── Fallback hand-crafted KiCad netlist ─────────────────────────────────────

def _generate_fallback_netlist(
    comps: list[ComponentSelection],
    edges: list[ArchitectureEdge],
    output_path: str,
) -> None:
    """
    Generate a valid KiCad netlist XML without needing KiCad libraries.
    Format: KiCad legacy netlist v0.6 compatible with pcbnew.
    When edges is empty, derives connectivity from component ref prefixes.
    """
    # Build net → pins mapping from edges
    net_pins: dict[str, list[tuple[str, str]]] = {}
    pin_counter: dict[str, int] = {}

    def next_pin(ref: str) -> str:
        i = pin_counter.get(ref, 1)
        pin_counter[ref] = i + 1
        return str(i)

    for edge in edges:
        net = edge.net
        if net not in net_pins:
            net_pins[net] = []
        src_ref = _find_ref(edge.from_, comps)
        dst_ref = _find_ref(edge.to, comps)
        if src_ref:
            net_pins[net].append((src_ref, next_pin(src_ref)))
        if dst_ref:
            net_pins[net].append((dst_ref, next_pin(dst_ref)))

    # When edges is empty, derive basic power connectivity from ref prefixes
    if not edges:
        logger.info("No edges — synthesizing power nets from component ref prefixes")
        # Identify power sources (regulators, connectors) and loads (ICs, sensors)
        power_refs = [c.ref for c in comps if c.ref.upper().startswith(("U", "J", "P")) and
                      any(k in c.name.lower() for k in ("regulator", "ldo", "ams", "connector", "usb", "terminal", "power"))]
        active_refs = [c.ref for c in comps if c.ref.upper().startswith(("U", "Q", "IC"))]
        passive_refs = [c.ref for c in comps if c.ref.upper().startswith(("R", "C", "L", "D"))]
        connector_refs = [c.ref for c in comps if c.ref.upper().startswith(("J", "P", "CON"))]

        # GND net: connect all components pin 2 (usually GND)
        if "GND" not in net_pins:
            net_pins["GND"] = []
        for comp in comps:
            net_pins["GND"].append((comp.ref, next_pin(comp.ref)))

        # +3V3 net: connect power source to active components
        if "+3V3" not in net_pins:
            net_pins["+3V3"] = []
        for ref in (power_refs or [comps[0].ref] if comps else []):
            net_pins["+3V3"].append((ref, next_pin(ref)))
        for ref in active_refs:
            if ref not in (power_refs or []):
                net_pins["+3V3"].append((ref, next_pin(ref)))

        # +5V net: connect connectors
        if "+5V" not in net_pins:
            net_pins["+5V"] = []
        for ref in connector_refs:
            net_pins["+5V"].append((ref, next_pin(ref)))

        # Signal nets: chain passives to active components
        for i, ref in enumerate(passive_refs):
            net_name = f"SIG_{i+1}"
            net_pins[net_name] = []
            net_pins[net_name].append((ref, next_pin(ref)))
            if active_refs:
                net_pins[net_name].append((active_refs[i % len(active_refs)], next_pin(active_refs[i % len(active_refs)])))

    # Always ensure power nets exist
    for net_name in ["+3V3", "GND", "+5V"]:
        if net_name not in net_pins:
            net_pins[net_name] = []

    lines = ['(export (version "E") (design (source "flowcad") (date "2024")) (components']

    for comp in comps:
        fp = comp.footprint or ""
        lines.append(
            f'  (comp (ref "{comp.ref}") (value "{comp.name}") '
            f'(footprint "{fp}") (description "{comp.description}"))'
        )

    lines.append(") (nets")

    for net_name, pins in net_pins.items():
        net_code = hash(net_name) % 1000 + 1
        lines.append(f'  (net (code "{net_code}") (name "{net_name}")')
        for ref, pin in pins:
            lines.append(f'    (node (ref "{ref}") (pin "{pin}"))')
        lines.append("  )")

    lines.append(")")
    lines.append(")")

    Path(output_path).write_text("\n".join(lines))


def _find_ref(node_id: str, comps: list[ComponentSelection]) -> str | None:
    """Find component ref by node_id or ref."""
    for c in comps:
        if c.node_id == node_id or c.ref == node_id:
            return c.ref
    # Fuzzy: first component whose name contains node_id keyword
    for c in comps:
        if node_id.lower() in c.name.lower():
            return c.ref
    return None


def _build_net_entries(
    comps: list[ComponentSelection],
    edges: list[ArchitectureEdge],
) -> list[NetEntry]:
    seen = set()
    nets = []
    for edge in edges:
        key = (edge.from_, edge.to, edge.net)
        if key not in seen:
            seen.add(key)
            src = _find_ref(edge.from_, comps) or edge.from_
            dst = _find_ref(edge.to, comps) or edge.to
            nets.append(NetEntry(from_ref=src, to_ref=dst, net=edge.net))

    # When edges is empty, synthesize basic power nets from component ref prefixes
    if not edges and comps:
        # Find power source component (regulator, connector, or first U* ref)
        power_comp = next(
            (c for c in comps if any(k in c.name.lower() for k in ("regulator", "ldo", "ams", "supply"))),
            next((c for c in comps if c.ref.upper().startswith("U")), comps[0]),
        )
        # Connect power source to all other active components
        for c in comps:
            if c.ref == power_comp.ref:
                continue
            if c.ref.upper().startswith(("U", "Q", "J", "P")):
                key = (power_comp.ref, c.ref, "+3V3")
                if key not in seen:
                    seen.add(key)
                    nets.append(NetEntry(from_ref=power_comp.ref, to_ref=c.ref, net="+3V3"))
            # All components connect to GND
            key_gnd = (c.ref, "GND", "GND")
            if key_gnd not in seen:
                seen.add(key_gnd)
                nets.append(NetEntry(from_ref=c.ref, to_ref="GND", net="GND"))

    return nets


def _build_parts_json(comps: list[ComponentSelection]) -> list[dict]:
    """Convert ComponentSelection list to frontend-compatible Part dict."""
    # Symbol size map for frontend rendering
    SYM_SIZES = {
        "mcu": {"sw": 130, "sh": 180, "pw": 90, "ph": 70},
        "power": {"sw": 60, "sh": 70, "pw": 40, "ph": 50},
        "sensor": {"sw": 80, "sh": 100, "pw": 50, "ph": 60},
        "actuator": {"sw": 80, "sh": 100, "pw": 55, "ph": 65},
        "connector": {"sw": 50, "sh": 60, "pw": 35, "ph": 45},
        "passive": {"sw": 40, "sh": 50, "pw": 25, "ph": 30},
        "transistor": {"sw": 40, "sh": 60, "pw": 25, "ph": 35},
        "driver": {"sw": 80, "sh": 100, "pw": 50, "ph": 60},
        "display": {"sw": 90, "sh": 110, "pw": 60, "ph": 70},
        "protection": {"sw": 40, "sh": 50, "pw": 25, "ph": 30},
    }

    def _sym(comp: ComponentSelection) -> str:
        n = comp.name.lower()
        if "esp32" in n or "arduino" in n or "ams" in n:
            return "module"
        if "led" in n:
            return "led"
        if "cap" in n or "capacitor" in n:
            return "cap"
        if "resist" in n:
            return "res"
        if "relay" in n:
            return "relay"
        if "transistor" in n or "mosfet" in n or "bjt" in n:
            return "transistor"
        if "connector" in n or "header" in n or "terminal" in n or "usb" in n:
            return "conn"
        if "sensor" in n or "dht" in n or "bme" in n or "hc-sr" in n:
            return "sensor"
        if "diode" in n or "schottky" in n:
            return "diode"
        return "ic"

    parts = []
    for comp in comps:
        # Guess category from name for sizing
        cat = "passive"
        n = comp.name.lower()
        if any(k in n for k in ["esp32", "arduino", "ams1117", "uln"]):
            cat = "mcu" if "esp32" in n or "arduino" in n else "driver"
        elif any(k in n for k in ["dht", "bme", "hc-sr", "soil"]):
            cat = "sensor"
        elif any(k in n for k in ["relay", "srd"]):
            cat = "actuator"
        elif any(k in n for k in ["usb", "header", "terminal", "connector"]):
            cat = "connector"
        elif any(k in n for k in ["transistor", "mosfet", "bjt"]):
            cat = "transistor"

        sz = SYM_SIZES.get(cat, SYM_SIZES["passive"])
        parts.append({
            "ref": comp.ref,
            "name": comp.name,
            "value": comp.package,
            "pkg": comp.package,
            "unit": comp.unit_cost,
            "qty": comp.qty,
            "sym": _sym(comp),
            "desc": comp.description,
            "reasoning": comp.justification,
            "specs": comp.specs,
            "datasheet": comp.datasheet_url,
            "sx": 0, "sy": 0,
            "sw": sz["sw"], "sh": sz["sh"],
            "px": 0, "py": 0,
            "pw": sz["pw"], "ph": sz["ph"],
            "z": 3 if cat in ("mcu", "driver") else 2 if cat == "actuator" else 1,
            "pins": 4,
            "side": "top",
        })
    return parts
