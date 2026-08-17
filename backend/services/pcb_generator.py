"""
services/pcb_generator.py
──────────────────────────
Stage 5: POST /generate-pcb
  Input : PcbInput  (netlist_path + board_constraints)
  Output: PcbOutput (path to .kicad_pcb file + board dimensions)

Tries pcbnew Python API first, falls back to kicad-cli, falls back to
generating a minimal valid .kicad_pcb skeleton directly.
"""
from __future__ import annotations

import logging
import os
import subprocess
import uuid
from pathlib import Path

from schemas.requirements import PcbInput, PcbOutput, BoardConstraints

logger = logging.getLogger(__name__)

WORK_DIR = Path(os.environ.get("WORK_DIR", "./tmp"))
KICAD_CLI = os.environ.get("KICAD_CLI_PATH", "kicad-cli")
KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")


def generate_pcb(inp: PcbInput) -> PcbOutput:
    """Create a .kicad_pcb file from the netlist."""
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    project_id = inp.project_id or str(uuid.uuid4())
    out_dir = WORK_DIR / project_id
    out_dir.mkdir(parents=True, exist_ok=True)
    pcb_path = str(out_dir / "board.kicad_pcb")

    bc = inp.board_constraints

    try:
        _generate_via_pcbnew(inp.netlist_path, pcb_path, bc)
        logger.info("PCB generated via pcbnew: %s", pcb_path)
    except Exception as exc:
        logger.warning("pcbnew failed (%s) — trying kicad-cli", exc)
        try:
            _generate_via_cli(inp.netlist_path, pcb_path, bc)
            logger.info("PCB generated via kicad-cli: %s", pcb_path)
        except Exception as exc2:
            logger.warning("kicad-cli failed (%s) — using fallback skeleton", exc2)
            _generate_skeleton_pcb(pcb_path, bc)
            logger.info("PCB skeleton generated: %s", pcb_path)

    return PcbOutput(
        pcb_path=pcb_path,
        board={"w": bc.max_width_mm, "h": bc.max_height_mm},
        footprint_count=_count_footprints(pcb_path),
        project_id=project_id,
    )


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

    comp_pattern = re.compile(r'\\(comp \\(ref "([^"]+)"\\).*?\\(footprint "([^":]+):([^"]+)"\\)')
    for match in comp_pattern.finditer(netlist_data):
        ref, lib_name, fp_name = match.group(1), match.group(2), match.group(3)
        try:
            fp = pcbnew.FootprintLoad(os.path.join(fp_dir, lib_name + ".pretty"), fp_name)
            if fp:
                fp.SetReference(ref)
                board.Add(fp)
        except:
            pass

    net_pattern = re.compile(r'\\(net \\(code "([^"]+)"\\) \\(name "([^"]+)"\\)(.*?)\\)', re.DOTALL)
    node_pattern = re.compile(r'\\(node \\(ref "([^"]+)"\\) \\(pin "([^"]+)"\\)\\)')
    
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


def _generate_via_cli(netlist_path: str, pcb_path: str, bc: BoardConstraints) -> None:
    """Call kicad-cli to import netlist."""
    # First create an empty board skeleton
    _generate_skeleton_pcb(pcb_path, bc)
    cmd = [
        KICAD_CLI, "pcb", "import-netlist",
        "--input", netlist_path,
        "--output", pcb_path,
        pcb_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"kicad-cli import-netlist failed: {result.stderr}")


def _generate_skeleton_pcb(pcb_path: str, bc: BoardConstraints) -> None:
    """
    Write a minimal valid .kicad_pcb file with board outline only.
    This is the fallback when KiCad is not installed.
    """
    w = bc.max_width_mm
    h = bc.max_height_mm
    layers = bc.layers
    layer_list = _kicad_layer_list(layers)

    content = f"""(kicad_pcb
  (version 20221018)
  (generator flowcad)
  (general
    (thickness 1.6)
  )
  (paper "A4")
  (layers
{layer_list}
  )
  (setup
    (pad_to_mask_clearance 0.051)
    (solder_mask_min_width 0.25)
    (pcbplotparams
      (layerselection 0x00010fc_ffffffff)
      (outputformat 1)
      (mirror false)
      (drillshape 0)
      (scaleselection 1)
      (outputdirectory "gerbers/")
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
    (tstamp "{uuid.uuid4()}")
  )
)
"""
    Path(pcb_path).write_text(content)


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


def _count_footprints(pcb_path: str) -> int:
    try:
        text = Path(pcb_path).read_text()
        return text.count("(footprint ")
    except Exception:
        return 0
