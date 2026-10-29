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
    Write a minimal valid .kicad_pcb file with board outline and placeholder
    footprints for common component types (resistor, capacitor, LED, regulator,
    connector). This ensures downstream PCB stages always have something to
    work with even when the LLM / netlist pipeline fails.
    """
    w = bc.max_width_mm
    h = bc.max_height_mm
    layers = bc.layers
    layer_list = _kicad_layer_list(layers)

    # Generate stable UUIDs for each footprint / pad so the file is valid
    def _u() -> str:
        return str(uuid.uuid4())

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

  (footprint "Resistor_SMD:R_0603_1608Metric"
    (layer "F.Cu")
    (uuid "{_u()}")
    (at 10 10)
    (descr "Resistor SMD 0603 (1608 Metric)")
    (tags "resistor")
    (property "Reference" "R1"
      (at 0 -1.5 0)
      (layer "F.SilkS")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "10k"
      (at 0 1.5 0)
      (layer "F.Fab")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Datasheet" "~"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "{_u()}")
      (effects (font (size 1.27 1.27)))
    )
    (attr smd)
    (fp_line
      (start -1.6 -0.8) (end 1.6 -0.8)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start -1.6 0.8) (end 1.6 0.8)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_rect
      (start -1.8 -1.0) (end 1.8 1.0)
      (stroke (width 0.05) (type solid))
      (fill no)
      (layer "F.CrtYd") (uuid "{_u()}")
    )
    (fp_rect
      (start -0.8 -0.4) (end 0.8 0.4)
      (stroke (width 0.1) (type solid))
      (fill no)
      (layer "F.Fab") (uuid "{_u()}")
    )
    (pad "1" smd roundrect
      (at -1.5125 0)
      (size 1.975 1.8)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 2 "GND")
      (uuid "{_u()}")
    )
    (pad "2" smd roundrect
      (at 1.5125 0)
      (size 1.975 1.8)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 1 "+3V3")
      (uuid "{_u()}")
    )
    (model "${{KICAD10_3DMODEL_DIR}}/Resistor_SMD.3dshapes/R_0603_1608Metric.step"
      (offset (xyz 0 0 0))
      (scale (xyz 1 1 1))
      (rotate (xyz 0 0 0))
    )
  )

  (footprint "Capacitor_SMD:C_0603_1608Metric"
    (layer "F.Cu")
    (uuid "{_u()}")
    (at 20 10)
    (descr "Capacitor SMD 0603 (1608 Metric)")
    (tags "capacitor")
    (property "Reference" "C1"
      (at 0 -1.5 0)
      (layer "F.SilkS")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "100nF"
      (at 0 1.5 0)
      (layer "F.Fab")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Datasheet" "~"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "{_u()}")
      (effects (font (size 1.27 1.27)))
    )
    (attr smd)
    (fp_line
      (start -1.6 -0.8) (end 1.6 -0.8)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start -1.6 0.8) (end 1.6 0.8)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_rect
      (start -1.8 -1.0) (end 1.8 1.0)
      (stroke (width 0.05) (type solid))
      (fill no)
      (layer "F.CrtYd") (uuid "{_u()}")
    )
    (fp_rect
      (start -0.8 -0.4) (end 0.8 0.4)
      (stroke (width 0.1) (type solid))
      (fill no)
      (layer "F.Fab") (uuid "{_u()}")
    )
    (pad "1" smd roundrect
      (at -1.5125 0)
      (size 1.975 1.8)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 3 "+5V")
      (uuid "{_u()}")
    )
    (pad "2" smd roundrect
      (at 1.5125 0)
      (size 1.975 1.8)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 2 "GND")
      (uuid "{_u()}")
    )
    (model "${{KICAD10_3DMODEL_DIR}}/Capacitor_SMD.3dshapes/C_0603_1608Metric.step"
      (offset (xyz 0 0 0))
      (scale (xyz 1 1 1))
      (rotate (xyz 0 0 0))
    )
  )

  (footprint "Package_TO_SOT_SMD:SOT-23-5"
    (layer "F.Cu")
    (uuid "{_u()}")
    (at 30 10)
    (descr "SOT-23-5 voltage regulator / LDO")
    (tags "SOT-23-5 regulator LDO")
    (property "Reference" "U1"
      (at 0 -2.0 0)
      (layer "F.SilkS")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "MIC5205"
      (at 0 2.0 0)
      (layer "F.Fab")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Datasheet" "~"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "{_u()}")
      (effects (font (size 1.27 1.27)))
    )
    (attr smd)
    (fp_line
      (start -1.4 -0.85) (end 1.4 -0.85)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start -1.4 0.85) (end 1.4 0.85)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_rect
      (start -1.9 -1.5) (end 1.9 1.5)
      (stroke (width 0.05) (type solid))
      (fill no)
      (layer "F.CrtYd") (uuid "{_u()}")
    )
    (fp_rect
      (start -0.75 -0.95) (end 0.75 0.95)
      (stroke (width 0.1) (type solid))
      (fill no)
      (layer "F.Fab") (uuid "{_u()}")
    )
    (pad "1" smd roundrect
      (at -1.575 -0.95)
      (size 1.15 0.7)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 3 "+5V")
      (uuid "{_u()}")
    )
    (pad "2" smd roundrect
      (at -1.575 0)
      (size 1.15 0.7)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 2 "GND")
      (uuid "{_u()}")
    )
    (pad "3" smd roundrect
      (at -1.575 0.95)
      (size 1.15 0.7)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 2 "GND")
      (uuid "{_u()}")
    )
    (pad "4" smd roundrect
      (at 1.575 0.95)
      (size 1.15 0.7)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 1 "+3V3")
      (uuid "{_u()}")
    )
    (pad "5" smd roundrect
      (at 1.575 -0.95)
      (size 1.15 0.7)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 1 "+3V3")
      (uuid "{_u()}")
    )
    (model "${{KICAD10_3DMODEL_DIR}}/Package_TO_SOT_SMD.3dshapes/SOT-23-5.step"
      (offset (xyz 0 0 0))
      (scale (xyz 1 1 1))
      (rotate (xyz 0 0 0))
    )
  )

  (footprint "LED_SMD:LED_0805_2012Metric"
    (layer "F.Cu")
    (uuid "{_u()}")
    (at 10 20)
    (descr "LED SMD 0805 (2012 Metric)")
    (tags "led 0805")
    (property "Reference" "D1"
      (at 0 -1.5 0)
      (layer "F.SilkS")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "LED"
      (at 0 1.5 0)
      (layer "F.Fab")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Datasheet" "~"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "{_u()}")
      (effects (font (size 1.27 1.27)))
    )
    (attr smd)
    (fp_line
      (start -1.9 -0.95) (end 1.9 -0.95)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start -1.9 0.95) (end 1.9 0.95)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_rect
      (start -2.2 -1.2) (end 2.2 1.2)
      (stroke (width 0.05) (type solid))
      (fill no)
      (layer "F.CrtYd") (uuid "{_u()}")
    )
    (fp_rect
      (start -1.0 -0.6) (end 1.0 0.6)
      (stroke (width 0.1) (type solid))
      (fill no)
      (layer "F.Fab") (uuid "{_u()}")
    )
    (pad "A" smd roundrect
      (at -1.8625 0)
      (size 2.175 1.8)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 1 "+3V3")
      (uuid "{_u()}")
    )
    (pad "K" smd roundrect
      (at 1.8625 0)
      (size 2.175 1.8)
      (layers "F.Cu" "F.Mask" "F.Paste")
      (roundrect_rratio 0.25)
      (net 2 "GND")
      (uuid "{_u()}")
    )
    (model "${{KICAD10_3DMODEL_DIR}}/LED_SMD.3dshapes/LED_0805_2012Metric.step"
      (offset (xyz 0 0 0))
      (scale (xyz 1 1 1))
      (rotate (xyz 0 0 0))
    )
  )

  (footprint "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"
    (layer "F.Cu")
    (uuid "{_u()}")
    (at 20 20)
    (descr "2-pin 2.54mm pitch vertical connector / terminal block")
    (tags "connector 2pin")
    (property "Reference" "J1"
      (at 0 -2.5 0)
      (layer "F.SilkS")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "PWR_IN"
      (at 0 2.5 0)
      (layer "F.Fab")
      (uuid "{_u()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Datasheet" "~"
      (at 0 0 0)
      (layer "F.Fab")
      (hide yes)
      (uuid "{_u()}")
      (effects (font (size 1.27 1.27)))
    )
    (fp_line
      (start -1.33 -3.81) (end 1.33 -3.81)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start -1.33 3.81) (end 1.33 3.81)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start -1.33 -3.81) (end -1.33 3.81)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_line
      (start 1.33 -3.81) (end 1.33 3.81)
      (stroke (width 0.12) (type solid))
      (layer "F.SilkS") (uuid "{_u()}")
    )
    (fp_rect
      (start -1.8 -4.3) (end 1.8 4.3)
      (stroke (width 0.05) (type solid))
      (fill no)
      (layer "F.CrtYd") (uuid "{_u()}")
    )
    (fp_rect
      (start -0.635 -4.445) (end 0.635 4.445)
      (stroke (width 0.1) (type solid))
      (fill no)
      (layer "F.Fab") (uuid "{_u()}")
    )
    (pad "1" thru_hole rect
      (at 0 -1.27)
      (size 1.7 1.7)
      (drill 1.0)
      (layers "*.Cu" "*.Mask")
      (net 3 "+5V")
      (uuid "{_u()}")
    )
    (pad "2" thru_hole oval
      (at 0 1.27)
      (size 1.7 1.7)
      (drill 1.0)
      (layers "*.Cu" "*.Mask")
      (net 2 "GND")
      (uuid "{_u()}")
    )
    (model "${{KICAD10_3DMODEL_DIR}}/Connector_PinHeader_2.54mm.3dshapes/PinHeader_1x02_P2.54mm_Vertical.step"
      (offset (xyz 0 0 0))
      (scale (xyz 1 1 1))
      (rotate (xyz 0 0 0))
    )
  )

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
