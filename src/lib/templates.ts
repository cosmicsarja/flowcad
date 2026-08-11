/**
 * FlowCAD mock template library.
 * Each template is a fully specified circuit (parts, nets, board, narrative).
 * Layout for schematic / PCB is derived deterministically by buildDesign().
 */

export type SymKind =
  | "module"
  | "ic"
  | "reg"
  | "res"
  | "cap"
  | "led"
  | "conn"
  | "sensor"
  | "relay"
  | "disp"
  | "xtal"
  | "ind"
  | "diode"
  | "motor"
  | "batt"
  | "sw";

export type BlockKind = "power" | "mcu" | "sensor" | "actuator" | "io";

export type TemplatePart = {
  ref: string;
  name: string;
  value: string;
  pkg: string;
  unit: number;
  qty: number;
  sym: SymKind;
  desc: string;
  reasoning: string;
  specs: Array<[string, string]>;
  datasheet?: string;
  block?: { label: string; kind: BlockKind };
};

export type TemplateNet = { from: string; to: string; net: string };

export type Template = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  board: { w: number; h: number };
  layers: 2 | 4;
  keywords: string[];
  score?: (t: string) => number;
  parts: TemplatePart[];
  nets: TemplateNet[];
  requirements: string[];
};

/** geometry per symbol kind: schematic size, pcb footprint size, 3d height */
export const SYM_GEO: Record<SymKind, { w: number; h: number; pw: number; ph: number; z: number; pins: number }> = {
  module: { w: 150, h: 122, pw: 130, ph: 90, z: 14, pins: 8 },
  ic: { w: 108, h: 78, pw: 62, ph: 42, z: 8, pins: 6 },
  reg: { w: 100, h: 62, pw: 58, ph: 38, z: 8, pins: 3 },
  res: { w: 74, h: 30, pw: 26, ph: 14, z: 3, pins: 2 },
  cap: { w: 74, h: 34, pw: 26, ph: 18, z: 5, pins: 2 },
  led: { w: 74, h: 34, pw: 22, ph: 14, z: 4, pins: 2 },
  diode: { w: 74, h: 34, pw: 24, ph: 14, z: 4, pins: 2 },
  conn: { w: 96, h: 62, pw: 44, ph: 30, z: 10, pins: 4 },
  sensor: { w: 108, h: 70, pw: 58, ph: 40, z: 12, pins: 4 },
  relay: { w: 104, h: 74, pw: 78, ph: 58, z: 22, pins: 5 },
  disp: { w: 124, h: 74, pw: 92, ph: 48, z: 9, pins: 4 },
  xtal: { w: 78, h: 40, pw: 30, ph: 20, z: 4, pins: 2 },
  ind: { w: 82, h: 38, pw: 32, ph: 26, z: 6, pins: 2 },
  motor: { w: 108, h: 74, pw: 66, ph: 48, z: 16, pins: 4 },
  batt: { w: 96, h: 56, pw: 60, ph: 34, z: 11, pins: 2 },
  sw: { w: 78, h: 46, pw: 34, ph: 26, z: 8, pins: 4 },
};

const ds = (n: string) => `${n.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`;

function p(
  ref: string,
  name: string,
  value: string,
  pkg: string,
  unit: number,
  qty: number,
  sym: SymKind,
  desc: string,
  reasoning: string,
  specs: Array<[string, string]>,
  block?: { label: string; kind: BlockKind },
): TemplatePart {
  return { ref, name, value, pkg, unit, qty, sym, desc, reasoning, specs, datasheet: ds(name), block };
}

/* ------------------------------------------------------------------ */
/* shared building blocks                                              */
/* ------------------------------------------------------------------ */

const usbC = p("J1", "USB4110-GF-A", "USB-C", "USB-C 16P", 0.62, 1, "conn", "USB-C receptacle, power + data", "Through-hole shield tabs give the field-serviced connector mechanical retention beyond the SMD pads.", [["Rating", "5 V / 3 A"], ["Cycles", "10 000"], ["Shell", "TH shield"]], { label: "USB-C 5V IN", kind: "power" });

const ldo33 = p("U2", "AMS1117-3.3", "LDO 3V3", "SOT-223", 0.18, 1, "reg", "3.3 V LDO regulator, 1 A", "The MCU needs ≥500 mA headroom for transmit bursts; the AMS1117 delivers 1 A at a 1.3 V dropout from the 5 V rail.", [["V_out", "3.3 V ±1%"], ["I_max", "1 A"], ["Dropout", "1.3 V @ 1 A"], ["θJA", "61 °C/W"]], { label: "3V3 REGULATOR", kind: "power" });

