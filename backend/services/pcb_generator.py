"""
services/pcb_generator.py
──────────────────────────
Stage 5: POST /generate-pcb
  Input : PcbInput  (netlist_path + board_constraints)
  Output: PcbOutput (path to .kicad_pcb file + board dimensions)

Tries pcbnew Python API first, falls back to kicad-cli, falls back to
generating a .kicad_pcb file derived from the ACTUAL project netlist so
that every design is unique to its prompt/components.

FIX (2026-10-31):
  The old _generate_skeleton_pcb wrote HARDCODED components (R1, C1, U1,
  D1, J1) for every project, causing all schematics and PCB layouts to look
  identical.  The replacement _generate_netlist_pcb reads the actual netlist
  and generates footprints for every real component.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import subprocess
import uuid
from pathlib import Path

from schemas.requirements import PcbInput, PcbOutput, BoardConstraints

logger = logging.getLogger(__name__)

WORK_DIR = Path(os.environ.get("WORK_DIR", "./tmp"))
KICAD_CLI = os.environ.get("KICAD_CLI_PATH", "kicad-cli")
KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _hash_netlist(netlist_path: str) -> str:
    """Return a short SHA256 hex digest of the netlist file for logging."""
    try:
        data = Path(netlist_path).read_bytes()
        return hashlib.sha256(data).hexdigest()[:12]
    except Exception:
        return "unavailable"


def _parse_netlist_components(netlist_path: str) -> list[dict]:
    """
    Parse a KiCad netlist (.net) file and return a list of component dicts:
      [{"ref": "U1", "value": "ESP32-WROOM-32", "footprint": "..."}, ...]
    Falls back to empty list if the file cannot be read/parsed.
    """
    try:
        text = Path(netlist_path).read_text()
    except Exception:
        return []

    components: list[dict] = []
    # KiCad netlist format: (comp (ref "U1") (value "ESP32") (footprint "Mod:X"))
    for m in re.finditer(
        r'\(comp\s+\(ref\s+"([^"]+)"\)\s+\(value\s+"([^"]+)"\)(?:\s+\(footprint\s+"([^"]*)"\))?',
        text,
        re.DOTALL,
    ):
        components.append({
            "ref": m.group(1),
            "value": m.group(2),
            "footprint": m.group(3) or "",
        })

    return components


# ── Public entry-point ────────────────────────────────────────────────────────

def generate_pcb(inp: PcbInput) -> PcbOutput:
    """Create a .kicad_pcb file from the netlist."""
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    project_id = inp.project_id or str(uuid.uuid4())
    out_dir = WORK_DIR / project_id
    out_dir.mkdir(parents=True, exist_ok=True)
    pcb_path = str(out_dir / "board.kicad_pcb")

    bc = inp.board_constraints

    # Parse the actual netlist components for this project so we can use them
    # in the fallback PCB generator (guarantees unique boards per prompt).
    netlist_components = _parse_netlist_components(inp.netlist_path)
    netlist_hash = _hash_netlist(inp.netlist_path)

    logger.info(
        "[%s] Stage 5 — PCB generation start | netlist=%s | netlist_hash=%s | component_count=%d",
        project_id, inp.netlist_path, netlist_hash, len(netlist_components),
    )

    try:
        _generate_via_pcbnew(inp.netlist_path, pcb_path, bc)
        fp_count = _count_footprints(pcb_path)
        logger.info(
            "[%s] PCB generated via pcbnew: %s | footprints=%d",
            project_id, pcb_path, fp_count,
        )
    except Exception as exc:
        logger.warning("[%s] pcbnew failed (%s) — trying kicad-cli", project_id, exc)
        try:
            _generate_via_cli(inp.netlist_path, pcb_path, bc)
            fp_count = _count_footprints(pcb_path)
            logger.info(
                "[%s] PCB generated via kicad-cli: %s | footprints=%d",
                project_id, pcb_path, fp_count,
            )
        except Exception as exc2:
            logger.warning(
                "[%s] kicad-cli failed (%s) — using netlist-derived PCB (component_count=%d)",
                project_id, exc2, len(netlist_components),
            )
            # KEY FIX: pass the actual parsed components so every project is unique
            _generate_netlist_pcb(pcb_path, bc, netlist_components, project_id)
            fp_count = _count_footprints(pcb_path)
            logger.info(
                "[%s] Netlist-derived PCB generated: %s | footprints=%d | netlist_hash=%s",
                project_id, pcb_path, fp_count, netlist_hash,
            )

    fp_count = _count_footprints(pcb_path)
    logger.info(
        "[%s] Stage 5 complete — pcb_path=%s | footprint_count=%d | netlist_hash=%s",
        project_id, pcb_path, fp_count, netlist_hash,
    )

    return PcbOutput(
        pcb_path=pcb_path,
        board={"w": bc.max_width_mm, "h": bc.max_height_mm},
        footprint_count=fp_count,
        project_id=project_id,
    )


# ── pcbnew path ───────────────────────────────────────────────────────────────

def _generate_via_pcbnew(netlist_path: str, pcb_path: str, bc: BoardConstraints) -> None:
    """Use KiCad's bundled Python to invoke pcbnew API natively."""
    # Write a temporary script to execute in the KiCad python environment
    script = f"""
import pcbnew
import sys

try:
    board = pcbnew.CreateEmptyBoard()
    ds = board.GetDesignSettings()
    ds.m_MinTrackWidth = pcbnew.FromMM({bc.min_trace_mm})
    ds.m_MinClearance = pcbnew.FromMM({bc.min_clearance_mm})
    ds.m_CopperLayerCount = {bc.layers}

    # Outline
    outline = pcbnew.PCB_SHAPE(board)
    outline.SetShape(pcbnew.SHAPE_T_RECT)
    outline.SetStart(pcbnew.VECTOR2I(pcbnew.FromMM(0), pcbnew.FromMM(0)))
    outline.SetEnd(pcbnew.VECTOR2I(pcbnew.FromMM({bc.max_width_mm}), pcbnew.FromMM({bc.max_height_mm})))
    outline.SetLayer(pcbnew.Edge_Cuts)
    outline.SetWidth(pcbnew.FromMM(0.05))
    board.Add(outline)

    # Read Netlist manually (KiCad 8 removed KICAD_NETLIST_READER)
    import re
    import os
    with open('{netlist_path}', 'r') as f:
        netlist_data = f.read()

    fp_dir = os.environ.get("KICAD8_FOOTPRINT_DIR", "/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints")
    if not os.path.exists(fp_dir):
        fp_dir = "/usr/share/kicad/footprints"

    # Standard fallback footprints per component prefix
    def _fallback_fp(ref):
        u = ref.upper()
        if u.startswith('R'):
            return ("Resistor_SMD", "R_0603_1608Metric")
        elif u.startswith('C'):
            return ("Capacitor_SMD", "C_0603_1608Metric")
        elif u.startswith('D') or 'LED' in u:
            return ("LED_SMD", "LED_0805_2012Metric")
        elif u.startswith('J') or u.startswith('P'):
            return ("Connector_PinHeader_2.54mm", "PinHeader_1x02_P2.54mm_Vertical")
        elif u.startswith('Q'):
            return ("Package_TO_SOT_SMD", "SOT-23")
        elif u.startswith('SW'):
            return ("Button_Switch_SMD", "SW_Push_SPST_NO_Alps_SKRK")
        elif u.startswith('RV'):
            return ("Potentiometer_THT", "Potentiometer_Bourns_3296W_Vertical")
        elif u.startswith('BT'):
            return ("Battery", "BatteryHolder_Keystone_1058_1x2032")
        else:
            return ("Package_SO", "SOIC-8_3.9x4.9mm_P1.27mm")

    comp_pattern = re.compile(r'\\(comp\\s+\\(ref\\s+"([^"]+)"\\).*?\\(footprint\\s+"([^":]+):([^"]+)"\\)')
    all_comps_pattern = re.compile(r'\\(comp\\s+\\(ref\\s+"([^"]+)"\\)')
    
    seen_refs = set()
    for match in comp_pattern.finditer(netlist_data):
        ref, lib_name, fp_name = match.group(1), match.group(2), match.group(3)
        seen_refs.add(ref)
        fp = None
        try:
            fp = pcbnew.FootprintLoad(os.path.join(fp_dir, lib_name + ".pretty"), fp_name)
        except:
            fp = None
        if not fp:
            f_lib, f_name = _fallback_fp(ref)
            try:
                fp = pcbnew.FootprintLoad(os.path.join(fp_dir, f_lib + ".pretty"), f_name)
            except:
                pass
        if fp:
            fp.SetReference(ref)
            board.Add(fp)

    for match in all_comps_pattern.finditer(netlist_data):
        ref = match.group(1)
        if ref not in seen_refs:
            f_lib, f_name = _fallback_fp(ref)
            try:
                fp = pcbnew.FootprintLoad(os.path.join(fp_dir, f_lib + ".pretty"), f_name)
                if fp:
                    fp.SetReference(ref)
                    board.Add(fp)
                    seen_refs.add(ref)
            except:
                pass

    net_pattern = re.compile(r'\\(net\\s+\\(code\\s+"(\\d+)"\\)\\s+\\(name\\s+"([^"]+)"\\)([\\s\\S]*?)(?=\\n\\s*\\)\\s*(?:\\n|\\(net|\\Z))')
    node_pattern = re.compile(r'\\(node\\s+\\(ref\\s+"([^"]+)"\\)\\s+\\(pin\\s+"([^"]+)"\\)\\)')
    
    for match in net_pattern.finditer(netlist_data):
        code, name, nodes_str = int(match.group(1)), match.group(2), match.group(3)
        net = pcbnew.NETINFO_ITEM(board, name, code)
        board.Add(net)
        
        for node_match in node_pattern.finditer(nodes_str):
            ref, pin = node_match.group(1), node_match.group(2)
            fp = board.FindFootprintByReference(ref)
            if fp:
                pad = fp.FindPadByNumber(pin)
                if pad:
                    pad.SetNet(net)

    pcbnew.SaveBoard('{pcb_path}', board)
except Exception as e:
    print(f"Error: {{e}}", file=sys.stderr)
    sys.exit(1)
"""
    script_path = netlist_path + ".import.py"
    Path(script_path).write_text(script)
    
    kicad_python = "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3"
    if not os.path.exists(kicad_python):
        # Fallback to system python (might have pcbnew installed via package manager)
        kicad_python = "python3"
        
    res = subprocess.run([kicad_python, script_path], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"pcbnew script failed: {res.stderr}")


