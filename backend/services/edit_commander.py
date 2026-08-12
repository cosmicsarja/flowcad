"""
services/edit_commander.py
───────────────────────────
Stage 9: POST /apply-edit
  Input : ApplyEditInput (current_design_state + command string)
  Output: ApplyEditOutput (updated_design_state + verification results)

Regex/keyword-based command parser — no LLM needed.
Supported commands:
  - resize / make board (smaller|bigger|larger) [by N%]
  - move <component> to (left|right|top|bottom|center)
  - replace <component> with <new_component>
  - add <component>
  - remove <component>
"""
from __future__ import annotations

import copy
import json
import logging
import re
from pathlib import Path
from typing import Any

from schemas.requirements import (
    ApplyEditInput,
    ApplyEditOutput,
    VerifyInput,
)
from services.verifier import verify

logger = logging.getLogger(__name__)


def apply_edit(inp: ApplyEditInput) -> ApplyEditOutput:
    """Parse command and mutate the design state."""
    state = copy.deepcopy(inp.current_design_state)
    cmd = inp.command.strip().lower()
    action = "No matching command pattern found."

    # ── Resize ────────────────────────────────────────────────────────────
    resize_match = re.search(
        r'(smaller|bigger|larger|shrink|grow|resize|reduce|increase)',
        cmd
    )
    board_match = re.search(r'(board|pcb|outline|size)', cmd)
    if resize_match and board_match:
        pct_match = re.search(r'(\d{1,3})\s*%', cmd)
        pct = int(pct_match.group(1)) / 100 if pct_match else 0.15
        grow = resize_match.group(1) in ('bigger', 'larger', 'grow', 'increase')
        factor = 1 + pct if grow else 1 - pct
        board = state.get("board", {"w": 60, "h": 45})
        new_w = round(max(18.0, min(150.0, board["w"] * factor)), 1)
        new_h = round(max(14.0, min(120.0, board["h"] * factor)), 1)
        state["board"] = {"w": new_w, "h": new_h}
        action = (
            f"Board resized {'from' if not grow else 'to'} "
            f"{board['w']}×{board['h']} mm → {new_w}×{new_h} mm "
            f"({'−' if not grow else '+'}{int(pct*100)}%)."
        )

    # ── Move component ────────────────────────────────────────────────────
    elif move_m := re.search(
        r'move\s+(?:the\s+)?([a-z0-9_\-\.\s]+?)\s+to\s+(?:the\s+)?(left|right|top|bottom|center|middle)',
        cmd
    ):
        query = move_m.group(1).strip()
        location = move_m.group(2)
        board = state.get("board", {"w": 60, "h": 45})
        w, h = board.get("w", 60), board.get("h", 45)
        px_per_mm = 9

        locs = {
            "left":   lambda pw, ph: (int(2 * px_per_mm), int((h * px_per_mm - ph) / 2)),
            "right":  lambda pw, ph: (int((w - 2) * px_per_mm - pw), int((h * px_per_mm - ph) / 2)),
            "top":    lambda pw, ph: (int((w * px_per_mm - pw) / 2), int(2 * px_per_mm)),
            "bottom": lambda pw, ph: (int((w * px_per_mm - pw) / 2), int((h - 2) * px_per_mm - ph)),
            "center": lambda pw, ph: (int((w * px_per_mm - pw) / 2), int((h * px_per_mm - ph) / 2)),
            "middle": lambda pw, ph: (int((w * px_per_mm - pw) / 2), int((h * px_per_mm - ph) / 2)),
        }

        part = _find_part(query, state.get("parts", []))
        if part:
            loc_fn = locs.get(location, locs["center"])
            nx, ny = loc_fn(part.get("pw", 40), part.get("ph", 40))
            for p in state["parts"]:
                if p["ref"] == part["ref"]:
                    p["px"] = nx
                    p["py"] = ny
            action = f"Moved {part['ref']} ({part['name']}) to the {location} of the board."
        else:
            action = f"Component matching '{query}' not found in current design."

    # ── Replace component ──────────────────────────────────────────────────
    elif swap_m := re.search(
        r'(?:replace|swap)\s+(?:the\s+)?([a-z0-9_\-\.\s]+?)\s+(?:with|for)\s+(?:an?\s+)?([a-z0-9_\-\.\s/]+)',
        cmd
    ):
        query = swap_m.group(1).strip()
        new_name = swap_m.group(2).strip().title()
        part = _find_part(query, state.get("parts", []))
        if part:
            old_name = part["name"]
            for p in state["parts"]:
                if p["ref"] == part["ref"]:
                    p["name"] = new_name
                    p["value"] = new_name[:12]
                    p["unit"] = round(p.get("unit", 1.0) * 1.1, 2)
                    p["reasoning"] = (
                        f"Swapped from {old_name} to {new_name} on user request. "
                        f"Footprint {p.get('pkg', 'unchanged')} retained."
                    )
            action = f"Replaced {part['ref']}: {old_name} → {new_name}."
        else:
            action = f"Component matching '{query}' not found."

    # ── Add component ──────────────────────────────────────────────────────
    elif add_m := re.search(r'add\s+(?:an?\s+)?([a-z0-9_\-\.\s]+)', cmd):
        comp_name = add_m.group(1).strip().title()
        parts = state.get("parts", [])
        # Determine ref prefix
        prefix = _guess_prefix(comp_name)
        ref = _next_ref(prefix, parts)
        new_part = {
            "ref": ref,
            "name": comp_name,
            "value": comp_name[:10],
            "pkg": "0603",
            "unit": 0.10,
            "qty": 1,
            "sym": "ic",
            "desc": f"{comp_name} added on request",
            "reasoning": f"{comp_name} added via edit command.",
            "specs": [],
            "datasheet": "",
            "sx": 0, "sy": 0, "sw": 50, "sh": 60,
            "px": 10, "py": 10, "pw": 30, "ph": 35,
            "z": 1, "pins": 2, "side": "top",
        }
        parts.append(new_part)
        state["parts"] = parts
        # Also add a net
        nets = state.get("nets", [])
        mcu_ref = next((p["ref"] for p in parts if "ESP" in p.get("name", "") or "MCU" in p.get("sym", "")), parts[0]["ref"] if parts else "U1")
        nets.append({"from_ref": mcu_ref, "to_ref": ref, "net": f"GPIO_ADD_{len(nets)}"})
        state["nets"] = nets
        action = f"Added {ref} ({comp_name}) to schematic and BOM."

    # ── Remove component ───────────────────────────────────────────────────
    elif remove_m := re.search(r'(?:remove|delete)\s+(?:the\s+)?([a-z0-9_\-\.\s]+)', cmd):
        query = remove_m.group(1).strip()
        part = _find_part(query, state.get("parts", []))
        if part:
            state["parts"] = [p for p in state.get("parts", []) if p["ref"] != part["ref"]]
            state["nets"] = [
                n for n in state.get("nets", [])
                if n.get("from_ref") != part["ref"] and n.get("to_ref") != part["ref"]
            ]
            action = f"Removed {part['ref']} ({part['name']}) from schematic and BOM."
        else:
            action = f"Component matching '{query}' not found."

    # ── Run re-verification on the mutated design ──────────────────────────
    verification = None
    pcb_path = state.get("pcb_path")
    if pcb_path and Path(pcb_path).exists():
        try:
            verification = verify(VerifyInput(
                pcb_path=pcb_path,
                project_id=state.get("project_id"),
            ))
            state["confidence"] = verification.confidence
            state["checks"] = [c.model_dump() for c in verification.checks]
        except Exception as exc:
            logger.warning("Re-verification after edit failed: %s", exc)

    logger.info("Edit applied: %s", action)
    return ApplyEditOutput(
        updated_design_state=state,
        action_taken=action,
        verification=verification,
    )


