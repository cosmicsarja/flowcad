"""
kicad_scripts/run_drc.py
─────────────────────────
Run DRC via kicad-cli and parse JSON results.

Usage (standalone):
    python run_drc.py <board.kicad_pcb> [--output drc.json]
"""
from __future__ import annotations

import json
import subprocess
import sys
import os
import tempfile
from pathlib import Path

KICAD_CLI = os.environ.get("KICAD_CLI_PATH", "kicad-cli")


def run_drc(pcb_path: str, output_path: str | None = None) -> dict:
    """
    Run DRC and return structured results.

    Returns:
        {
          "errors": int,
          "warnings": int,
          "unconnected": int,
          "violations": [{"severity": str, "description": str, "type": str}],
          "raw_output": str,
        }
    """
    with tempfile.TemporaryDirectory() as tmp:
        drc_out = output_path or os.path.join(tmp, "drc.json")
        cmd = [
            KICAD_CLI, "pcb", "drc",
            "--output", drc_out,
            "--format", "json",
            "--all-track-errors",
            pcb_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        raw = result.stdout + result.stderr

        if not Path(drc_out).exists():
            return {
                "errors": 0,
                "warnings": 0,
                "unconnected": 0,
                "violations": [],
                "raw_output": raw,
                "note": "DRC output not generated (kicad-cli may not be installed)",
            }

        return _parse_drc_json(drc_out, raw)


def _parse_drc_json(drc_path: str, raw: str) -> dict:
    try:
        with open(drc_path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        return {
            "errors": 0, "warnings": 0, "unconnected": 0,
            "violations": [], "raw_output": raw, "parse_error": str(e),
        }

    violations_raw = data.get("violations", [])
    unconnected = data.get("unconnected_items", [])

    violations = []
    for v in violations_raw:
        sev = v.get("severity", "warning").lower()
        desc = v.get("description", "")
        vtype = v.get("type", "")
        violations.append({"severity": sev, "description": desc, "type": vtype})

    errors = sum(1 for v in violations if v["severity"] == "error")
    warnings = sum(1 for v in violations if v["severity"] == "warning")

    return {
        "errors": errors,
        "warnings": warnings,
        "unconnected": len(unconnected),
        "violations": violations,
        "raw_output": raw,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_drc.py <board.kicad_pcb> [output.json]")
        sys.exit(1)
    out = sys.argv[2] if len(sys.argv) > 2 else None
    result = run_drc(sys.argv[1], out)
    print(
        f"DRC: {result['errors']} errors, {result['warnings']} warnings, "
        f"{result['unconnected']} unconnected"
    )
    for v in result["violations"][:10]:
        print(f"  [{v['severity'].upper()}] {v['type']}: {v['description'][:80]}")
