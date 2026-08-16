"""
services/layout_extractor.py
─────────────────────────────
Layout Engine for FlowCAD.

When KiCad / pcbnew is available: reads real footprint geometry, copper
traces, pads, vias, mounting holes and keepouts from the routed .kicad_pcb.

When KiCad is absent (CI / cloud): computes all of the above deterministically
from the SchematicOutput (netlist) + ComponentsOutput (BOM):
  • Orthogonal grid placement grouped by component category
  • Orthogonal L-shaped routing with per-net-class trace widths
  • Pads derived from footprint package names
  • Via insertion on layer-change segments
  • Mounting holes at board corners
  • RF / antenna keepout zones when a Wi-Fi / BLE component is detected

Output: LayoutOutput — a stable Pydantic model whose field names the
        frontend binds to directly.
"""
from __future__ import annotations

import logging
import math
import re
import uuid
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Output Models
# ─────────────────────────────────────────────────────────────────────────────

class PlacedComponent(BaseModel):
    """One footprint placed on the board."""
    ref: str                    # e.g. "U1"
    name: str                   # human name, e.g. "ESP32-WROOM-32"
    footprint: str              # KiCad footprint id
    x_mm: float                 # left edge from board origin
    y_mm: float                 # top edge from board origin
    w_mm: float                 # bounding-box width
    h_mm: float                 # bounding-box height
    layer: str = "F.Cu"         # "F.Cu" | "B.Cu"
    rotation: float = 0.0       # degrees


class RouteSegment(BaseModel):
    """One copper trace segment."""
    net: str
    x1_mm: float
    y1_mm: float
    x2_mm: float
    y2_mm: float
    width_mm: float
    layer: str = "F.Cu"


class Pad(BaseModel):
    """One SMD/THT pad."""
    ref: str
    pad_num: int
    x_mm: float
    y_mm: float
    w_mm: float
    h_mm: float
    net: str
    layer: str = "F.Cu"


class Via(BaseModel):
    """A via connecting two copper layers."""
    x_mm: float
    y_mm: float
    drill_mm: float = 0.3
    outer_mm: float = 0.6
    net: str


class MountingHole(BaseModel):
    """A non-plated mounting hole."""
    x_mm: float
    y_mm: float
    drill_mm: float = 3.2       # M3 default


class KeepoutZone(BaseModel):
    """A rectangular keepout zone (e.g. antenna clearance)."""
    label: str
    polygon: list[tuple[float, float]]   # (x_mm, y_mm) vertices, clockwise


class LayoutOutput(BaseModel):
    """
    Full board layout snapshot.  The frontend binds directly to these fields.
    data_source = "kicad"     → read from real pcbnew API
    data_source = "computed"  → deterministically computed from netlist/BOM
    """
    board_w_mm: float
    board_h_mm: float
    layers: int = 2
    placement: list[PlacedComponent] = Field(default_factory=list)
    routing: list[RouteSegment] = Field(default_factory=list)
    trace_widths: dict[str, float] = Field(default_factory=dict)  # netclass → mm
    pads: list[Pad] = Field(default_factory=list)
    vias: list[Via] = Field(default_factory=list)
    mounting_holes: list[MountingHole] = Field(default_factory=list)
    keepouts: list[KeepoutZone] = Field(default_factory=list)
    net_index: dict[str, list[str]] = Field(default_factory=dict)  # net → [ref, ...]
    data_source: str = "computed"
    project_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Public entry-point
# ─────────────────────────────────────────────────────────────────────────────

def extract_layout(
    pcb_path: str,
    netlist_data: Optional[dict[str, Any]] = None,
    components_data: Optional[dict[str, Any]] = None,
    board_constraints: Optional[dict[str, Any]] = None,
    project_id: Optional[str] = None,
) -> LayoutOutput:
    """
    Extract or compute a LayoutOutput for the given project.

    Priority:
      1. Read from routed .kicad_pcb via pcbnew (real KiCad output)
      2. Fall back to computed layout from netlist + components
    """
    project_id = project_id or str(uuid.uuid4())
    bc = board_constraints or {}
    w = float(bc.get("max_width_mm", 100.0))
    h = float(bc.get("max_height_mm", 80.0))
    layers = int(bc.get("layers", 2))

    # Try pcbnew first
    if pcb_path and Path(pcb_path).exists():
        try:
            result = _extract_via_pcbnew(pcb_path, w, h, layers, project_id)
            logger.info("[%s] Layout extracted via pcbnew from %s", project_id, pcb_path)
            return result
        except Exception as exc:
            logger.warning("[%s] pcbnew layout extraction failed (%s) — computing fallback", project_id, exc)

    # Computed fallback
    result = _compute_layout(netlist_data, components_data, w, h, layers, project_id)
    logger.info("[%s] Layout computed (fallback) — %d components", project_id, len(result.placement))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Path 1: Extract from pcbnew