def _find_part(query: str, parts: list[dict]) -> dict | None:
    q = query.lower()
    # Exact ref match
    for p in parts:
        if p.get("ref", "").lower() == q:
            return p
    # Name contains
    for p in parts:
        if q in p.get("name", "").lower():
            return p
    # Value contains
    for p in parts:
        if q in p.get("value", "").lower():
            return p
    # Token overlap
    tokens = q.split()
    for p in parts:
        name_tokens = p.get("name", "").lower().split()
        if any(t in name_tokens for t in tokens):
            return p
    return None


def _guess_prefix(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ["led", "diode"]):
        return "D"
    if any(k in n for k in ["resistor", "res"]):
        return "R"
    if any(k in n for k in ["cap", "capacitor"]):
        return "C"
    if any(k in n for k in ["connector", "header", "usb", "jack"]):
        return "J"
    if any(k in n for k in ["relay"]):
        return "K"
    if any(k in n for k in ["transistor", "mosfet", "bjt"]):
        return "Q"
    if any(k in n for k in ["switch", "button"]):
        return "SW"
    return "U"


def _next_ref(prefix: str, parts: list[dict]) -> str:
    i = 1
    while any(p.get("ref") == f"{prefix}{i}" for p in parts):
        i += 1
    return f"{prefix}{i}"