# ── kicad-cli path ────────────────────────────────────────────────────────────

def _generate_via_cli(netlist_path: str, pcb_path: str, bc: BoardConstraints) -> None:
    """Call kicad-cli to import netlist."""
    # First create an empty board skeleton (no components — CLI will populate from netlist)
    _generate_empty_board(pcb_path, bc)
    cmd = [
        KICAD_CLI, "pcb", "import-netlist",
        "--input", netlist_path,
        "--output", pcb_path,
        pcb_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"kicad-cli import-netlist failed: {result.stderr}")


def _generate_empty_board(pcb_path: str, bc: BoardConstraints) -> None:
    """Write a minimal .kicad_pcb with only the board outline — no footprints."""
    w = bc.max_width_mm
    h = bc.max_height_mm
    layers = bc.layers
    layer_list = _kicad_layer_list(layers)
    u = lambda: str(uuid.uuid4())  # noqa: E731

    content = f"""(kicad_pcb
  (version 20260206)
  (generator "flowcad")
  (generator_version "10.0")
  (general
    (thickness 1.6)
    (legacy_teardrops no)
  )
  (paper "A4")
  (layers
{layer_list}
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (pcbplotparams
      (layerselection 0x00000000_00000000_55555555_5755f5ff)
      (outputformat 1)
      (mirror no)
      (drillshape 1)
      (scaleselection 1)
      (outputdirectory "")
    )
  )
  (net 0 "")
  (net 1 "+3V3")
  (net 2 "GND")
  (net 3 "+5V")

  (gr_rect
    (start 0 0)
    (end {w} {h})
    (stroke (width 0.05) (type solid))
    (layer "Edge.Cuts")
    (uuid "{u()}")
  )
)
"""
    Path(pcb_path).write_text(content)


