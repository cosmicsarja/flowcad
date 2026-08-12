"""
services/component_selector.py
────────────────────────────────
Stage 3: POST /select-components
  Input : ComponentsInput (architecture + requirements)
  Output: ComponentsOutput (concrete component per node + BOM total)

Matches architecture nodes against the local curated component library.
Uses LLM for semantic matching; validates every result against the library.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from schemas.requirements import (
    ArchitectureOutput,
    RequirementsOutput,
    ComponentsInput,
    ComponentsOutput,
    ComponentSelection,
)
from services.llm_client import call_llm
from services import supabase_client as db

logger = logging.getLogger(__name__)

from services.kicad_library import get_library


SYSTEM_PROMPT = """\
You are a PCB component engineer. Given an architecture graph and a curated component library, \
select the best matching physical component for each architecture node.
Return ONLY a valid JSON object — no prose, no markdown, no explanation.

Schema:
{
  "selections": [
    {
      "node_id": "<node id from architecture>",
      "ref": "<designator, e.g. U1, R1, C1, D1, J1>",
      "library_id": "<id field from the provided library>",
      "qty": <integer, usually 1>,
      "justification": "<one sentence explaining selection>"
    }
  ]
}

Rules:
- ONLY select components that exist in the provided library (match by 'id' field).
- Assign standard EDA reference designators: U=IC/module, R=resistor, C=capacitor, \
  D=diode/LED, J=connector, K=relay, Q=transistor, SW=switch, L=inductor/ferrite.
- Include bypass/decoupling capacitors for every active IC (at least one 100nF per IC).
- Include a 330Ω current-limiting resistor for each LED.
- Include pull-up resistors (10kΩ) for 1-wire and I²C buses.
- For USB-C power input, include 5.1kΩ CC resistors.
- Always include the voltage regulator if 3.3V rail is needed.
"""


def select_components(inp: ComponentsInput) -> ComponentsOutput:
    arch = inp.architecture
    reqs = inp.requirements
    library_subset = []
    seen_ids = set()
    lib = get_library()

    for node in arch.nodes:
        # Provide more context to the search (e.g. "USB-C 5V IN")
        query = f"{node.label} {node.sub}"
        # We mapped node.kind directly to category
        candidates = lib.search_components(query, category=node.kind, limit=10)
        for c in candidates:
            if c["id"] not in seen_ids:
                seen_ids.add(c["id"])
                library_subset.append(c)
                
    # Also include some common passives so the LLM can add them (decoupling caps, resistors)
    for q in ["100nF capacitor", "10uF capacitor", "10k resistor", "330 resistor"]:
        for c in lib.search_components(q, category="passive", limit=3):
            if c["id"] not in seen_ids:
                seen_ids.add(c["id"])
                library_subset.append(c)

    logger.info(
        "Selecting components for %d nodes from dynamic candidate pool of %d parts",
        len(arch.nodes),
        len(library_subset),
    )

    # Build compact library summary for the LLM context
    lib_summary = [
        {
            "id": c["id"],
            "name": c["name"],
            "category": c["category"],
            "footprint": c["footprint"],
            "description": c["description"],
        }
        for c in library_subset
    ]

    user_prompt = f"""Architecture nodes:
{json.dumps([n.model_dump() for n in arch.nodes], indent=2)}

Available component library:
{json.dumps(lib_summary, indent=2)}

Microcontroller: {reqs.microcontroller}
Sensors: {reqs.sensors}
Actuators: {reqs.actuators}
Power: {reqs.power_constraints.input_voltage} → {reqs.power_constraints.output_voltage}

Select components and return JSON."""

    raw: dict[str, Any] = call_llm(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=3000,
    )

    # Build lookup maps
    lib_by_id = {c["id"]: c for c in library_subset}
    lib_by_name = {c["name"].lower(): c for c in library_subset}

    selections: list[ComponentSelection] = []
    refs_used: set[str] = set()

    def unique_ref(base: str) -> str:
        i = 1
        while f"{base}{i}" in refs_used:
            i += 1
        r = f"{base}{i}"
        refs_used.add(r)
        return r

    for sel in raw.get("selections", []):
        lib_id = sel.get("library_id", "")
        comp = lib_by_id.get(lib_id)
        if comp is None:
            # Try fuzzy fallback by name
            comp = lib_by_name.get(lib_id.lower().replace("-", " "))
        if comp is None:
            logger.warning("LLM selected unknown library_id '%s' — skipping", lib_id)
            continue

        selections.append(
            ComponentSelection(
                node_id=sel.get("node_id", ""),
                ref=unique_ref(sel.get("ref", "U")),
                name=comp["name"],
                library=comp.get("lib", "Device"),
                footprint=comp.get("footprint") or "Device:R", # Fallback to resistor if empty
                package=comp.get("package", "SMD"),
                datasheet_url=comp.get("datasheet", ""),
                unit_cost=comp.get("unit_cost", 0.10),
                qty=int(sel.get("qty", 1)),
                justification=sel.get("justification", ""),
                specs=comp.get("specs", []),
                description=comp.get("description", ""),
            )
        )

    bom_total = sum(s.unit_cost * s.qty for s in selections)

    result = ComponentsOutput(
        components=selections,
        bom_total=round(bom_total, 2),
        project_id=arch.project_id,
    )

    # Persist BOM
    db.insert("boms", {
        "project_id": arch.project_id,
        "bom_csv": _to_csv(selections),
        "total_cost": bom_total,
    })

    # Persist each component
    for s in selections:
        db.insert("components", {
            "project_id": arch.project_id,
            "ref": s.ref,
            "name": s.name,
            "footprint": s.footprint,
            "package": s.package,
            "unit_cost": s.unit_cost,
            "qty": s.qty,
            "justification": s.justification,
            "specs": json.dumps(s.specs),
            "library": s.library,
        })

    logger.info(
        "Selected %d components, BOM total $%.2f", len(selections), bom_total
    )
    return result


def _to_csv(components: list[ComponentSelection]) -> str:
    lines = ["Ref,Name,Package,Qty,Unit Cost,Total,Datasheet"]
    for c in components:
        total = c.unit_cost * c.qty
        lines.append(
            f'{c.ref},{c.name},{c.package},{c.qty},'
            f'${c.unit_cost:.2f},${total:.2f},{c.datasheet_url}'
        )
    return "\n".join(lines)
