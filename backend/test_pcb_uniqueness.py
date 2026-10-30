"""
test_pcb_uniqueness.py
─────────────────────
Verifies that two different prompts produce unique PCB files.
Run with:  cd backend && python test_pcb_uniqueness.py

Checks:
  1. The fallback netlist parser correctly extracts component refs.
  2. Two netlists with different components produce different PCB footprints.
  3. The netlist hash differs between projects.
"""
from __future__ import annotations
import sys
import os
import uuid
import hashlib
import re
import tempfile
from pathlib import Path

# Make sure we can import from the backend
sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault("WORK_DIR", "./tmp")

from services.pcb_generator import (
    _parse_netlist_components,
    _hash_netlist,
    _generate_netlist_pcb,
    _count_footprints,
)
from models.pipeline import BoardConstraints

BC = BoardConstraints(max_width_mm=100, max_height_mm=80, layers=2)


def make_netlist(components: list[tuple[str, str, str]], path: Path) -> None:
    """Write a minimal KiCad netlist with the given (ref, value, footprint) list."""
    lines = ['(export (version "E") (design (source "test")) (components']
    for ref, value, fp in components:
        lines.append(f'  (comp (ref "{ref}") (value "{value}") (footprint "{fp}") (description ""))')
    lines.append(') (nets')
    lines.append('  (net (code "1") (name "GND")')
    for ref, _, _ in components:
        lines.append(f'    (node (ref "{ref}") (pin "1"))')
    lines.append('  )')
    lines.append('  (net (code "2") (name "+3V3")')
    for ref, _, _ in components:
        lines.append(f'    (node (ref "{ref}") (pin "2"))')
    lines.append('  )')
    lines.append(')')
    lines.append(')')
    path.write_text("\n".join(lines))


def test_parse_netlist():
    with tempfile.TemporaryDirectory() as tmpdir:
        nl = Path(tmpdir) / "schematic.net"
        comps = [
            ("U1", "ESP32-WROOM-32", "RF_Module:ESP32-WROOM-32"),
            ("C1", "100nF", "Capacitor_SMD:C_0603_1608Metric"),
            ("R1", "10k", "Resistor_SMD:R_0603_1608Metric"),
        ]
        make_netlist(comps, nl)

        parsed = _parse_netlist_components(str(nl))
        refs = [p["ref"] for p in parsed]
        assert refs == ["U1", "C1", "R1"], f"Expected [U1,C1,R1] got {refs}"
        print("✅ test_parse_netlist PASS")


def test_unique_pcb_per_prompt():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Project A: LED blinker (few components)
        nl_a = Path(tmpdir) / "led_blinker.net"
        make_netlist([
            ("U1", "ATtiny85", "Package_DIP:DIP-8_W7.62mm"),
            ("D1", "LED_Red", "LED_SMD:LED_0805_2012Metric"),
            ("R1", "330R", "Resistor_SMD:R_0603_1608Metric"),
            ("C1", "100nF", "Capacitor_SMD:C_0603_1608Metric"),
            ("J1", "PWR_2P", "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"),
        ], nl_a)

        # Project B: ESP32 irrigation controller (many components)
        nl_b = Path(tmpdir) / "irrigation.net"
        make_netlist([
            ("U1", "ESP32-WROOM-32", "RF_Module:ESP32-WROOM-32"),
            ("U2", "AMS1117-3.3", "Package_TO_SOT_SMD:SOT-223-3_TabPin2"),
            ("U3", "DHT22", "Package_DIP:DIP-4_W7.62mm"),
            ("U4", "HS-G214", "Package_TO_SOT_SMD:SOT-23"),
            ("K1", "SRD-05VDC", "Relay_THT:Relay_SPDT_Omron-G5LE-1-VD"),
            ("J1", "USB_C", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12"),
            ("J2", "SOIL_SENSOR", "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical"),
            ("R1", "10k", "Resistor_SMD:R_0603_1608Metric"),
            ("R2", "10k", "Resistor_SMD:R_0603_1608Metric"),
            ("R3", "330R", "Resistor_SMD:R_0603_1608Metric"),
            ("C1", "100nF", "Capacitor_SMD:C_0603_1608Metric"),
            ("C2", "10uF", "Capacitor_SMD:C_0805_2012Metric"),
            ("C3", "100nF", "Capacitor_SMD:C_0603_1608Metric"),
            ("D1", "LED_Green", "LED_SMD:LED_0805_2012Metric"),
        ], nl_b)

        pid_a = str(uuid.uuid4())
        pid_b = str(uuid.uuid4())
        pcb_a = Path(tmpdir) / f"{pid_a}_board.kicad_pcb"
        pcb_b = Path(tmpdir) / f"{pid_b}_board.kicad_pcb"

        comps_a = _parse_netlist_components(str(nl_a))
        comps_b = _parse_netlist_components(str(nl_b))

        _generate_netlist_pcb(str(pcb_a), BC, comps_a, pid_a)
        _generate_netlist_pcb(str(pcb_b), BC, comps_b, pid_b)

        # Verify footprint counts differ
        fc_a = _count_footprints(str(pcb_a))
        fc_b = _count_footprints(str(pcb_b))
        assert fc_a > 0, f"PCB A has no footprints!"
        assert fc_b > 0, f"PCB B has no footprints!"
        assert fc_a != fc_b, f"Both PCBs have same footprint count {fc_a}! Should differ."
        print(f"✅ PCB footprint counts: A={fc_a} (LED blinker) B={fc_b} (Irrigation) — DIFFERENT")

        # Verify refs embedded in the PCB files differ
        text_a = pcb_a.read_text()
        text_b = pcb_b.read_text()
        refs_a = set(re.findall(r'property "Reference" "([^"]+)"', text_a))
        refs_b = set(re.findall(r'property "Reference" "([^"]+)"', text_b))
        assert refs_a != refs_b, f"Both PCBs have same refs! A={refs_a} B={refs_b}"
        print(f"✅ PCB refs: A={sorted(refs_a)} B={sorted(refs_b)} — DIFFERENT")

        # Verify netlist hashes differ
        hash_a = _hash_netlist(str(nl_a))
        hash_b = _hash_netlist(str(nl_b))
        assert hash_a != hash_b, f"Netlist hashes should differ! Both={hash_a}"
        print(f"✅ Netlist hashes: A={hash_a} B={hash_b} — DIFFERENT")

        # Verify PCB files themselves differ
        assert text_a != text_b, "PCB files are identical! Bug still present."
        print("✅ PCB file contents are UNIQUE per project")

        print(f"\n✅ test_unique_pcb_per_prompt PASS")


def test_empty_netlist_fallback():
    """When netlist has no components, write an empty board rather than crash."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pcb_path = Path(tmpdir) / "empty.kicad_pcb"
        _generate_netlist_pcb(str(pcb_path), BC, [], "test-empty")
        assert pcb_path.exists(), "PCB file should exist even for empty netlist"
        assert "Edge.Cuts" in pcb_path.read_text(), "PCB should have board outline"
        print("✅ test_empty_netlist_fallback PASS")


if __name__ == "__main__":
    print("=" * 60)
    print("FlowCAD PCB Uniqueness Tests")
    print("=" * 60)
    try:
        test_parse_netlist()
        test_unique_pcb_per_prompt()
        test_empty_netlist_fallback()
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED ✅")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        import traceback
        print(f"\n❌ ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)