# ── Netlist-derived PCB (the FIXED fallback) ──────────────────────────────────

# Per-ref-prefix: (lib_name, fp_name, w_mm, h_mm)
_FOOTPRINT_MAP: dict[str, tuple[str, str, float, float]] = {
    "R":   ("Resistor_SMD",  "R_0603_1608Metric",          1.6,  0.8),
    "C":   ("Capacitor_SMD", "C_0603_1608Metric",           1.6,  0.8),
    "L":   ("Inductor_SMD",  "L_0603_1608Metric",           1.6,  0.8),
    "D":   ("LED_SMD",       "LED_0805_2012Metric",         2.0,  1.2),
    "LED": ("LED_SMD",       "LED_0805_2012Metric",         2.0,  1.2),
    "Q":   ("Package_TO_SOT_SMD", "SOT-23",                 2.9,  2.4),
    "SW":  ("Button_Switch_SMD",  "SW_Push_SPST_NO_Alps_SKRK", 5.0, 5.0),
    "J":   ("Connector_PinHeader_2.54mm", "PinHeader_1x02_P2.54mm_Vertical", 2.54, 5.08),
    "P":   ("Connector_PinHeader_2.54mm", "PinHeader_1x02_P2.54mm_Vertical", 2.54, 5.08),
    "BT":  ("Battery",       "BatteryHolder_Keystone_1058_1x2032", 20.0, 12.0),
    "U":   ("Package_SO",    "SOIC-8_3.9x4.9mm_P1.27mm",    5.0,  4.0),
    "IC":  ("Package_SO",    "SOIC-8_3.9x4.9mm_P1.27mm",    5.0,  4.0),
    "K":   ("Relay_THT",     "Relay_SPDT_Omron-G5LE-1-VD",  14.9, 19.0),
    "T":   ("Transformer_THT", "Transformer_Toroid_Horizontal", 18.0, 18.0),
    "F":   ("Fuse",          "Fuse_1812_4532Metric",         4.5,  3.2),
    "RT":  ("Device",        "R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal", 12.0, 2.5),
    "RV":  ("Potentiometer_THT", "Potentiometer_Bourns_3296W_Vertical", 10.0, 10.0),
    "Y":   ("Crystal",       "Crystal_SMD_3225-4Pin_3.2x2.5mm", 3.2, 2.5),
    "FL":  ("Filter",        "C_0805_2012Metric",            2.0,  1.2),
    "BR":  ("Diode_SMD",     "D_GBJ",                        7.0,  7.0),
}