# ─────────────────────────────────────────────────────────────────────────────

def _extract_via_pcbnew(
    pcb_path: str, w: float, h: float, layers: int, project_id: str
) -> LayoutOutput:
    """Use pcbnew Python API to read real footprint / routing data."""
    import pcbnew  # type: ignore

    board = pcbnew.LoadBoard(pcb_path)

    # ── Placement ─────────────────────────────────────────────────────────
    placement: list[PlacedComponent] = []
    for fp in board.GetFootprints():
        pos = fp.GetPosition()
        bb = fp.GetBoundingBox()
        placement.append(PlacedComponent(
            ref=fp.GetReference(),
            name=fp.GetValue(),
            footprint=fp.GetFPID().GetUniStringLibItemName(),
            x_mm=pcbnew.ToMM(bb.GetLeft()),
            y_mm=pcbnew.ToMM(bb.GetTop()),
            w_mm=pcbnew.ToMM(bb.GetWidth()),
            h_mm=pcbnew.ToMM(bb.GetHeight()),
            layer="F.Cu" if fp.GetLayer() == pcbnew.F_Cu else "B.Cu",
            rotation=fp.GetOrientationDegrees(),
        ))

    # ── Routing ──────────────────────────────────────────────────────────
    routing: list[RouteSegment] = []
    for seg in board.GetTracks():
        if seg.GetClass() == "PCB_TRACK":
            routing.append(RouteSegment(
                net=seg.GetNetname(),
                x1_mm=pcbnew.ToMM(seg.GetStart().x),
                y1_mm=pcbnew.ToMM(seg.GetStart().y),
                x2_mm=pcbnew.ToMM(seg.GetEnd().x),
                y2_mm=pcbnew.ToMM(seg.GetEnd().y),
                width_mm=pcbnew.ToMM(seg.GetWidth()),
                layer="F.Cu" if seg.GetLayer() == pcbnew.F_Cu else "B.Cu",
            ))

    # ── Pads ──────────────────────────────────────────────────────────────
    pads: list[Pad] = []
    for fp in board.GetFootprints():
        for i, pad in enumerate(fp.Pads()):
            pads.append(Pad(
                ref=fp.GetReference(),
                pad_num=i + 1,
                x_mm=pcbnew.ToMM(pad.GetPosition().x),
                y_mm=pcbnew.ToMM(pad.GetPosition().y),
                w_mm=pcbnew.ToMM(pad.GetSizeX()),
                h_mm=pcbnew.ToMM(pad.GetSizeY()),
                net=pad.GetNetname(),
                layer="F.Cu" if pad.GetLayer() == pcbnew.F_Cu else "B.Cu",
            ))

    # ── Vias ─────────────────────────────────────────────────────────────
    vias: list[Via] = []
    for seg in board.GetTracks():
        if seg.GetClass() == "PCB_VIA":
            vias.append(Via(
                x_mm=pcbnew.ToMM(seg.GetPosition().x),
                y_mm=pcbnew.ToMM(seg.GetPosition().y),
                drill_mm=pcbnew.ToMM(seg.GetDrillValue()),
                outer_mm=pcbnew.ToMM(seg.GetWidth()),
                net=seg.GetNetname(),
            ))

    # ── Mounting holes ────────────────────────────────────────────────────
    mounting_holes = _corner_mounting_holes(w, h)

    # ── Keepouts ─────────────────────────────────────────────────────────
    keepouts: list[KeepoutZone] = []
    for zone in board.Zones():
        if zone.GetIsRuleArea() and zone.GetDoNotAllowCopperPour():
            pts = zone.Outline().CPoints(0)
            polygon = [(pcbnew.ToMM(p.x), pcbnew.ToMM(p.y)) for p in pts]
            keepouts.append(KeepoutZone(
                label=zone.GetNetname() or "KEEPOUT",
                polygon=polygon,
            ))

    # ── Net index ─────────────────────────────────────────────────────────
    net_index: dict[str, list[str]] = {}
    for net in board.GetNetInfo().NetsByName().values():
        name = net.GetNetname()
        if name:
            net_index.setdefault(name, [])
    for pad in pads:
        if pad.net:
            net_index.setdefault(pad.net, [])
            if pad.ref not in net_index[pad.net]:
                net_index[pad.net].append(pad.ref)

    # ── Trace widths ──────────────────────────────────────────────────────
    trace_widths = _trace_widths_from_pcbnew(board)

    return LayoutOutput(
        board_w_mm=w,
        board_h_mm=h,
        layers=layers,
        placement=placement,
        routing=routing,
        trace_widths=trace_widths,
        pads=pads,
        vias=vias,
        mounting_holes=mounting_holes,
        keepouts=keepouts,
        net_index=net_index,
        data_source="kicad",
        project_id=project_id,
    )