const esp32 = p("U1", "ESP32-WROOM-32E", "Wi-Fi MCU", "SMD-38", 3.4, 1, "module", "Wi-Fi + BLE MCU module", "Chosen for integrated Wi-Fi telemetry, a certified RF front-end (no RF layout review) and 18 ADC channels for analog sensors.", [["Supply", "3.0 – 3.6 V"], ["Peak current", "500 mA (TX)"], ["Flash", "4 MB"], ["ADC", "18 ch · 12-bit"], ["Interfaces", "I²C, SPI, UART, PWM"]], { label: "ESP32-WROOM-32E", kind: "mcu" });

const bulkCap = p("C7", "Panasonic EEU-FR 470 µF", "470µF", "D8×10 mm", 0.14, 1, "cap", "Bulk input capacitance", "Buffers the 500 mA Wi-Fi transmit bursts so the 3V3 rail stays under 50 mV ripple.", [["Value", "470 µF"], ["ESR", "0.09 Ω"], ["Voltage", "16 V"]]);

const decoupling = p("C1", "Murata GRM188 100 nF", "100nF", "0603", 0.02, 4, "cap", "X7R decoupling capacitors", "One decoupling cap per active IC power pin, placed within 2 mm of the pad to keep the return loop small.", [["Value", "100 nF ±10%"], ["Voltage", "50 V"], ["Dielectric", "X7R"]]);

const pullups = p("R1", "Yageo RC0603 4.7 kΩ", "4k7", "0603", 0.01, 2, "res", "I²C / 1-wire pull-ups", "4.7 kΩ pull-ups give ~1 µs rise time on the bus at 400 kHz with the estimated 60 pF of trace capacitance.", [["Tolerance", "±1%"], ["Power", "100 mW"]]);

/* ------------------------------------------------------------------ */
/* templates                                                           */
/* ------------------------------------------------------------------ */

