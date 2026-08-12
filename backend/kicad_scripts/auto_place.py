"""
kicad_scripts/auto_place.py
────────────────────────────
Rule-based component placer using pcbnew Python API.

Algorithm:
  1. Sort footprints by bounding-box area descending (largest first)
  2. Place left-to-right in rows, respecting 3mm board edge keepout
  3. Wrap to next row when row would overflow board width

Usage (standalone):
    python auto_place.py <board.kicad_pcb> [width_mm] [height_mm]
"""
from __future__ import annotations

import sys
import os

KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")
if KICAD_SCRIPTING:
    sys.path.insert(0, KICAD_SCRIPTING)


def auto_place(pcb_path: str, width_mm: float = 60.0, height_mm: float = 45.0) -> int:
    """
    Place all footprints using grid algorithm.
    Returns number of footprints placed.
    """
    import pcbnew  # type: ignore

    board = pcbnew.LoadBoard(pcb_path)
    footprints = list(board.GetFootprints())

    if not footprints:
        print("No footprints to place.")
        pcbnew.SaveBoard(pcb_path, board)
        return 0

    def fp_area(fp):
        bb = fp.GetBoundingBox()
        return bb.GetWidth() * bb.GetHeight()

    footprints.sort(key=fp_area, reverse=True)

    MARGIN = pcbnew.FromMM(3.0)
    GAP = pcbnew.FromMM(1.5)
    board_w = pcbnew.FromMM(width_mm)
    board_h = pcbnew.FromMM(height_mm)

    x = MARGIN
    y = MARGIN
    row_h = 0
    placed = 0

    for fp in footprints:
        bb = fp.GetBoundingBox()
        fp_w = bb.GetWidth()
        fp_h = bb.GetHeight()

        if x + fp_w > board_w - MARGIN and row_h > 0:
            x = MARGIN
            y += row_h + GAP
            row_h = 0

        if y + fp_h > board_h - MARGIN:
            # Density overflow: wrap back and continue (verifier will flag it)
            y = MARGIN

        cx = x + fp_w // 2
        cy = y + fp_h // 2
        fp.SetPosition(pcbnew.VECTOR2I(cx, cy))

        x += fp_w + GAP
        row_h = max(row_h, fp_h)
        placed += 1

    pcbnew.SaveBoard(pcb_path, board)
    print(f"Placed {placed}/{len(footprints)} footprints in {pcb_path}")
    return placed


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python auto_place.py <board.kicad_pcb> [width_mm] [height_mm]")
        sys.exit(1)
    w = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    h = float(sys.argv[3]) if len(sys.argv) > 3 else 45.0
    auto_place(sys.argv[1], w, h)