def _trace_widths_from_pcbnew(board: Any) -> dict[str, float]:
    """Read net-class trace widths from pcbnew design settings."""
    try:
        import pcbnew  # type: ignore
        ds = board.GetDesignSettings()
        nc_map: dict[str, float] = {}
        for nc in ds.GetNetClasses():
            nc_map[nc.GetName()] = pcbnew.ToMM(nc.GetTrackWidth())
        if "Default" not in nc_map:
            nc_map["Default"] = pcbnew.ToMM(ds.GetCurrentTrackWidth()) or 0.2
        return nc_map
    except Exception:
        return {"Default": 0.2, "Power": 0.5}


# ─────────────────────────────────────────────────────────────────────────────
# Path 2: Computed layout from netlist + components
# ─────────────────────────────────────────────────────────────────────────────

# Package → (w_mm, h_mm, pad_w, pad_h, pad_count)
_PKG_GEO: dict[str, tuple[float, float, float, float, int]] = {
    "0402":      (1.0,  0.5,  0.5, 0.5, 2),
    "0603":      (1.6,  0.8,  0.8, 0.6, 2),
    "0805":      (2.0,  1.2,  1.0, 0.8, 2),
    "1206":      (3.2,  1.6,  1.4, 1.2, 2),
    "SOT-23":    (2.9,  2.4,  0.6, 0.9, 3),
    "SOT-23-5":  (2.9,  2.4,  0.6, 0.9, 5),
    "SOT-223":   (6.5,  3.5,  2.0, 2.3, 4),
    "SOIC-8":    (5.0,  4.0,  1.5, 0.6, 8),
    "SOIC-16":   (10.0, 4.0,  1.5, 0.6, 16),
    "QFN-16":    (4.0,  4.0,  0.5, 0.25, 16),
    "QFN-32":    (5.0,  5.0,  0.5, 0.25, 32),
    "TQFP-32":   (9.0,  9.0,  0.5, 1.5, 32),
    "LGA-8":     (2.5,  2.5,  0.5, 0.5, 8),
    "DIP-8":     (9.5,  6.5,  1.5, 1.5, 8),
    "DIP-28":    (35.6, 7.6,  1.5, 1.5, 28),
    "THT":       (8.0,  8.0,  1.5, 1.5, 2),
    "THT-2":     (8.0,  8.0,  1.5, 1.5, 2),
    "THT Relay": (20.0, 16.0, 1.5, 1.5, 5),
    "FPC-4":     (8.0,  4.0,  1.0, 2.0, 4),
    "JST-PH 2P": (5.5,  4.5,  2.5, 2.0, 2),
    "SMD":       (3.0,  3.0,  1.0, 1.0, 2),
    "SMD 4P":    (5.0,  5.0,  1.0, 1.0, 4),
    "MODULE":    (18.0, 30.0, 1.5, 1.5, 8),
    "WROOM":     (18.0, 25.6, 1.5, 1.5, 38),
}

