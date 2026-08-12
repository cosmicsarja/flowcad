"""
kicad_scripts/export_fab.py
────────────────────────────
Export all fabrication files via kicad-cli:
  - Gerber X2 (copper, silk, mask, edge)
  - Drill (Excellon PTH + NPTH)
  - STEP 3D model

Usage (standalone):
    python export_fab.py <board.kicad_pcb> <output_dir>
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

KICAD_CLI = os.environ.get("KICAD_CLI_PATH", "kicad-cli")


def export_all(pcb_path: str, output_dir: str) -> dict[str, str]:
    """
    Export all fab files. Returns dict of {artifact_name: path}.
    Raises RuntimeError if any critical export fails.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    results = {}

    # ── Gerbers ──────────────────────────────────────────────────────────
    gerber_dir = out / "gerbers"
    gerber_dir.mkdir(exist_ok=True)
    _run([
        KICAD_CLI, "pcb", "export", "gerbers",
        "--output", str(gerber_dir),
        "--layers", "F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts,F.Paste,B.Paste",
        "--no-protel-ext",
        "--use-drill-file-origin",
        pcb_path,
    ], "Gerber export")
    results["gerbers"] = str(gerber_dir)

    # ── Drill ─────────────────────────────────────────────────────────────
    drill_dir = out / "drill"
    drill_dir.mkdir(exist_ok=True)
    _run([
        KICAD_CLI, "pcb", "export", "drill",
        "--output", str(drill_dir),
        "--format", "excellon",
        "--drill-origin", "absolute",
        "--excellon-separate-th",
        pcb_path,
    ], "Drill export")
    results["drill"] = str(drill_dir)

    # ── STEP ──────────────────────────────────────────────────────────────
    step_path = out / "board.step"
    _run([
        KICAD_CLI, "pcb", "export", "step",
        "--output", str(step_path),
        "--no-dnp",
        "--subst-models",
        pcb_path,
    ], "STEP export", critical=False)
    results["step"] = str(step_path)

    return results


def _run(cmd: list[str], label: str, critical: bool = True) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        msg = f"{label} failed (exit {result.returncode}): {result.stderr[:200]}"
        if critical:
            raise RuntimeError(msg)
        else:
            print(f"WARNING: {msg}", file=sys.stderr)
    else:
        print(f"✅ {label} completed")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python export_fab.py <board.kicad_pcb> <output_dir>")
        sys.exit(1)
    files = export_all(sys.argv[1], sys.argv[2])
    for name, path in files.items():
        print(f"  {name}: {path}")
