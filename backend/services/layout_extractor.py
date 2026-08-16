"""
services/layout_extractor.py
─────────────────────────────
Turns the pipeline's real artefacts (the routed .kicad_pcb when KiCad is
available, otherwise the real component + netlist data produced upstream)
into a single JSON *layout* document the frontend renders directly.

Everything here is server-side: the frontend never invents geometry.

layout = {
  "board":          {"w": mm, "h": mm, "layers": n},
  "footprints":     [{ref, value, footprint, x, y, w, h, rot, layer, kind,
                      pads: [{name, x, y, w, h, drill, net}]}],
  "traces":         [{x1, y1, x2, y2, width, net, net_class, layer}],
  "vias":           [{x, y, d, drill, net}],
  "mounting_holes": [{x, y, d}],
  "keepouts":       [{name, x, y, w, h, reason}],
  "nets":           [{name, net_class, nodes: [{ref, pad}]}],
  "source":         "kicad" | "computed",
}
"""
from __future__ import annotations

import logging
import math
import re
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── footprint dimension knowledge (mm) ───────────────────────────────────────

_IMPERIAL = {
    "0201": (0.6, 0.3), "0402": (1.0, 0.5), "0603": (1.6, 0.8),
    "0805": (2.0, 1.25), "1206": (3.2, 1.6), "1210": (3.2, 2.5),
}

_NAMED: list[tuple[str, tuple[float, float], str]] = [
    (r"esp32[-_]?wroom", (18.0, 25.5), "module"),
    (r"esp32[-_]?s3", (17.5, 25.5), "module"),
    (r"esp8266|esp[-_]?12", (16.0, 24.0), "module"),
    (r"raspberry|rp2040", (7.0, 7.0), "ic"),
    (r"lqfp[-_]?(\d+)", (9.0, 9.0), "ic"),
    (r"tqfp[-_]?(\d+)", (10.0, 10.0), "ic"),
    (r"qfn[-_]?(\d+)", (5.0, 5.0), "ic"),
    (r"sot[-_]?223", (6.5, 7.0), "ic"),
    (r"sot[-_]?23", (2.9, 2.4), "ic"),
    (r"to[-_]?220", (10.0, 15.0), "ic"),
    (r"soic[-_]?(\d+)", (6.0, 5.0), "ic"),
    (r"dip[-_]?(\d+)", (7.6, 10.0), "ic"),
    (r"dht(11|22)|am2302", (15.5, 25.0), "sensor"),
    (r"relay", (19.0, 15.5), "relay"),
    (r"usb[-_]?c", (9.0, 7.5), "conn"),
    (r"usb", (12.0, 11.0), "conn"),
    (r"screwterminal|terminalblock|phoenix", (10.0, 8.0), "conn"),
    (r"pinheader[-_]?1x(\d+)", (0.0, 0.0), "conn"),      # computed below
    (r"oled|display|lcd", (27.0, 27.0), "module"),
    (r"crystal|xtal|hc[-_]?49", (5.0, 3.2), "xtal"),
    (r"led", (2.0, 1.25), "led"),
    (r"button|switch|sw_push", (6.0, 6.0), "sw"),
    (r"batteryholder|battery", (20.0, 20.0), "batt"),
    (r"motor|pump", (24.0, 20.0), "actuator"),
    (r"inductor", (4.0, 4.0), "ind"),
    (r"diode|sod", (2.7, 1.6), "diode"),
]

_KIND_FROM_REF = {
    "R": "res", "C": "cap", "L": "ind", "D": "diode", "LED": "led",
    "U": "ic", "Q": "transistor", "J": "conn", "K": "relay", "SW": "sw",
    "Y": "xtal", "X": "xtal", "M": "actuator", "BT": "batt",
}

POWER_RE = re.compile(r"^(\+?\d+v\d*|gnd|vcc|vdd|vbus|vbat|vin|vout|3v3|5v|12v|agnd|pgnd)$", re.I)


def _ref_kind(ref: str) -> str:
    prefix = re.match(r"[A-Za-z]+", ref or "U")
    return _KIND_FROM_REF.get((prefix.group(0) if prefix else "U").upper(), "ic")


