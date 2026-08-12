"""
skidl_templates/dht22_sensor.py
────────────────────────────────
Test Circuit 2: ESP32 + DHT22 Temperature/Humidity Sensor
  - ESP32-WROOM-32E
  - AMS1117-3.3 LDO
  - USB4110-GF-A USB-C
  - DHT22 sensor on GPIO4 with 10kΩ pull-up
  - Decoupling caps + CC resistors
"""
from __future__ import annotations

import sys
import os

KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")
if KICAD_SCRIPTING:
    sys.path.insert(0, KICAD_SCRIPTING)


def generate(output_path: str = "dht22_sensor.net") -> str:
    try:
        from skidl import Part, Net, NETLIST, generate_netlist, reset  # type: ignore
        return _generate_skidl(output_path)
    except ImportError:
        return _generate_fallback(output_path)


def _generate_skidl(output_path: str) -> str:
    from skidl import Part, Net, NETLIST, generate_netlist, reset  # type: ignore
    reset()

    esp32 = Part("RF_Module", "ESP32-WROOM-32", footprint="RF_Module:ESP32-WROOM-32", dest=NETLIST)
    esp32.ref = "U1"; esp32.value = "ESP32-WROOM-32E"

    reg = Part("Regulator_Linear", "AMS1117-3.3", footprint="Package_TO_SOT_SMD:SOT-223-3_TabPin2", dest=NETLIST)
    reg.ref = "U2"; reg.value = "AMS1117-3.3"

    dht22 = Part("Sensor_Temperature", "DHT22", footprint="Sensor:Aosong_DHT22_PTH", dest=NETLIST)
    dht22.ref = "U3"; dht22.value = "DHT22"

    usbc = Part("Connector", "USB_C_Receptacle_USB2.0", footprint="Connector_USB:USB_C_Receptacle_GCT_USB4110", dest=NETLIST)
    usbc.ref = "J1"; usbc.value = "USB4110-GF-A"

    r_pull = Part("Device", "R", footprint="Resistor_SMD:R_0603_1608Metric", dest=NETLIST)
    r_pull.ref = "R1"; r_pull.value = "10k"

    r_cc1 = Part("Device", "R", footprint="Resistor_SMD:R_0603_1608Metric", dest=NETLIST)
    r_cc1.ref = "R2"; r_cc1.value = "5k1"

    r_cc2 = Part("Device", "R", footprint="Resistor_SMD:R_0603_1608Metric", dest=NETLIST)
    r_cc2.ref = "R3"; r_cc2.value = "5k1"

    c1 = Part("Device", "C", footprint="Capacitor_SMD:C_0603_1608Metric", dest=NETLIST)
    c1.ref = "C1"; c1.value = "100nF"

    c2 = Part("Device", "C", footprint="Capacitor_SMD:C_0603_1608Metric", dest=NETLIST)
    c2.ref = "C2"; c2.value = "100nF"

    from skidl import Net
    vbus = Net("+5V");  vcc = Net("+3V3");  gnd = Net("GND");  gpio4 = Net("GPIO4")

    vbus += usbc["VBUS"]; gnd += usbc["GND"]
    gnd  += r_cc1[2], r_cc2[2]
    vbus += r_cc1[1], r_cc2[1]

    vbus += reg["VI"]; vcc += reg["VO"]; gnd += reg["GND"]

    vcc += c1[1]; gnd += c1[2]
    vbus += c2[1]; gnd += c2[2]

    vcc += esp32["3V3"]; gnd += esp32["GND"]
    gpio4 += esp32["IO4"]

    # DHT22 wiring: VCC, DATA (pulled up), NC, GND
    vcc += dht22["VCC"]
    gpio4 += dht22["DATA"]
    gnd  += dht22["GND"]

    # Pull-up on DATA
    vcc += r_pull[1]; gpio4 += r_pull[2]

    generate_netlist(file_=output_path)
    return output_path


def _generate_fallback(output_path: str) -> str:
    content = """(export (version "E")
  (design (source "flowcad_dht22") (date "2024-01-01"))
  (components
    (comp (ref "U1") (value "ESP32-WROOM-32E") (footprint "RF_Module:ESP32-WROOM-32"))
    (comp (ref "U2") (value "AMS1117-3.3")     (footprint "Package_TO_SOT_SMD:SOT-223-3_TabPin2"))
    (comp (ref "U3") (value "DHT22")            (footprint "Sensor:Aosong_DHT22_PTH"))
    (comp (ref "J1") (value "USB4110-GF-A")     (footprint "Connector_USB:USB_C_Receptacle_GCT_USB4110"))
    (comp (ref "R1") (value "10k")              (footprint "Resistor_SMD:R_0603_1608Metric"))
    (comp (ref "R2") (value "5k1")              (footprint "Resistor_SMD:R_0603_1608Metric"))
    (comp (ref "R3") (value "5k1")              (footprint "Resistor_SMD:R_0603_1608Metric"))
    (comp (ref "C1") (value "100nF")            (footprint "Capacitor_SMD:C_0603_1608Metric"))
    (comp (ref "C2") (value "100nF")            (footprint "Capacitor_SMD:C_0603_1608Metric"))
  )
  (nets
    (net (code "1") (name "+5V")  (node (ref "J1") (pin "VBUS")) (node (ref "U2") (pin "VI")) (node (ref "C2") (pin "1")))
    (net (code "2") (name "+3V3") (node (ref "U2") (pin "VO"))   (node (ref "U1") (pin "3V3")) (node (ref "U3") (pin "VCC")) (node (ref "C1") (pin "1")) (node (ref "R1") (pin "1")))
    (net (code "3") (name "GND")  (node (ref "J1") (pin "GND"))  (node (ref "U1") (pin "GND")) (node (ref "U2") (pin "GND")) (node (ref "U3") (pin "GND")) (node (ref "C1") (pin "2")) (node (ref "C2") (pin "2")))
    (net (code "4") (name "GPIO4") (node (ref "U1") (pin "IO4")) (node (ref "U3") (pin "DATA")) (node (ref "R1") (pin "2")))
  )
)"""
    with open(output_path, "w") as f:
        f.write(content)
    return output_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "dht22_sensor.net"
    generate(out)