_DEFAULT_FP = ("Package_SO", "SOIC-8_3.9x4.9mm_P1.27mm", 5.0, 4.0)


def _ref_prefix(ref: str) -> str:
    """Extract the letter prefix from a reference designator (e.g. 'U1' → 'U')."""
    return re.match(r"^([A-Za-z]+)", ref).group(1).upper() if re.match(r"^([A-Za-z]+)", ref) else "U"


def _footprint_for_ref(ref: str) -> tuple[str, str, float, float]:
    prefix = _ref_prefix(ref)
    # Try progressively shorter prefixes
    for length in range(len(prefix), 0, -1):
        candidate = prefix[:length]
        if candidate in _FOOTPRINT_MAP:
            return _FOOTPRINT_MAP[candidate]
    return _DEFAULT_FP


def _render_footprint_block(
    ref: str,
    value: str,
    footprint_str: str,
    x: float,
    y: float,
    net1: str,
    net2: str,
    net1_code: int,
    net2_code: int,
    u_fn,  # callable -> str uuid
) -> str:
    """
    Render a full KiCad s-expression footprint block for one component.
    Uses 2-pad SMD layout derived from the component ref prefix.
    """
    lib_fp, fp_name, w, h = _footprint_for_ref(ref)
    # Use the netlist footprint if it looks valid (contains a colon = lib:name)
    if footprint_str and ":" in footprint_str:
        parts = footprint_str.split(":", 1)
        lib_fp = parts[0]
        fp_name = parts[1]

    half_w = round(w / 2, 3)
    half_h = round(h / 2, 3)
    pad_w = round(min(1.5, w * 0.35), 3)
    pad_h = round(min(1.5, h * 0.55), 3)

    # Determine if THT or SMD by prefix heuristic
    is_tht = _ref_prefix(ref) in ("J", "P", "BT", "K", "T", "RT", "RV")
    pad_type = "thru_hole oval" if is_tht else "smd roundrect"
    pad_layers_smd = '(layers "F.Cu" "F.Mask" "F.Paste")'
    pad_layers_tht = '(layers "*.Cu" "*.Mask")'
    drill_stmt = '      (drill 0.8)\n' if is_tht else ''
    pad_layers = pad_layers_tht if is_tht else pad_layers_smd
    rratio = '' if is_tht else '      (roundrect_rratio 0.25)\n'

    return f"""  (footprint "{lib_fp}:{fp_name}"
    (layer "F.Cu")
    (uuid "{u_fn()}")
    (at {x} {y})
    (property "Reference" "{ref}"
      (at 0 {-half_h - 1.0} 0)
      (layer "F.SilkS")
      (uuid "{u_fn()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "{value}"
      (at 0 {half_h + 1.0} 0)
      (layer "F.Fab")
      (uuid "{u_fn()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (attr {"thru_hole" if is_tht else "smd"})
    (fp_rect
      (start {-half_w} {-half_h}) (end {half_w} {half_h})
      (stroke (width 0.05) (type solid))
      (fill no)
      (layer "F.CrtYd") (uuid "{u_fn()}")
    )
    (pad "1" {pad_type}
      (at {-half_w + pad_w/2} 0)
      (size {pad_w} {pad_h})
{drill_stmt}{pad_layers}
{rratio}      (net {net1_code} "{net1}")
      (uuid "{u_fn()}")
    )
    (pad "2" {pad_type}
      (at {half_w - pad_w/2} 0)
      (size {pad_w} {pad_h})
{drill_stmt}{pad_layers}
{rratio}      (net {net2_code} "{net2}")
      (uuid "{u_fn()}")
    )
  )
"""