def _pkg_geo(pkg: str) -> tuple[float, float, float, float, int]:
    """Return (w_mm, h_mm, pad_w, pad_h, pad_count) for a package string."""
    key = pkg.upper().strip()
    for k, v in _PKG_GEO.items():
        if k.upper() in key or key in k.upper():
            return v
    # Generic fallback by rough size hint
    if "MODULE" in key or "WROOM" in key or "PICO" in key:
        return _PKG_GEO["MODULE"]
    if "DIP" in key:
        return _PKG_GEO["DIP-8"]
    return (5.0, 4.0, 1.0, 0.6, 4)   # unknown → SOIC-8-ish


def _net_class(net_name: str) -> str:
    """Classify a net name into a net class."""
    n = net_name.upper()
    if any(x in n for x in ("VCC", "VDD", "VBUS", "3V3", "5V", "12V", "GND", "PWR", "POWER")):
        return "Power"
    if any(x in n for x in ("RF", "ANT", "ANTENNA", "WIFI", "BLE")):
        return "RF"
    if any(x in n for x in ("HS_", "USB_D", "LVDS")):
        return "HighSpeed"
    return "Default"


_NET_CLASS_WIDTH: dict[str, float] = {
    "Power":     0.5,
    "RF":        0.15,
    "HighSpeed": 0.15,
    "Default":   0.2,
}


def _has_antenna(components: list[dict]) -> bool:
    """True when any component suggests an RF front-end."""
    for c in components:
        n = (c.get("name", "") + c.get("footprint", "") + c.get("package", "")).upper()
        if any(x in n for x in ("ESP", "NRF", "CC2", "WIFI", "BLE", "ZIGBEE", "LORA", "RF")):
            return True
    return False