def footprint_size(footprint: str, package: str, ref: str, pins: int = 2) -> tuple[float, float, str]:
    """Best-effort real body size in mm for a KiCad footprint identifier."""
    hay = f"{footprint} {package}".lower().replace(" ", "")

    m = re.search(r"pinheader.*1x(\d+)", hay)
    if m:
        n = int(m.group(1))
        return (2.54 * n + 1.0, 2.6, "conn")

    for pattern, size, kind in _NAMED:
        if re.search(pattern, hay):
            if size == (0.0, 0.0):
                continue
            mm = re.search(pattern, hay)
            if kind == "ic" and mm and mm.lastindex:
                try:
                    n = int(mm.group(1))
                    side = max(4.0, 1.2 * math.sqrt(max(n, 8)) + 3.0)
                    return (side, side, kind)
                except (ValueError, IndexError):
                    pass
            return (size[0], size[1], kind)

    for code, size in _IMPERIAL.items():
        if code in hay:
            kind = _ref_kind(ref)
            return (size[0], size[1], kind if kind in ("res", "cap", "led", "ind", "diode") else "res")

    kind = _ref_kind(ref)
    if kind in ("res", "cap", "ind", "diode", "led"):
        return (2.0, 1.25, kind)
    if kind == "conn":
        return (2.54 * max(2, pins) + 1.0, 2.6, "conn")
    side = max(5.0, 1.1 * math.sqrt(max(pins, 8)) + 3.0)
    return (side, side, kind)


def net_class(net_name: str) -> str:
    n = (net_name or "").strip().lstrip("/")
    if POWER_RE.match(n):
        return "power"
    if re.search(r"gnd|ground", n, re.I):
        return "ground"
    return "signal"


TRACE_WIDTH = {"power": 0.6, "ground": 0.8, "signal": 0.25}


# ── pads ─────────────────────────────────────────────────────────────────────

def _pads_for(kind: str, w: float, h: float, pins: int) -> list[dict[str, Any]]:
    """Real-ish pad geometry in footprint-local mm coordinates (centre origin)."""
    if kind in ("res", "cap", "led", "diode", "ind"):
        pw = w * 0.35
        return [
            {"name": "1", "x": -w / 2 + pw / 2, "y": 0.0, "w": pw, "h": h, "drill": 0.0},
            {"name": "2", "x": w / 2 - pw / 2, "y": 0.0, "w": pw, "h": h, "drill": 0.0},
        ]
    if kind in ("conn", "relay", "sw", "batt", "xtal", "actuator"):
        n = max(2, pins)
        pitch = min(2.54, (w - 1.0) / max(1, n - 1))
        start = -pitch * (n - 1) / 2
        return [
            {"name": str(i + 1), "x": start + i * pitch, "y": h / 2 - 0.9,
             "w": 1.7, "h": 1.7, "drill": 1.0}
            for i in range(n)
        ]
    # SMD IC: pin rows left + right
    per_side = max(2, round(max(pins, 8) / 2))
    step = (h - 1.0) / (per_side + 1)
    pads = []
    for i in range(per_side):
        y = -h / 2 + step * (i + 1)
        pads.append({"name": str(i + 1), "x": -w / 2 - 0.35, "y": y, "w": 1.4, "h": max(0.35, step * 0.5), "drill": 0.0})
        pads.append({"name": str(per_side + i + 1), "x": w / 2 + 0.35, "y": -y, "w": 1.4, "h": max(0.35, step * 0.5), "drill": 0.0})
    return pads


# ── KiCad .kicad_pcb reading (used when real KiCad produced geometry) ────────

_NUM = r"(-?\d+(?:\.\d+)?)"