def _generate_netlist_pcb(
    pcb_path: str,
    bc: BoardConstraints,
    components: list[dict],
    project_id: str,
) -> None:
    """
    Generate a valid .kicad_pcb whose footprints are derived from the actual
    project netlist components.  This replaces the old hardcoded skeleton that
    produced the same R1/C1/U1/D1/J1 layout for every project.

    Placement: orthogonal grid, 3 columns (connectors left, ICs centre,
    passives right), with 3 mm margin and 2 mm gap.
    """
    if not components:
        logger.warning(
            "[%s] No netlist components to build PCB from — writing empty board outline",
            project_id,
        )
        _generate_empty_board(pcb_path, bc)
        return

    w = bc.max_width_mm
    h = bc.max_height_mm
    layers = bc.layers
    layer_list = _kicad_layer_list(layers)

    _uuid_counter = [0]
    def _u() -> str:
        _uuid_counter[0] += 1
        return str(uuid.uuid4())

    # Build net table from component names (minimal power nets always present)
    net_table: dict[str, int] = {"": 0, "+3V3": 1, "GND": 2, "+5V": 3}
    net_counter = [4]

    def get_net_code(name: str) -> int:
        if name not in net_table:
            net_table[name] = net_counter[0]
            net_counter[0] += 1
        return net_table[name]

    # Assign power nets to component pads based on ref prefix convention
    def _nets_for_ref(ref: str) -> tuple[str, str]:
        prefix = _ref_prefix(ref)
        if prefix in ("J", "P"):
            return "+5V", "GND"
        elif prefix in ("C",):
            return "+3V3", "GND"
        elif prefix in ("R",):
            return "+3V3", "GND"
        elif prefix in ("D", "LED"):
            return "+3V3", "GND"
        elif prefix in ("Q",):
            return "+3V3", "GND"
        elif prefix in ("K",):
            return "+5V", "GND"
        elif prefix in ("BT",):
            return "+5V", "GND"
        elif prefix in ("T",):
            return "+5V", "GND"
        else:
            return "+3V3", "GND"

    # Categorise for placement
    connectors, ics, passives, others = [], [], [], []
    for comp in components:
        ref = comp.get("ref", "U?")
        prefix = _ref_prefix(ref)
        if prefix in ("J", "P", "CON"):
            connectors.append(comp)
        elif prefix in ("U", "IC", "Q", "K", "T", "BR"):
            ics.append(comp)
        elif prefix in ("R", "C", "L", "D", "LED", "F", "FL", "RT", "RV", "Y", "BT"):
            passives.append(comp)
        else:
            others.append(comp)

    # Assign (x, y) positions in a grid within each column
    margin = 3.0
    col_gap = 2.0
    row_gap = 1.5

    positioned: list[tuple[dict, float, float]] = []

    def assign_column(items: list[dict], col_x: float) -> float:
        """Place items in a column; returns the next free X after this column."""
        max_w = 0.0
        y = margin
        for comp in items:
            ref = comp.get("ref", "U?")
            _, _, cw, ch = _footprint_for_ref(ref)
            # Wrap to next column if we'd overflow the board
            safe_x = min(col_x, max(margin, w - cw - margin))
            safe_y = min(y, max(margin, h - ch - margin))
            positioned.append((comp, round(safe_x + cw / 2, 3), round(safe_y + ch / 2, 3)))
            y += ch + row_gap
            if y + ch > h - margin:
                col_x += cw + col_gap * 2
                y = margin
            max_w = max(max_w, cw)
        return col_x + max_w + col_gap * 2

    conn_col = margin
    ic_col = assign_column(connectors, conn_col)
    pas_col = assign_column(ics, ic_col)
    oth_col = assign_column(passives, pas_col)
    assign_column(others, oth_col)

    # Build footprint blocks
    net_lines = "\n".join(
        f'  (net {code} "{name}")' for name, code in sorted(net_table.items(), key=lambda x: x[1])
    )

    fp_blocks: list[str] = []
    for comp, cx, cy in positioned:
        ref = comp.get("ref", "U?")
        value = comp.get("value", ref)
        footprint_str = comp.get("footprint", "")
        net1_name, net2_name = _nets_for_ref(ref)
        fp_blocks.append(_render_footprint_block(
            ref=ref,
            value=value,
            footprint_str=footprint_str,
            x=cx,
            y=cy,
            net1=net1_name,
            net2=net2_name,
            net1_code=get_net_code(net1_name),
            net2_code=get_net_code(net2_name),
            u_fn=_u,
        ))

    fp_text = "\n".join(fp_blocks)

    content = f"""(kicad_pcb
  (version 20260206)
  (generator "flowcad")
  (generator_version "10.0")
  (general
    (thickness 1.6)
    (legacy_teardrops no)
  )
  (paper "A4")
  (layers
{layer_list}
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (pcbplotparams
      (layerselection 0x00000000_00000000_55555555_5755f5ff)
      (outputformat 1)
      (mirror no)
      (drillshape 1)
      (scaleselection 1)
      (outputdirectory "")
    )
  )

{net_lines}

{fp_text}
  (gr_rect
    (start 0 0)
    (end {w} {h})
    (stroke (width 0.05) (type solid))
    (layer "Edge.Cuts")
    (uuid "{_u()}")
  )
)
"""
    Path(pcb_path).write_text(content)
    logger.info(
        "[%s] Netlist-derived PCB written with %d footprints: %s",
        project_id, len(positioned), pcb_path,
    )