def _compute_layout(
    netlist_data: Optional[dict],
    components_data: Optional[dict],
    w: float,
    h: float,
    layers: int,
    project_id: str,
) -> LayoutOutput:
    """Compute a full LayoutOutput deterministically from netlist + component data."""

    comps: list[dict] = []
    if components_data and "components" in components_data:
        comps = components_data["components"]
    elif netlist_data and "parts" in netlist_data:
        comps = netlist_data["parts"]

    nets_raw: list[dict] = []
    if netlist_data and "nets" in netlist_data:
        nets_raw = netlist_data["nets"]

    # ── Placement ─────────────────────────────────────────────────────────
    placement: list[PlacedComponent] = []
    ref_to_comp: dict[str, PlacedComponent] = {}

    margin = 3.0
    col_gap = 2.0
    row_gap = 2.0

    # Group by category: connectors → left, ICs/MCUs → centre, passives → right
    connectors, ics, passives, others = [], [], [], []
    for c in comps:
        ref = c.get("ref", c.get("node_id", "U?"))
        pkg = c.get("package", c.get("footprint", "0603"))
        r = ref.upper()
        if r.startswith(("J", "P", "CON")):
            connectors.append(c)
        elif r.startswith("U") or "IC" in pkg.upper() or "QFN" in pkg.upper() or "SOIC" in pkg.upper():
            ics.append(c)
        elif r.startswith(("R", "C", "L", "D")):
            passives.append(c)
        else:
            others.append(c)

    def place_column(items: list[dict], col_x: float) -> None:
        y = margin
        for c in items:
            ref = c.get("ref", c.get("node_id", "U?"))
            pkg = c.get("package", c.get("footprint", "0603"))
            cw, ch, *_ = _pkg_geo(pkg)
            pc = PlacedComponent(
                ref=ref,
                name=c.get("name", ref),
                footprint=c.get("footprint", pkg),
                x_mm=col_x,
                y_mm=y,
                w_mm=cw,
                h_mm=ch,
            )
            placement.append(pc)
            ref_to_comp[ref] = pc
            y += ch + row_gap
            if y > h - margin:
                col_x += cw + col_gap * 3
                y = margin

    # Assign columns
    conn_col = margin
    ic_col   = margin + 15.0
    pas_col  = w - margin - 12.0  # start from right, will shift left as needed
    oth_col  = w - margin - 6.0

    place_column(connectors, conn_col)
    place_column(ics,        ic_col)
    place_column(passives,   pas_col)
    place_column(others,     oth_col)

    # ── Net index ─────────────────────────────────────────────────────────
    net_index: dict[str, list[str]] = {}
    for nr in nets_raw:
        net_name = nr.get("net", nr.get("name", ""))
        from_ref = nr.get("from_ref", nr.get("from", ""))
        to_ref   = nr.get("to_ref",   nr.get("to",   ""))
        if net_name:
            bucket = net_index.setdefault(net_name, [])
            for r in (from_ref, to_ref):
                if r and r not in bucket:
                    bucket.append(r)

    # ── Trace widths ──────────────────────────────────────────────────────
    trace_widths: dict[str, float] = dict(_NET_CLASS_WIDTH)

    # ── Routing ──────────────────────────────────────────────────────────
    routing: list[RouteSegment] = []
    vias: list[Via] = []

    for nr in nets_raw:
        net_name = nr.get("net", nr.get("name", ""))
        from_ref = nr.get("from_ref", nr.get("from", ""))
        to_ref   = nr.get("to_ref",   nr.get("to",   ""))
        if not (from_ref and to_ref and net_name):
            continue

        fa = ref_to_comp.get(from_ref)
        ta = ref_to_comp.get(to_ref)
        if not fa or not ta:
            continue

        nc = _net_class(net_name)
        tw = _NET_CLASS_WIDTH.get(nc, 0.2)

        # Centre points
        x1 = fa.x_mm + fa.w_mm / 2
        y1 = fa.y_mm + fa.h_mm / 2
        x2 = ta.x_mm + ta.w_mm / 2
        y2 = ta.y_mm + ta.h_mm / 2

        # Orthogonal L-route: horizontal first, then vertical
        mx = x1 + (x2 - x1) / 2
        routing.append(RouteSegment(net=net_name, x1_mm=x1, y1_mm=y1, x2_mm=mx, y2_mm=y1, width_mm=tw))
        routing.append(RouteSegment(net=net_name, x1_mm=mx, y1_mm=y1, x2_mm=mx, y2_mm=y2, width_mm=tw))
        routing.append(RouteSegment(net=net_name, x1_mm=mx, y1_mm=y2, x2_mm=x2, y2_mm=y2, width_mm=tw))

        # Insert a via at the bend when routing crosses component bodies
        if layers >= 2 and abs(y1 - y2) > 5.0:
            vias.append(Via(x_mm=mx, y_mm=(y1 + y2) / 2, net=net_name))

    # ── Pads ──────────────────────────────────────────────────────────────
    pads: list[Pad] = []
    for c in comps:
        ref = c.get("ref", c.get("node_id", "U?"))
        pkg = c.get("package", c.get("footprint", "0603"))
        cw, ch, pw, ph, n_pads = _pkg_geo(pkg)
        comp = ref_to_comp.get(ref)
        if not comp:
            continue
        for i in range(n_pads):
            side = i % 2  # alternating left/right sides
            px = comp.x_mm + (pw / 2 if side == 0 else cw - pw / 2)
            py = comp.y_mm + ph / 2 + (ch / max(1, n_pads - 1)) * i
            pads.append(Pad(ref=ref, pad_num=i + 1, x_mm=px, y_mm=py, w_mm=pw, h_mm=ph, net=""))

    # ── Mounting holes ────────────────────────────────────────────────────
    mounting_holes = _corner_mounting_holes(w, h)

    # ── Keepouts ─────────────────────────────────────────────────────────
    keepouts: list[KeepoutZone] = []
    if _has_antenna(comps):
        # Reserve top-right quadrant for antenna clearance
        kx, ky = w * 0.55, 0.0
        kw, kh = w * 0.45, h * 0.35
        keepouts.append(KeepoutZone(
            label="ANTENNA KEEPOUT",
            polygon=[(kx, ky), (kx + kw, ky), (kx + kw, ky + kh), (kx, ky + kh)],
        ))

    return LayoutOutput(
        board_w_mm=w,
        board_h_mm=h,
        layers=layers,
        placement=placement,
        routing=routing,
        trace_widths=trace_widths,
        pads=pads,
        vias=vias,
        mounting_holes=mounting_holes,
        keepouts=keepouts,
        net_index=net_index,
        data_source="computed",
        project_id=project_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _corner_mounting_holes(w: float, h: float, margin: float = 3.5) -> list[MountingHole]:
    """Standard M3 mounting holes at all four corners."""
    return [
        MountingHole(x_mm=margin,         y_mm=margin),
        MountingHole(x_mm=w - margin,     y_mm=margin),
        MountingHole(x_mm=margin,         y_mm=h - margin),
        MountingHole(x_mm=w - margin,     y_mm=h - margin),
    ]
