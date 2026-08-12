"""
kicad_scripts/import_netlist.py
────────────────────────────────
Import a KiCad netlist (.net) into an existing .kicad_pcb board file
using the pcbnew Python API.

Usage (standalone):
    python import_netlist.py <netlist.net> <board.kicad_pcb>
"""
from __future__ import annotations

import sys
import os

KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")
if KICAD_SCRIPTING:
    sys.path.insert(0, KICAD_SCRIPTING)


def import_netlist(netlist_path: str, pcb_path: str) -> None:
    """Import netlist into PCB file in-place."""
    import pcbnew  # type: ignore

    board = pcbnew.LoadBoard(pcb_path)
    netlist = pcbnew.NETLIST()

    reader = pcbnew.KICAD_NETLIST_READER(netlist_path, netlist)
    reader.LoadNetlist()

    board.UpdateComponents(netlist, board)
    pcbnew.SaveBoard(pcb_path, board)
    print(f"Netlist imported: {netlist_path} → {pcb_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python import_netlist.py <netlist.net> <board.kicad_pcb>")
        sys.exit(1)
    import_netlist(sys.argv[1], sys.argv[2])