# ── Layer list helper ─────────────────────────────────────────────────────────

def _kicad_layer_list(num_layers: int) -> str:
    base = [
        '    (0 "F.Cu" signal)',
        '    (31 "B.Cu" signal)',
        '    (32 "B.Adhes" user "B.Adhesive")',
        '    (33 "F.Adhes" user "F.Adhesive")',
        '    (34 "B.Paste" user)',
        '    (35 "F.Paste" user)',
        '    (36 "B.SilkS" user "B.Silkscreen")',
        '    (37 "F.SilkS" user "F.Silkscreen")',
        '    (38 "B.Mask" user)',
        '    (39 "F.Mask" user)',
        '    (44 "Edge.Cuts" user)',
        '    (49 "F.Fab" user)',
        '    (50 "B.Fab" user)',
        '    (51 "F.CrtYd" user "F.Courtyard")',
        '    (52 "B.CrtYd" user "B.Courtyard")',
    ]
    if num_layers == 4:
        base.insert(2, '    (1 "In1.Cu" power)')
        base.insert(3, '    (2 "In2.Cu" power)')
    return "\n".join(base)


# ── Footprint counter ─────────────────────────────────────────────────────────

def _count_footprints(pcb_path: str) -> int:
    try:
        text = Path(pcb_path).read_text()
        return text.count("(footprint ")
    except Exception:
        return 0