export const templates: Template[] = [
  {
    id: "esp32-blink",
    title: "ESP32 LED Blinker",
    slug: "esp32_blink",
    summary: "Minimal ESP32 development board with a USB-C powered 3V3 rail and a GPIO status LED.",
    board: { w: 34, h: 26 },
    layers: 2,
    keywords: ["blink", "led", "blinker", "minimal", "simple", "hello world", "esp32 board", "dev board"],
    requirements: [
      "USB-C bus power, 5 V input",
      "3.3 V regulated rail for the MCU",
      "Single indicator LED on a GPIO",
      "Boot / reset strapping",
      "Smallest practical 2-layer outline",
    ],
    parts: [
      usbC,
      ldo33,
      esp32,
      decoupling,
      p("D1", "Kingbright APT2012 LED", "GRN", "0805", 0.05, 1, "led", "Green status LED", "Driven from GPIO2 — the strapping pin is free after boot, so no extra IO is consumed.", [["V_f", "2.1 V"], ["I_f", "5 mA"]], { label: "STATUS LED", kind: "io" }),
      p("R2", "Yageo RC0603 330 Ω", "330R", "0603", 0.01, 1, "res", "LED series resistor", "330 Ω limits the LED to 4 mA — bright enough indoors and well inside the 12 mA GPIO budget.", [["Tolerance", "±1%"]]),
      p("SW1", "TS-1088 Tactile", "BOOT", "SMD 4P", 0.06, 1, "sw", "Boot / reset tactile switch", "Pulls IO0 low during reset so the module can be flashed over the USB-UART bridge.", [["Travel", "0.25 mm"], ["Life", "100k"]], { label: "BOOT/RESET", kind: "io" }),
    ],
    nets: [
      { from: "J1", to: "U2", net: "+5V" },
      { from: "U2", to: "U1", net: "+3V3" },
      { from: "U2", to: "C1", net: "+3V3" },
      { from: "U1", to: "R2", net: "GPIO2" },
      { from: "R2", to: "D1", net: "LED_A" },
      { from: "U1", to: "SW1", net: "IO0" },
    ],
  },

  {
    id: "esp32-dht22",
    title: "ESP32 Temperature & Humidity Node",
    slug: "esp32_th_node",
    summary: "Wi-Fi environmental logger built on the ESP32-WROOM-32E with a DHT22 temperature/humidity sensor.",
    board: { w: 40, h: 30 },
    layers: 2,
    keywords: ["dht22", "dht11", "temperature", "humidity", "weather", "climate", "am2302", "thermometer", "logger"],
    requirements: [
      "Wi-Fi telemetry of temperature and humidity",
      "±0.5 °C accuracy class sensor",
      "USB-C bus power with 3V3 LDO",
      "1-wire sensor bus with pull-up",
      "Indoor enclosure — 40 × 30 mm outline",
    ],
    parts: [
      usbC,
      ldo33,
      esp32,
      p("U4", "DHT22 / AM2302", "Temp / RH", "THT-4", 2.9, 1, "sensor", "Temperature & humidity sensor", "±0.5 °C and 0–100 %RH beat the DHT11 by a wide margin for logging duty; single-wire interface mapped to GPIO4.", [["Accuracy", "±0.5 °C / ±2 %RH"], ["Supply", "3.3 – 5.5 V"], ["Sample rate", "0.5 Hz"], ["Interface", "1-wire"]], { label: "DHT22 SENSOR", kind: "sensor" }),
      pullups,
      decoupling,
      bulkCap,
      p("D1", "Kingbright APT2012 LED", "BLU", "0805", 0.05, 1, "led", "Link status LED", "Blinks on each successful MQTT publish so field techs can confirm uplink without a laptop.", [["V_f", "3.0 V"], ["I_f", "5 mA"]], { label: "STATUS LED", kind: "io" }),
    ],
    nets: [
      { from: "J1", to: "U2", net: "+5V" },
      { from: "U2", to: "C7", net: "+3V3" },
      { from: "U2", to: "U1", net: "+3V3" },
      { from: "U1", to: "C1", net: "+3V3" },
      { from: "U1", to: "R1", net: "GPIO4" },
      { from: "R1", to: "U4", net: "DHT_DATA" },
      { from: "U1", to: "D1", net: "GPIO2" },
    ],
  },

  {
    id: "esp32-irrigation",
    title: "ESP32 Smart Irrigation Controller",
    slug: "irrigation_ctrl",
    summary: "Capacitive soil-moisture sensing with relay-switched 12 V pump control and Wi-Fi scheduling.",
    board: { w: 48, h: 36 },
    layers: 2,
    keywords: ["irrigation", "soil", "moisture", "pump", "relay", "watering", "plant", "garden", "valve", "sprinkler"],
    requirements: [
      "Capacitive soil moisture probe on an ADC channel",
      "Relay-switched 12 V pump output, 10 A contacts",
      "Flyback protection for the inductive coil",
      "Wi-Fi schedule and manual override",
      "Ambient temperature / humidity compensation",
    ],
    parts: [
      usbC,
      ldo33,
      esp32,
      p("U4", "DHT22 / AM2302", "Temp / RH", "THT-4", 2.9, 1, "sensor", "Temperature & humidity sensor", "Ambient RH compensates the capacitive probe reading, which drifts with air humidity in open beds.", [["Accuracy", "±0.5 °C / ±2 %RH"], ["Supply", "3.3 – 5.5 V"], ["Interface", "1-wire"]], { label: "DHT22", kind: "sensor" }),
      p("J3", "JST-XH 3P Header", "SOIL", "JST-XH 3P", 0.11, 1, "conn", "Capacitive moisture probe input", "Keyed connector prevents a reversed probe insertion in the field; centre pin carries the analog output.", [["Pitch", "2.5 mm"], ["Current", "3 A"]], { label: "SOIL PROBE", kind: "sensor" }),
      p("Q1", "ULN2003A", "Relay driver", "SOIC-16", 0.42, 1, "ic", "Darlington relay driver array", "Integrated flyback diodes protect the GPIO from coil back-EMF without discrete parts.", [["I_out", "500 mA/ch"], ["V_max", "50 V"], ["Channels", "7"]], { label: "RELAY DRIVER", kind: "actuator" }),
      p("K1", "SRD-05VDC-SL-C", "Relay 10A", "THT Relay", 0.85, 1, "relay", "SPDT power relay", "Rated 10 A @ 250 VAC — roughly 4× margin over the 12 V pump inrush.", [["Coil", "5 V · 71 mA"], ["Contacts", "10 A / 250 VAC"]], { label: "PUMP RELAY", kind: "actuator" }),
      p("J4", "Screw Terminal 2P", "PUMP", "5.08 mm 2P", 0.22, 1, "conn", "12 V pump output", "5.08 mm pitch terminal handles field wiring without a crimp tool.", [["Rating", "16 A / 300 V"], ["Wire", "12–26 AWG"]], { label: "PUMP 12V", kind: "actuator" }),
      bulkCap,
      decoupling,
      pullups,
    ],
    nets: [
      { from: "J1", to: "U2", net: "+5V" },
      { from: "U2", to: "C7", net: "+3V3" },
      { from: "U2", to: "U1", net: "+3V3" },
      { from: "U1", to: "C1", net: "+3V3" },
      { from: "U1", to: "J3", net: "ADC1_CH0" },
      { from: "U1", to: "R1", net: "GPIO4" },
      { from: "R1", to: "U4", net: "DHT_DATA" },
      { from: "U1", to: "Q1", net: "GPIO26" },
      { from: "Q1", to: "K1", net: "COIL_DRV" },
      { from: "K1", to: "J4", net: "PUMP_SW" },
    ],
  },

  {
    id: "nano-ultrasonic",
    title: "Arduino Nano Distance Meter",
    slug: "nano_ultrasonic",
    summary: "HC-SR04 ultrasonic ranging carrier for an Arduino Nano with buzzer feedback.",
    board: { w: 44, h: 32 },
    layers: 2,
    keywords: ["arduino", "nano", "ultrasonic", "hc-sr04", "distance", "range", "parking", "sonar", "proximity"],
    requirements: [
      "Arduino Nano socketed on 2×15 headers",
      "HC-SR04 trigger / echo interface",
      "5 V logic — no level shifting required",
      "Audible proximity feedback",
      "Bus power from the Nano USB port",
    ],
    parts: [
      p("A1", "Arduino Nano v3", "ATmega328P", "2×15 THT", 4.2, 1, "module", "Arduino Nano carrier socket", "The Nano is socketed rather than soldered so the same carrier can be reused across prototypes.", [["MCU", "ATmega328P"], ["Logic", "5 V"], ["Flash", "32 kB"], ["Clock", "16 MHz"]], { label: "ARDUINO NANO", kind: "mcu" }),
      p("J2", "HC-SR04 Header", "TRIG/ECHO", "2.54 mm 4P", 0.09, 1, "conn", "Ultrasonic module header", "4-pin 2.54 mm header matches the HC-SR04 pinout directly, no adapter cable.", [["Pitch", "2.54 mm"], ["Pins", "VCC/TRIG/ECHO/GND"]], { label: "HC-SR04", kind: "sensor" }),
      p("U3", "HC-SR04", "Ultrasonic", "Module", 1.35, 1, "sensor", "Ultrasonic ranging module", "2–400 cm range at ±3 mm resolution covers the requested parking-assist use case.", [["Range", "2 – 400 cm"], ["Resolution", "3 mm"], ["Beam", "15°"], ["Supply", "5 V · 15 mA"]], { label: "RANGE SENSOR", kind: "sensor" }),
      p("LS1", "Piezo Buzzer 5 V", "BUZZ", "THT-2", 0.35, 1, "sensor", "Active piezo buzzer", "Active buzzer needs only a GPIO high, freeing the timer peripheral used by the echo capture.", [["SPL", "85 dB @ 10 cm"], ["Current", "30 mA"]], { label: "BUZZER", kind: "actuator" }),
      p("Q2", "BC817-40", "NPN", "SOT-23", 0.05, 1, "ic", "Buzzer drive transistor", "The 30 mA buzzer exceeds the safe continuous ATmega pin current, so it is switched by a small NPN.", [["I_c", "500 mA"], ["h_FE", "250"]]),
      p("R3", "Yageo RC0603 1 kΩ", "1k", "0603", 0.01, 2, "res", "Base and pull-down resistors", "1 kΩ base resistor saturates the transistor at 3 mA of drive current.", [["Tolerance", "±1%"]]),
      decoupling,
      p("D2", "1N4148W", "Flyback", "SOD-123", 0.03, 1, "diode", "Buzzer flyback diode", "Clamps the piezo inductive kick to protect the transistor collector.", [["V_r", "100 V"], ["I_f", "300 mA"]]),
    ],
    nets: [
      { from: "A1", to: "J2", net: "TRIG" },
      { from: "J2", to: "U3", net: "ECHO" },
      { from: "A1", to: "R3", net: "GPIO8" },
      { from: "R3", to: "Q2", net: "BUZZ_BASE" },
      { from: "Q2", to: "LS1", net: "BUZZ_SW" },
      { from: "LS1", to: "D2", net: "BUZZ_SW" },
      { from: "A1", to: "C1", net: "+5V" },
    ],
  },

  {
    id: "stm32-motor",
    title: "STM32 Dual Motor Driver",
    slug: "stm32_motor",
    summary: "STM32F103 robotics controller with a DRV8833 dual H-bridge and quadrature encoder inputs.",
    board: { w: 52, h: 42 },
    layers: 4,
    keywords: ["stm32", "motor", "driver", "robot", "robotics", "h-bridge", "drv8833", "encoder", "servo", "drive", "wheels"],
    requirements: [
      "Dual brushed DC motor drive, 1.5 A per channel",
      "STM32F103 timer-based PWM control",
      "Quadrature encoder feedback on both axes",
      "6–12 V battery input with reverse protection",
      "4-layer stackup for return-current integrity",
    ],
    parts: [
      p("U1", "STM32F103C8T6", "Cortex-M3", "LQFP-48", 2.15, 1, "ic", "32-bit ARM Cortex-M3 MCU", "Four advanced-control timers give hardware quadrature decoding on two axes plus complementary PWM for the bridges.", [["Core", "Cortex-M3 72 MHz"], ["Flash", "64 kB"], ["Timers", "4 × 16-bit"], ["Supply", "2.0 – 3.6 V"]], { label: "STM32F103", kind: "mcu" }),
      p("U5", "DRV8833", "Dual H-bridge", "HTSSOP-16", 1.05, 1, "ic", "Dual 1.5 A H-bridge driver", "Integrated current limit and thermal shutdown remove the need for external sense resistors at this power level.", [["V_m", "2.7 – 10.8 V"], ["I_out", "1.5 A RMS/ch"], ["R_dson", "360 mΩ"], ["PWM", "up to 250 kHz"]], { label: "DRV8833", kind: "actuator" }),
      p("U2", "TPS62203", "Buck 3V3", "SOT-23-5", 0.72, 1, "reg", "3.3 V step-down converter", "A switcher rather than an LDO keeps dissipation low across the 6–12 V battery range.", [["V_in", "2.5 – 6 V"], ["I_out", "300 mA"], ["Efficiency", "95%"], ["f_sw", "1 MHz"]], { label: "3V3 BUCK", kind: "power" }),
      p("L1", "Murata 2.2 µH", "2u2", "1210", 0.09, 1, "ind", "Buck output inductor", "2.2 µH keeps the ripple current under 30% at the 1 MHz switching frequency.", [["I_sat", "1.6 A"], ["DCR", "60 mΩ"]]),
      p("J5", "Screw Terminal 2P", "VBAT", "5.08 mm 2P", 0.22, 1, "conn", "6–12 V battery input", "Screw terminal with a reverse-polarity MOSFET so a flipped battery pack cannot destroy the bridge.", [["Rating", "16 A"], ["Wire", "12–26 AWG"]], { label: "BATTERY IN", kind: "power" }),
      p("M1", "Motor Header A", "MOTOR A", "2.54 mm 2P", 0.07, 1, "motor", "Motor A output header", "Separate motor headers keep the high-current loops short and off the encoder returns.", [["Current", "1.5 A"]], { label: "MOTOR A", kind: "actuator" }),
      p("M2", "Motor Header B", "MOTOR B", "2.54 mm 2P", 0.07, 1, "motor", "Motor B output header", "Mirrored to motor A so the wiring harness is symmetric on a differential drive base.", [["Current", "1.5 A"]], { label: "MOTOR B", kind: "actuator" }),
      p("J6", "Encoder Header 2×4", "ENC", "2.54 mm 8P", 0.12, 1, "conn", "Quadrature encoder inputs", "Both encoder channels land on TIM2/TIM3 inputs, so counting is hardware-driven.", [["Channels", "2 × A/B"], ["Logic", "3.3 V"]], { label: "ENCODERS", kind: "sensor" }),
      p("Y1", "8 MHz Crystal", "8MHz", "HC-49S", 0.18, 1, "xtal", "HSE crystal", "External crystal is required for reliable USB enumeration on the F103.", [["Tolerance", "±20 ppm"], ["C_L", "18 pF"]]),
      decoupling,
      bulkCap,
    ],
    nets: [
      { from: "J5", to: "U2", net: "VBAT" },
      { from: "J5", to: "U5", net: "VBAT" },
      { from: "U2", to: "L1", net: "SW" },
      { from: "L1", to: "U1", net: "+3V3" },
      { from: "U1", to: "C1", net: "+3V3" },
      { from: "U1", to: "Y1", net: "HSE" },
      { from: "U1", to: "U5", net: "PWM_A/B" },
      { from: "U5", to: "M1", net: "AOUT" },
      { from: "U5", to: "M2", net: "BOUT" },
      { from: "U1", to: "J6", net: "ENC_A/B" },
      { from: "J5", to: "C7", net: "VBAT" },
    ],
  },

  {
    id: "esp32-oled-encoder",
    title: "ESP32 OLED Control Panel",
    slug: "esp32_oled_ui",
    summary: "128×64 I²C OLED user interface with a detented rotary encoder and push-select.",
    board: { w: 46, h: 38 },
    layers: 2,
    keywords: ["oled", "display", "screen", "encoder", "rotary", "menu", "ui", "knob", "ssd1306", "interface", "128x64"],
    requirements: [
      "128×64 monochrome OLED on I²C 0x3C",
      "Detented rotary encoder with push select",
      "Debounced encoder inputs",
      "USB-C bus power",
      "Panel-mount friendly outline",
    ],
    parts: [
      usbC,
      ldo33,
      esp32,
      p("DS1", "SSD1306 OLED 128×64", "I²C 0x3C", "FPC-4", 2.1, 1, "disp", "Monochrome OLED display", "The SSD1306 needs only two I/O for I²C, leaving the ADC block free for future analog inputs.", [["Resolution", "128 × 64"], ["Interface", "I²C 400 kHz"], ["Supply", "3.3 V · 20 mA"], ["Contrast", "10 000:1"]], { label: "OLED 128×64", kind: "io" }),
      p("SW2", "EC11 Rotary Encoder", "24 det.", "THT 5P", 0.55, 1, "sw", "Rotary encoder with push switch", "24 detents per revolution matches one menu step per click, and the integrated push acts as select.", [["Detents", "24"], ["Push", "SPST"], ["Life", "30 000 cycles"]], { label: "ROTARY ENC", kind: "io" }),
      pullups,
      p("C2", "Murata GRM188 10 nF", "10nF", "0603", 0.02, 2, "cap", "Encoder RC debounce caps", "10 nF with the 4.7 kΩ pull-ups gives a 47 µs filter — well below the fastest human turn rate.", [["Value", "10 nF"], ["Voltage", "50 V"]]),
      decoupling,
      p("D1", "Kingbright APT2012 LED", "WHT", "0805", 0.05, 1, "led", "Backlight indicator", "Signals sleep versus active states when the OLED is blanked to prevent burn-in.", [["V_f", "3.0 V"], ["I_f", "5 mA"]], { label: "STATUS LED", kind: "io" }),
    ],
    nets: [
      { from: "J1", to: "U2", net: "+5V" },
      { from: "U2", to: "U1", net: "+3V3" },
      { from: "U1", to: "R1", net: "I2C_PU" },
      { from: "R1", to: "DS1", net: "I2C_SDA" },
      { from: "U1", to: "DS1", net: "I2C_SCL" },
      { from: "U1", to: "C2", net: "ENC_A" },
      { from: "C2", to: "SW2", net: "ENC_B" },
      { from: "U1", to: "C1", net: "+3V3" },
      { from: "U1", to: "D1", net: "GPIO2" },
    ],
  },

  {
    id: "nrf52-sensor-node",
    title: "nRF52 Battery Sensor Node",
    slug: "nrf52_env_node",
    summary: "Coin-cell BLE environmental node with BME280 sensing and a sub-2 µA sleep current.",
    board: { w: 30, h: 30 },
    layers: 4,
    keywords: ["battery", "nrf52", "ble", "bluetooth", "low power", "coin cell", "environmental", "bme280", "sleep", "wireless sensor"],
    requirements: [
      "Coin-cell operation for 12+ months",
      "BLE advertising of temperature / humidity / pressure",
      "Sub-2 µA sleep current",
      "No LDO in the always-on path",
      "30 × 30 mm 4-layer board with RF keep-out",
    ],
    parts: [
      p("U1", "nRF52832-QFAA", "BLE SoC", "QFN-48", 3.05, 1, "module", "Bluetooth 5 SoC", "Its 1.7–3.6 V operating range runs directly from the coin cell, so no regulator sits in the always-on path.", [["Core", "Cortex-M4F 64 MHz"], ["Sleep", "1.9 µA (RTC on)"], ["TX", "+4 dBm"], ["Supply", "1.7 – 3.6 V"]], { label: "nRF52832", kind: "mcu" }),
      p("U6", "BME280", "T/RH/P", "LGA-8", 3.2, 1, "sensor", "Environmental sensor", "Combines the three requested measurands in one 2.5 × 2.5 mm part at 0.1 µA standby.", [["Temp", "±0.5 °C"], ["Humidity", "±3 %RH"], ["Pressure", "±1 hPa"], ["Standby", "0.1 µA"]], { label: "BME280", kind: "sensor" }),
      p("BT1", "CR2032 Holder", "3V0", "THT Holder", 0.28, 1, "batt", "Coin cell holder", "225 mAh at a 12 µA average gives roughly 20 months between cell changes.", [["Cell", "CR2032"], ["Capacity", "225 mAh"]], { label: "CR2032 CELL", kind: "power" }),
      p("ANT1", "2.4 GHz Chip Antenna", "2G4", "SMD", 0.4, 1, "conn", "Ceramic chip antenna", "A chip antenna with a matched pi-network keeps the board inside 30 mm while retaining −92 dBm sensitivity.", [["Gain", "0.5 dBi"], ["VSWR", "< 2.0"]], { label: "ANTENNA", kind: "io" }),
      p("L2", "Murata 3.9 nH", "3n9", "0402", 0.04, 1, "ind", "Antenna matching inductor", "Part of the pi-match tuned against the measured 50 Ω reference on this stackup.", [["Q", "38"], ["Tolerance", "±0.1 nH"]]),
      p("C3", "Murata GRM155 12 pF", "12pF", "0402", 0.02, 2, "cap", "Matching / load capacitors", "Completes the pi-network and provides crystal loading.", [["Value", "12 pF"], ["Tolerance", "±2%"]]),
      p("Y2", "32.768 kHz Crystal", "32k768", "3215", 0.22, 1, "xtal", "LFXO crystal", "The low-frequency crystal drives the RTC wake timer that dominates sleep-mode accuracy.", [["Tolerance", "±20 ppm"], ["C_L", "9 pF"]]),
      p("J7", "SWD Tag-Connect", "SWD", "TC2030", 0.35, 1, "conn", "Programming footprint", "A footprint-only debug interface avoids a connector on a size-constrained board.", [["Pins", "6"], ["Pitch", "1.27 mm"]], { label: "SWD DEBUG", kind: "io" }),
      decoupling,
    ],
    nets: [
      { from: "BT1", to: "U1", net: "+3V0" },
      { from: "U1", to: "C1", net: "+3V0" },
      { from: "U1", to: "U6", net: "I2C_SDA" },
      { from: "U1", to: "Y2", net: "LFXO" },
      { from: "U1", to: "L2", net: "RF_OUT" },
      { from: "L2", to: "C3", net: "RF_MATCH" },
      { from: "C3", to: "ANT1", net: "ANT_FEED" },
      { from: "U1", to: "J7", net: "SWDIO" },
    ],
  },

  {
    id: "usbc-pd",
    title: "USB-C PD Power Breakout",
    slug: "usbc_pd_breakout",
    summary: "Fixed-profile USB Power Delivery sink breakout delivering up to 20 V / 5 A to screw terminals.",
    board: { w: 36, h: 24 },
    layers: 2,
    keywords: ["usb-c", "usb c", "power delivery", "pd", "breakout", "sink", "20v", "charger", "psu", "power supply", "trigger"],
    requirements: [
      "USB PD 3.0 sink negotiation, fixed profiles",
      "Selectable 5 / 9 / 12 / 15 / 20 V output",
      "100 W (20 V / 5 A) continuous capability",
      "Output bulk capacitance and reverse blocking",
      "Voltage / current status indication",
    ],
    parts: [
      p("J1", "USB4110-GF-A", "USB-C", "USB-C 16P", 0.62, 1, "conn", "USB-C receptacle, PD capable", "Full 16-pin receptacle is required to expose both CC lines for PD negotiation.", [["Rating", "20 V / 5 A"], ["CC pins", "2"], ["Cycles", "10 000"]], { label: "USB-C PD IN", kind: "power" }),
      p("U7", "CH224K", "PD Sink", "ESOP-8", 0.48, 1, "ic", "USB PD / QC sink controller", "The CH224K negotiates fixed PD profiles with resistor-programmed selection — no firmware on the board.", [["Profiles", "5/9/12/15/20 V"], ["I_max", "5 A"], ["Protocols", "PD3.0 · QC4"], ["Package", "ESOP-8"]], { label: "PD SINK CTRL", kind: "mcu" }),
      p("R4", "CC pull-down 5.1 kΩ", "5k1", "0603", 0.01, 2, "res", "CC1 / CC2 pull-downs", "Two 5.1 kΩ resistors present the board as a sink; a single shared resistor would break dual-orientation.", [["Tolerance", "±1%"], ["Power", "100 mW"]]),
      p("R5", "Profile select network", "CFG", "0603", 0.01, 3, "res", "Voltage-select resistor network", "Sets the requested fixed profile on the CFG pin; a jumper block exposes it to the user.", [["Tolerance", "±1%"]]),
      p("Q3", "AO3401 P-FET", "Rev. block", "SOT-23", 0.08, 1, "ic", "Reverse-current blocking FET", "An ideal-diode P-FET avoids the 0.6 V drop and 3 W dissipation a Schottky would incur at 5 A.", [["V_ds", "-30 V"], ["R_dson", "50 mΩ"], ["I_d", "4 A"]]),
      p("C4", "Output bulk 220 µF", "220µF", "D8×10 mm", 0.16, 2, "cap", "Output bulk capacitance", "Two 220 µF in parallel halve the ESR and hold the rail during PD profile transitions.", [["Value", "220 µF"], ["Voltage", "35 V"], ["ESR", "0.11 Ω"]]),
      p("J8", "Screw Terminal 2P", "VOUT", "5.08 mm 2P", 0.22, 1, "conn", "Regulated DC output", "5.08 mm terminal is rated 16 A, well above the 5 A PD ceiling.", [["Rating", "16 A / 300 V"]], { label: "DC OUTPUT", kind: "actuator" }),
      p("D3", "Kingbright APT2012 LED", "PWR", "0805", 0.05, 2, "led", "Profile status LEDs", "Two LEDs encode which fixed profile the sink successfully negotiated.", [["V_f", "2.1 V"], ["I_f", "3 mA"]], { label: "STATUS", kind: "io" }),
      decoupling,
    ],
    nets: [
      { from: "J1", to: "R4", net: "CC1/CC2" },
      { from: "R4", to: "U7", net: "CC_SENSE" },
      { from: "U7", to: "R5", net: "CFG" },
      { from: "J1", to: "Q3", net: "VBUS" },
      { from: "Q3", to: "C4", net: "VOUT" },
      { from: "C4", to: "J8", net: "VOUT" },
      { from: "U7", to: "D3", net: "STATUS" },
      { from: "U7", to: "C1", net: "+3V3" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* prompt matching                                                     */
/* ------------------------------------------------------------------ */

const MCU_HINTS: Array<[RegExp, string]> = [
  [/\bstm32|blue ?pill\b/, "stm32-motor"],
  [/\bnrf52|nordic\b/, "nrf52-sensor-node"],
  [/\barduino|nano|atmega|uno\b/, "nano-ultrasonic"],
];

export function matchTemplate(prompt: string): { template: Template; confidence: number; matched: string[] } {
  const t = prompt.toLowerCase();
  const scored = templates.map((tpl) => {
    const matched = tpl.keywords.filter((k) => t.includes(k));
    let score = matched.length * 3;
    if (t.includes(tpl.title.toLowerCase())) score += 6;
    return { tpl, score, matched };
  });

  for (const [re, id] of MCU_HINTS) {
    if (re.test(t)) {
      const hit = scored.find((s) => s.tpl.id === id);
      if (hit) hit.score += 2;
    }
  }
  if (/\besp32\b/.test(t)) {
    scored.forEach((s) => {
      if (s.tpl.id.startsWith("esp32")) s.score += 1;
    });
  }
  if (/\bsmall|tiny|compact|minimal\b/.test(t)) {
    const hit = scored.find((s) => s.tpl.id === "esp32-blink");
    if (hit) hit.score += 1;
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;
  if (best.score === 0) {
    return { template: genericTemplate(prompt), confidence: 71, matched: [] };
  }
  return {
    template: best.tpl,
    confidence: Math.min(97, 78 + best.score * 2),
    matched: best.matched,
  };
}

/* ------------------------------------------------------------------ */
/* generic fallback assembled from whatever the prompt mentions        */
/* ------------------------------------------------------------------ */

const GENERIC_BLOCKS: Array<{ re: RegExp; part: TemplatePart }> = [
  { re: /led|light|lamp/, part: p("D1", "Kingbright APT2012 LED", "LED", "0805", 0.05, 1, "led", "Indicator LED", "Added because the prompt mentions a light / indicator output.", [["V_f", "2.1 V"]], { label: "LED OUTPUT", kind: "io" }) },
  { re: /button|switch|key/, part: p("SW1", "TS-1088 Tactile", "BTN", "SMD 4P", 0.06, 1, "sw", "Tactile push button", "Added for the user input mentioned in the prompt; debounced in firmware.", [["Life", "100k"]], { label: "USER INPUT", kind: "io" }) },
  { re: /display|screen|oled|lcd/, part: p("DS1", "SSD1306 OLED 128×64", "I²C 0x3C", "FPC-4", 2.1, 1, "disp", "Monochrome OLED", "A display was requested — the SSD1306 uses only the I²C bus.", [["Interface", "I²C"]], { label: "DISPLAY", kind: "io" }) },
  { re: /relay|pump|valve|motor|solenoid/, part: p("K1", "SRD-05VDC-SL-C", "Relay", "THT Relay", 0.85, 1, "relay", "SPDT power relay", "A switched load was mentioned, so a relay stage with flyback protection is included.", [["Contacts", "10 A"]], { label: "LOAD SWITCH", kind: "actuator" }) },
  { re: /temperature|humidity|sensor|probe|measure/, part: p("U4", "BME280", "T/RH/P", "LGA-8", 3.2, 1, "sensor", "Environmental sensor", "Covers the sensing requirement stated in the prompt.", [["Temp", "±0.5 °C"]], { label: "SENSOR", kind: "sensor" }) },
  { re: /battery|coin|portable|solar/, part: p("BT1", "Li-Po JST-PH 2P", "BATT", "JST-PH 2P", 0.15, 1, "batt", "Battery connector", "Portable operation was requested, so a battery input replaces bus-only power.", [["Cells", "1S Li-Po"]], { label: "BATTERY", kind: "power" }) },
  { re: /buzzer|sound|alarm|beep/, part: p("LS1", "Piezo Buzzer 5 V", "BUZZ", "THT-2", 0.35, 1, "sensor", "Active piezo buzzer", "Audible alerting was requested.", [["SPL", "85 dB"]], { label: "BUZZER", kind: "actuator" }) },
];

export function genericTemplate(prompt: string): Template {
  const t = prompt.toLowerCase();
  const extra = GENERIC_BLOCKS.filter((g) => g.re.test(t)).map((g) => g.part);
  const parts = [usbC, ldo33, esp32, decoupling, pullups, ...extra];
  const nets: TemplateNet[] = [
    { from: "J1", to: "U2", net: "+5V" },
    { from: "U2", to: "U1", net: "+3V3" },
    { from: "U1", to: "C1", net: "+3V3" },
    { from: "U1", to: "R1", net: "I2C_PU" },
  ];
  extra.forEach((e, i) => nets.push({ from: "U1", to: e.ref, net: `GPIO${12 + i * 2}` }));

  const w = 34 + extra.length * 3;
  return {
    id: "generic",
    title: "Custom ESP32 Design",
    slug: "custom_design",
    summary: `Generated from your prompt: an ESP32 core with ${extra.length || "no"} additional peripheral block${extra.length === 1 ? "" : "s"} inferred from the description.`,
    board: { w, h: Math.round(w * 0.76) },
    layers: 2,
    keywords: [],
    requirements: [
      "Interpreted from free-form prompt text",
      "ESP32-WROOM-32E selected as the default controller",
      ...extra.map((e) => `${e.block?.label ?? e.name} block included`),
      "USB-C bus power with 3V3 LDO",
    ],
    parts,
    nets,
  };
}