def _parse_kicad_pcb(pcb_path: str) -> dict[str, Any]:
    text = Path(pcb_path).read_text(errors="ignore")
    footprints: list[dict[str, Any]] = []
    for m in re.finditer(r'\(footprint\s+"([^"]+)"(.*?)\n  \)', text, re.S):
        lib_id, body = m.group(1), m.group(2)
        at = re.search(rf"\(at\s+{_NUM}\s+{_NUM}(?:\s+{_NUM})?\)", body)
        ref = re.search(r'\(property\s+"Reference"\s+"([^"]+)"', body) or \
              re.search(r'fp_text\s+reference\s+"([^"]+)"', body)
        val = re.search(r'\(property\s+"Value"\s+"([^"]+)"', body) or \
              re.search(r'fp_text\s+value\s+"([^"]+)"', body)
        if not at:
            continue
        pads = [
            {"name": pm.group(1), "x": float(pm.group(2)), "y": float(pm.group(3)),
             "w": float(pm.group(4)), "h": float(pm.group(5)), "drill": 0.0}
            for pm in re.finditer(
                rf'\(pad\s+"([^"]*)"[^\n]*\n?\s*\(at\s+{_NUM}\s+{_NUM}[^)]*\)\s*\(size\s+{_NUM}\s+{_NUM}\)',
                body,
            )
        ]
        refname = ref.group(1) if ref else "?"
        w, h, kind = footprint_size(lib_id, "", refname, max(2, len(pads)))
        footprints.append({
            "ref": refname,
            "value": val.group(1) if val else "",
            "footprint": lib_id,
            "x": float(at.group(1)), "y": float(at.group(2)),
            "rot": float(at.group(3)) if at.group(3) else 0.0,
            "w": w, "h": h, "kind": kind, "layer": "top",
            "pads": pads or _pads_for(kind, w, h, 2),
        })

    traces = []
    for sm in re.finditer(
        rf'\(segment\s*\(start\s+{_NUM}\s+{_NUM}\)\s*\(end\s+{_NUM}\s+{_NUM}\)\s*\(width\s+{_NUM}\)[^)]*\(layer\s+"([^"]+)"\)(?:[^)]*\(net\s+(\d+)\))?',
        text,
    ):
        traces.append({
            "x1": float(sm.group(1)), "y1": float(sm.group(2)),
            "x2": float(sm.group(3)), "y2": float(sm.group(4)),
            "width": float(sm.group(5)), "layer": sm.group(6),
            "net": sm.group(7) or "", "net_class": "signal",
        })

    vias = [
        {"x": float(v.group(1)), "y": float(v.group(2)), "d": float(v.group(3)), "drill": float(v.group(4)), "net": ""}
        for v in re.finditer(rf'\(via\s*\(at\s+{_NUM}\s+{_NUM}\)\s*\(size\s+{_NUM}\)\s*\(drill\s+{_NUM}\)', text)
    ]
    return {"footprints": footprints, "traces": traces, "vias": vias}


# ── computed placement + routing (real parts, server-side engine) ────────────

def _needs_antenna_keepout(fp: dict[str, Any]) -> bool:
    hay = f"{fp['ref']} {fp['value']} {fp['footprint']}".lower()
    return bool(re.search(r"esp|wifi|wi-fi|ble|bluetooth|lora|nrf24|rf|antenna|sx12", hay))


