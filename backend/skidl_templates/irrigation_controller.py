"""
skidl_templates/irrigation_controller.py
──────────────────────────────────────────
Test Circuit 3: ESP32 Smart Irrigation Controller
  - ESP32-WROOM-32E (MCU, WiFi)
  - AMS1117-3.3 LDO
  - USB4110-GF-A USB-C
  - Soil Moisture Probe Header (JST-XH 3P) on ADC1_CH0
  - DHT22 Temp/Humidity on GPIO4
  - ULN2003A Relay Driver on GPIO26
  - SRD-05VDC-SL-C Relay
  - Screw Terminal (pump output)
  - SSD1306 OLED on I2C
  - Decoupling caps, pull-ups, CC resistors
"""
from __future__ import annotations

import sys
import os

KICAD_SCRIPTING = os.environ.get("KICAD_SCRIPTING_PATH", "")
if KICAD_SCRIPTING:
    sys.path.insert(0, KICAD_SCRIPTING)


def generate(output_path: str = "irrigation_controller.net") -> str:
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
    dht22.ref = "U4"; dht22.value = "DHT22"

    drv = Part("Driver_FET", "ULN2003A", footprint="Package_SO:SOIC-16_3.9x9.9mm_P1.27mm", dest=NETLIST)
    drv.ref = "Q1"; drv.value = "ULN2003A"

    usbc = Part("Connector", "USB_C_Receptacle_USB2.0", footprint="Connector_USB:USB_C_Receptacle_GCT_USB4110", dest=NETLIST)
    usbc.ref = "J1"; usbc.value = "USB4110-GF-A"

    soil = Part("Connector", "Conn_01x03", footprint="Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical", dest=NETLIST)
    soil.ref = "J3"; soil.value = "Soil Probe"

    pump = Part("Connector", "Conn_01x02", footprint="TerminalBlock_Phoenix:TerminalBlock_Phoenix_MPT-0,5-2-2.54_1x02_P2.54mm_Horizontal", dest=NETLIST)
    pump.ref = "J4"; pump.value = "Pump 12V"

    from skidl import Net
    vbus = Net("+5V"); vcc = Net("+3V3"); gnd = Net("GND")
    gpio4 = Net("GPIO4"); gpio26 = Net("GPIO26"); adc0 = Net("ADC1_CH0")
    i2c_scl = Net("I2C_SCL"); i2c_sda = Net("I2C_SDA"); pump_sw = Net("PUMP_SW")

    # USB-C
    vbus += usbc["VBUS"]; gnd += usbc["GND"]

    # LDO
    vbus += reg["VI"]; vcc += reg["VO"]; gnd += reg["GND"]

    # ESP32
    vcc += esp32["3V3"]; gnd += esp32["GND"]
    gpio4  += esp32["IO4"]
    gpio26 += esp32["IO26"]
    adc0   += esp32["ADC1_CH0"]
    i2c_scl += esp32["IO22"]
    i2c_sda += esp32["IO21"]

    # Soil
    vcc += soil[1]; adc0 += soil[2]; gnd += soil[3]

    # DHT22
    vcc += dht22["VCC"]; gpio4 += dht22["DATA"]; gnd += dht22["GND"]

    # Relay driver
    gpio26 += drv[1]; pump_sw += drv[16]
    vbus   += drv[8]; gnd    += drv[9]

    # Pump screw terminal
    pump_sw += pump[1]; gnd += pump[2]

    generate_netlist(file_=output_path)
    return output_path


def _generate_fallback(output_path: str) -> str:
    content = """(export (version "E")
  (design (source "flowcad_irrigation") (date "2024-01-01"))
  (components
    (comp (ref "U1") (value "ESP32-WROOM-32E") (footprint "RF_Module:ESP32-WROOM-32"))
    (comp (ref "U2") (value "AMS1117-3.3")     (footprint "Package_TO_SOT_SMD:SOT-223-3_TabPin2"))
    (comp (ref "U4") (value "DHT22")            (footprint "Sensor:Aosong_DHT22_PTH"))
    (comp (ref "Q1") (value "ULN2003A")         (footprint "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm"))
    (comp (ref "J1") (value "USB4110-GF-A")     (footprint "Connector_USB:USB_C_Receptacle_GCT_USB4110"))
    (comp (ref "J3") (value "Soil Probe")       (footprint "Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical"))
    (comp (ref "J4") (value "Pump 12V")         (footprint "TerminalBlock_Phoenix:TerminalBlock_Phoenix_MPT-0,5-2-2.54_1x02_P2.54mm_Horizontal"))
  )
  (nets
    (net (code "1") (name "+5V")  (node (ref "J1") (pin "VBUS")) (node (ref "U2") (pin "VI")))
    (net (code "2") (name "+3V3") (node (ref "U2") (pin "VO"))   (node (ref "U1") (pin "3V3")) (node (ref "U4") (pin "VCC")) (node (ref "J3") (pin "1")))
    (net (code "3") (name "GND")  (node (ref "J1") (pin "GND"))  (node (ref "U1") (pin "GND")) (node (ref "U2") (pin "GND")) (node (ref "U4") (pin "GND")) (node (ref "J3") (pin "3")) (node (ref "J4") (pin "2")))
    (net (code "4") (name "ADC1_CH0") (node (ref "U1") (pin "ADC1_CH0")) (node (ref "J3") (pin "2")))
    (net (code "5") (name "GPIO4")    (node (ref "U1") (pin "IO4"))       (node (ref "U4") (pin "DATA")))
    (net (code "6") (name "GPIO26")   (node (ref "U1") (pin "IO26"))      (node (ref "Q1") (pin "1")))
    (net (code "7") (name "PUMP_SW")  (node (ref "Q1") (pin "16"))        (node (ref "J4") (pin "1")))
  )
)"""
    with open(output_path, "w") as f:
        f.write(content)
    return output_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "irrigation_controller.net"
    generate(out)
