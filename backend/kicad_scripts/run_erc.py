"""
kicad_scripts/run_erc.py
─────────────────────────
Run ERC via kicad-cli and parse XML results.

Usage (standalone):
    python run_erc.py <schematic_or_netlist> [--output erc.xml]
"""
from __future__ import annotations

import subprocess
import sys
import os
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

KICAD_CLI = os.environ.get("KICAD_CLI_PATH", "kicad-cli")


def run_erc(input_path: str, output_path: str | None = None) -> dict:
    """
    Run ERC and return structured results.

    Returns:
        {
          "errors": int,
          "warnings": int,
          "violations": [{"severity": str, "description": str, "location": str}],
          "raw_output": str,
        }
    """
    with tempfile.TemporaryDirectory() as tmp:
        erc_out = output_path or os.path.join(tmp, "erc.xml")
        cmd = [
            KICAD_CLI, "sch", "erc",
            "--output", erc_out,
            "--format", "xml",
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        raw = result.stdout + result.stderr

        if not Path(erc_out).exists():
            return {
                "errors": 0,
                "warnings": 0,
                "violations": [],
                "raw_output": raw,
                "note": "ERC output file not generated (kicad-cli may not be installed)",
            }

        return _parse_erc_xml(erc_out, raw)


def _parse_erc_xml(erc_path: str, raw: str) -> dict:
    try:
        tree = ET.parse(erc_path)
        root = tree.getroot()
    except ET.ParseError as e:
        return {"errors": 0, "warnings": 0, "violations": [], "raw_output": raw, "parse_error": str(e)}

    violations = []
    for v in root.findall(".//violation") + root.findall(".//error"):
        sev = v.get("severity", "warning").lower()
        desc = ""
        loc = ""
        for child in v:
            if child.tag == "description":
                desc = child.text or ""
            if child.tag in ("pos", "position"):
                loc = f"({child.get('x', '?')},{child.get('y', '?')})"
        violations.append({"severity": sev, "description": desc, "location": loc})

    errors = sum(1 for v in violations if v["severity"] == "error")
    warnings = sum(1 for v in violations if v["severity"] == "warning")

    return {
        "errors": errors,
        "warnings": warnings,
        "violations": violations,
        "raw_output": raw,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_erc.py <input_file> [output.xml]")
        sys.exit(1)
    out = sys.argv[2] if len(sys.argv) > 2 else None
    result = run_erc(sys.argv[1], out)
    print(f"ERC: {result['errors']} errors, {result['warnings']} warnings")
    for v in result["violations"][:10]:
        print(f"  [{v['severity'].upper()}] {v['description']}")