def _compute_layout(
    components: list[dict[str, Any]],
    nets: list[dict[str, Any]],
    board_w: float,
    board_h: float,
    layers: int,
) -> dict[str, Any]:
    margin = 4.0
    gap = 2.6

    fps: list[dict[str, Any]] = []
    for c in components:
        ref = c.get("ref") or "?"
        pins = int(c.get("pins") or 0) or len(c.get("specs") or []) or 0
        w, h, kind = footprint_size(c.get("footprint", ""), c.get("package", ""), ref, pins or 8)
        fps.append({
            "ref": ref,
            "value": c.get("name") or c.get("value") or "",
            "footprint": c.get("footprint", ""),
            "w": w, "h": h, "kind": kind, "rot": 0.0, "layer": "top",
            "x": 0.0, "y": 0.0,
            "pads": [],
        })

    # big parts first for a stable, dense shelf packing
    order = sorted(fps, key=lambda f: -(f["w"] * f["h"]))
    x = margin
    y = margin
    row_h = 0.0
    for f in order:
        if x + f["w"] > board_w - margin and row_h > 0:
            x = margin
            y += row_h + gap
            row_h = 0.0
        f["x"] = round(x + f["w"] / 2, 3)
        f["y"] = round(y + f["h"] / 2, 3)
        x += f["w"] + gap
        row_h = max(row_h, f["h"])
    needed = y + row_h + margin
    if needed > board_h:
        board_h = round(needed + margin, 1)

    for f in fps:
        f["pads"] = _pads_for(f["kind"], f["w"], f["h"], max(2, len(f["pads"]) or 8))

    by_ref = {f["ref"]: f for f in fps}

    # routing: orthogonal 2-segment manhattan paths between the closest pads
    traces: list[dict[str, Any]] = []
    net_index: dict[str, dict[str, Any]] = {}
    for n in nets:
        a = by_ref.get(n.get("from_ref") or n.get("from") or "")
        b = by_ref.get(n.get("to_ref") or n.get("to") or "")
        name = n.get("net") or n.get("net_name") or "NET"
        cls = net_class(name)
        entry = net_index.setdefault(name, {"name": name, "net_class": cls, "nodes": []})
        if not a or not b:
            continue

        def closest(src: dict[str, Any], dst: dict[str, Any]) -> tuple[float, float, str]:
            best = None
            for p in src["pads"]:
                px, py = src["x"] + p["x"], src["y"] + p["y"]
                d = (px - dst["x"]) ** 2 + (py - dst["y"]) ** 2
                if best is None or d < best[0]:
                    best = (d, px, py, p["name"])
            return (best[1], best[2], best[3]) if best else (src["x"], src["y"], "1")

        ax, ay, apad = closest(a, b)
        bx, by_, bpad = closest(b, a)
        entry["nodes"].append({"ref": a["ref"], "pad": apad})
        entry["nodes"].append({"ref": b["ref"], "pad": bpad})
        width = TRACE_WIDTH[cls]
        midx = round((ax + bx) / 2, 3)
        for x1, y1, x2, y2 in (
            (ax, ay, midx, ay),
            (midx, ay, midx, by_),
            (midx, by_, bx, by_),
        ):
            if abs(x1 - x2) < 0.01 and abs(y1 - y2) < 0.01:
                continue
            traces.append({
                "x1": round(x1, 3), "y1": round(y1, 3), "x2": round(x2, 3), "y2": round(y2, 3),
                "width": width, "net": name, "net_class": cls,
                "layer": "F.Cu" if cls != "ground" else "B.Cu",
            })

    vias = [
        {"x": t["x2"], "y": t["y2"], "d": 0.8, "drill": 0.4, "net": t["net"]}
        for t in traces if t["net_class"] == "ground"
    ][:24]

    keepouts = []
    for f in fps:
        if _needs_antenna_keepout(f):
            keepouts.append({
                "name": f"{f['ref']} ANTENNA KEEPOUT",
                "x": round(f["x"] - f["w"] / 2 - 1.0, 2),
                "y": round(f["y"] - f["h"] / 2 - 1.0, 2),
                "w": round(f["w"] + 2.0, 2),
                "h": round(min(f["h"], 8.0) + 2.0, 2),
                "reason": "No copper / no ground pour under the module antenna",
            })

    holes = [
        {"x": 3.0, "y": 3.0, "d": 3.2},
        {"x": round(board_w - 3.0, 2), "y": 3.0, "d": 3.2},
        {"x": 3.0, "y": round(board_h - 3.0, 2), "d": 3.2},
        {"x": round(board_w - 3.0, 2), "y": round(board_h - 3.0, 2), "d": 3.2},
    ]

    return {
        "board": {"w": round(board_w, 1), "h": round(board_h, 1), "layers": layers},
        "footprints": fps,
        "traces": traces,
        "vias": vias,
        "mounting_holes": holes,
        "keepouts": keepouts,
        "nets": sorted(net_index.values(), key=lambda n: (n["net_class"] != "power", n["name"])),
        "source": "computed",
    }


# ── public entry ─────────────────────────────────────────────────────────────

def build_layout(
    pcb_path: Optional[str],
    components: list[dict[str, Any]],
    nets: list[dict[str, Any]],
    board: dict[str, float],
    layers: int = 2,
) -> dict[str, Any]:
    """
    Produce the layout document for the frontend.
    Prefers geometry read back from the routed KiCad board; falls back to the
    server-side placement/routing engine over the same real components + nets.
    """
    board_w = float(board.get("w") or 60.0)
    board_h = float(board.get("h") or 45.0)

    computed = _compute_layout(components, nets, board_w, board_h, layers)

    if pcb_path and Path(pcb_path).exists():
        try:
            parsed = _parse_kicad_pcb(pcb_path)
            if parsed["footprints"]:
                by_ref = {f["ref"]: f for f in parsed["footprints"]}
                for f in computed["footprints"]:
                    real = by_ref.get(f["ref"])
                    if real:
                        f.update({k: real[k] for k in ("x", "y", "rot", "w", "h")})
                        if real["pads"]:
                            f["pads"] = [
                                {**p, "x": p["x"], "y": p["y"]} for p in real["pads"]
                            ]
                if parsed["traces"]:
                    for t in parsed["traces"]:
                        t["net_class"] = net_class(t.get("net", ""))
                        t["width"] = t.get("width") or TRACE_WIDTH[t["net_class"]]
                    computed["traces"] = parsed["traces"]
                if parsed["vias"]:
                    computed["vias"] = parsed["vias"]
                computed["source"] = "kicad"
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("kicad_pcb parse failed (%s) — using computed layout", exc)

    return computed
