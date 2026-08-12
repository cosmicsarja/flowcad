"""
skidl_templates/led_blinker.py
───────────────────────────────
Test Circuit 1: ESP32 LED Blinker
  - ESP32-WROOM-32E (MCU)
  - AMS1117-3.3 (LDO regulator)
  - USB4110-GF-A (USB-C power input)
  - Red LED 0805 on GPIO2
  - 330Ω current limiting resistor
  - 100nF decoupling caps
  - 5.1kΩ CC resistors for USB-C

Run standalone to generate netlist:
    python led_blinker.py [output.net]
"""
from __future__ import annotations

import sys
import os

KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")
if KICAD_SCRIPTING:
    sys.path.insert(0, KICAD_SCRIPTING)


def generate(output_path: str = "led_blinker.net") -> str:
    """Generate LED blinker netlist. Returns path to .net file."""
    try:
        from skidl import Part, Net, NETLIST, lib_search_paths, KICAD, generate_netlist, reset  # type: ignore
        return _generate_skidl(output_path)
    except ImportError:
        return _generate_fallback(output_path)


def _generate_skidl(output_path: str) -> str:
    from skidl import Part, Net, NETLIST, generate_netlist, reset  # type: ignore
    reset()

    # ── Parts ────────────────────────────────────────────────────────────
    esp32 = Part("RF_Module", "ESP32-WROOM-32", footprint="RF_Module:ESP32-WROOM-32", dest=NETLIST)
    esp32.ref = "U1"
    esp32.value = "ESP32-WROOM-32E"

    reg = Part("Regulator_Linear", "AMS1117-3.3", footprint="Package_TO_SOT_SMD:SOT-223-3_TabPin2", dest=NETLIST)
    reg.ref = "U2"
    reg.value = "AMS1117-3.3"

    usbc = Part("Connector", "USB_C_Receptacle_USB2.0", footprint="Connector_USB:USB_C_Receptacle_GCT_USB4110", dest=NETLIST)
    usbc.ref = "J1"
    usbc.value = "USB4110-GF-A"

    led = Part("Device", "LED", footprint="LED_SMD:LED_0805_2012Metric", dest=NETLIST)
    led.ref = "D1"
    led.value = "RED LED"

    r_led = Part("Device", "R", footprint="Resistor_SMD:R_0603_1608Metric", dest=NETLIST)
    r_led.ref = "R1"
    r_led.value = "330R"

    c1 = Part("Device", "C", footprint="Capacitor_SMD:C_0603_1608Metric", dest=NETLIST)
    c1.ref = "C1"
    c1.value = "100nF"

    c2 = Part("Device", "C", footprint="Capacitor_SMD:C_0603_1608Metric", dest=NETLIST)
    c2.ref = "C2"
    c2.value = "100nF"

    r_cc1 = Part("Device", "R", footprint="Resistor_SMD:R_0603_1608Metric", dest=NETLIST)
    r_cc1.ref = "R2"
    r_cc1.value = "5k1"

    r_cc2 = Part("Device", "R", footprint="Resistor_SMD:R_0603_1608Metric", dest=NETLIST)
    r_cc2.ref = "R3"
    r_cc2.value = "5k1"

    # ── Nets ─────────────────────────────────────────────────────────────
    from skidl import Net
    vbus = Net("+5V")
    vcc  = Net("+3V3")
    gnd  = Net("GND")
    gpio2 = Net("GPIO2")

    # USB-C → VBUS/GND
    vbus += usbc["VBUS"]
    gnd  += usbc["GND"]
    gnd  += r_cc1[2], r_cc2[2]
    vbus += r_cc1[1]  # CC1
    vbus += r_cc2[1]  # CC2

    # Regulator: VBUS → 3V3
    vbus += reg["VI"]
    vcc  += reg["VO"]
    gnd  += reg["GND"]

    # Decoupling
    vcc += c1[1]
    gnd += c1[2]
    vbus += c2[1]
    gnd  += c2[2]

    # ESP32 power
    vcc += esp32["3V3"]
    gnd += esp32["GND"]
    gpio2 += esp32["IO2"]

    # LED + resistor
    gpio2 += r_led[1]
    r_led[2] += led["A"]
    gnd += led["K"]

    generate_netlist(file_=output_path)
    print(f"✅ SKiDL netlist: {output_path}")
    return output_path


def _generate_fallback(output_path: str) -> str:
    """Hand-crafted KiCad netlist fallback."""
    content = """(export (version "E")
  (design
    (source "flowcad_led_blinker")
    (date "2024-01-01")
    (tool "FlowCAD v1.0")
  )
  (components
    (comp (ref "U1") (value "ESP32-WROOM-32E") (footprint "RF_Module:ESP32-WROOM-32") (description "Wi-Fi MCU"))
    (comp (ref "U2") (value "AMS1117-3.3") (footprint "Package_TO_SOT_SMD:SOT-223-3_TabPin2") (description "3.3V LDO"))
    (comp (ref "J1") (value "USB4110-GF-A") (footprint "Connector_USB:USB_C_Receptacle_GCT_USB4110") (description "USB-C"))
    (comp (ref "D1") (value "RED LED 0805") (footprint "LED_SMD:LED_0805_2012Metric") (description "Status LED"))
    (comp (ref "R1") (value "330R") (footprint "Resistor_SMD:R_0603_1608Metric") (description "LED current limit"))
    (comp (ref "R2") (value "5k1") (footprint "Resistor_SMD:R_0603_1608Metric") (description "USB-C CC1"))
    (comp (ref "R3") (value "5k1") (footprint "Resistor_SMD:R_0603_1608Metric") (description "USB-C CC2"))
    (comp (ref "C1") (value "100nF") (footprint "Capacitor_SMD:C_0603_1608Metric") (description "3V3 decoupling"))
    (comp (ref "C2") (value "100nF") (footprint "Capacitor_SMD:C_0603_1608Metric") (description "5V decoupling"))
  )
  (nets
    (net (code "1") (name "+5V")
      (node (ref "J1") (pin "VBUS"))
      (node (ref "U2") (pin "VI"))
      (node (ref "C2") (pin "1"))
      (node (ref "R2") (pin "1"))
      (node (ref "R3") (pin "1"))
    )
    (net (code "2") (name "+3V3")
      (node (ref "U2") (pin "VO"))
      (node (ref "U1") (pin "3V3"))
      (node (ref "C1") (pin "1"))
    )
    (net (code "3") (name "GND")
      (node (ref "J1") (pin "GND"))
      (node (ref "U1") (pin "GND"))
      (node (ref "U2") (pin "GND"))
      (node (ref "C1") (pin "2"))
      (node (ref "C2") (pin "2"))
      (node (ref "D1") (pin "K"))
      (node (ref "R2") (pin "2"))
      (node (ref "R3") (pin "2"))
    )
    (net (code "4") (name "GPIO2")
      (node (ref "U1") (pin "IO2"))
      (node (ref "R1") (pin "1"))
    )
    (net (code "5") (name "LED_A")
      (node (ref "R1") (pin "2"))
      (node (ref "D1") (pin "A"))
    )
  )
)"""
    with open(output_path, "w") as f:
        f.write(content)
    print(f"✅ Fallback netlist: {output_path}")
    return output_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "led_blinker.net"
    generate(out)
