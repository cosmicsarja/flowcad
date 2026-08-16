export type StageStatus = "done" | "active" | "pending" | "warning";

export type Stage = {
  id: string;
  name: string;
  short: string;
  status: StageStatus;
  detail: string;
};

export const stages: Stage[] = [
  {
    id: "requirements",
    name: "Requirement Extraction",
    short: "REQ",
    status: "done",
    detail: "14 requirements parsed from prompt",
  },
  {
    id: "architecture",
    name: "Architecture",
    short: "ARCH",
    status: "done",
    detail: "6 functional blocks resolved",
  },
  {
    id: "components",
    name: "Components",
    short: "BOM",
    status: "done",
    detail: "23 parts selected · 3 alternates",
  },
  {
    id: "schematic",
    name: "Schematic",
    short: "SCH",
    status: "done",
    detail: "41 nets · ERC clean",
  },
  {
    id: "placement",
    name: "Placement",
    short: "PLC",
    status: "done",
    detail: "23/23 placed · 48×36 mm",
  },
  {
    id: "routing",
    name: "Routing",
    short: "RTE",
    status: "done",
    detail: "94% routed · 2 airwires left (manual review recommended)",
  },
  {
    id: "verification",
    name: "Verification",
    short: "VRF",
    status: "done",
    detail: "DRC / ERC complete · 2 warnings",
  },
  {
    id: "3d",
    name: "3D View",
    short: "3D",
    status: "done",
    detail: "STEP model assembly rendered",
  },
  {
    id: "export",
    name: "Export",
    short: "EXP",
    status: "done",
    detail: "Gerber X2 · BOM · Pick & place staged",
  },
];

export type Block = {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "power" | "mcu" | "sensor" | "actuator" | "io";
};

export const blocks: Block[] = [
  {
    id: "usb",
    label: "USB-C 5V IN",
    sub: "J1 · 5V/2A",
    x: 24,
    y: 200,
    w: 150,
    h: 62,
    kind: "power",
  },
  {
    id: "reg",
    label: "AMS1117-3.3",
    sub: "U2 · LDO 3V3",
    x: 214,
    y: 200,
    w: 150,
    h: 62,
    kind: "power",
  },
  {
    id: "mcu",
    label: "ESP32-WROOM-32E",
    sub: "U1 · Wi-Fi MCU",
    x: 424,
    y: 186,
    w: 190,
    h: 90,
    kind: "mcu",
  },
  {
    id: "soil",
    label: "SOIL MOISTURE",
    sub: "J3 · capacitive ADC",
    x: 674,
    y: 60,
    w: 170,
    h: 62,
    kind: "sensor",
  },
  {
    id: "temp",
    label: "DHT22",
    sub: "U4 · temp / RH",
    x: 674,
    y: 150,
    w: 170,
    h: 62,
    kind: "sensor",
  },
  {
    id: "relay",
    label: "RELAY DRIVER",
    sub: "Q1 · ULN2003A",
    x: 674,
    y: 250,
    w: 170,
    h: 62,
    kind: "actuator",
  },
  {
    id: "pump",
    label: "PUMP 12V",
    sub: "J4 · screw term.",
    x: 674,
    y: 340,
    w: 170,
    h: 62,
    kind: "actuator",
  },
  {
    id: "oled",
    label: "OLED 128×64",
    sub: "J2 · I²C 0x3C",
    x: 424,
    y: 330,
    w: 190,
    h: 62,
    kind: "io",
  },
];

export const connections: Array<{ from: string; to: string; net: string }> = [
  { from: "usb", to: "reg", net: "+5V" },
  { from: "reg", to: "mcu", net: "+3V3" },
  { from: "mcu", to: "soil", net: "ADC1_CH0" },
  { from: "mcu", to: "temp", net: "GPIO4" },
  { from: "mcu", to: "relay", net: "GPIO26" },
  { from: "relay", to: "pump", net: "PUMP_SW" },
  { from: "mcu", to: "oled", net: "I2C" },
];

export type Component = {
  ref: string;
  name: string;
  qty: number;
  pkg: string;
  unit: number;
  desc: string;
  datasheet: string;
  reasoning: string;
  specs: Array<[string, string]>;
};

export const components: Component[] = [
  {
    ref: "U1",
    name: "ESP32-WROOM-32E",
    qty: 1,
    pkg: "SMD-38",
    unit: 3.4,
    desc: "Wi-Fi + BLE MCU module",
    datasheet: "esp32-wroom-32e_datasheet_en.pdf",
    reasoning:
      "Selected because the prompt requires Wi-Fi telemetry and at least 3 ADC-capable GPIO for the capacitive soil probe. The WROOM-32E carries an integrated antenna and certified RF front-end, removing the need for a separate RF layout review.",
    specs: [
      ["Supply", "3.0 – 3.6 V"],
      ["Peak current", "500 mA (TX)"],
      ["Flash", "4 MB"],
      ["ADC", "18 ch · 12-bit"],
      ["Interfaces", "I²C, SPI, UART, PWM"],
      ["Temp range", "-40 – 85 °C"],
    ],
  },
  {
    ref: "U2",
    name: "AMS1117-3.3",
    qty: 1,
    pkg: "SOT-223",
    unit: 0.18,
    desc: "3.3 V LDO regulator, 1 A",
    datasheet: "ams1117_rev_c.pdf",
    reasoning:
      "ESP32 requires a stable 3.3 V rail with ≥500 mA headroom for transmit bursts. The AMS1117 meets this with 1 A capability at a 1.3 V dropout from the 5 V USB rail.",
    specs: [
      ["V_out", "3.3 V ±1%"],
      ["I_max", "1 A"],
      ["Dropout", "1.3 V @ 1 A"],
      ["θJA", "61 °C/W"],
    ],
  },
  {
    ref: "U4",
    name: "DHT22 / AM2302",
    qty: 1,
    pkg: "THT-4",
    unit: 2.9,
    desc: "Temperature & humidity sensor",
    datasheet: "dht22_am2302.pdf",
    reasoning:
      "Upgraded from DHT11 at your request — ±0.5 °C accuracy and 0–100 %RH range better fit outdoor irrigation duty. Single-wire interface mapped to GPIO4 with a 10 kΩ pull-up (R7).",
    specs: [
      ["Accuracy", "±0.5 °C / ±2 %RH"],
      ["Supply", "3.3 – 5.5 V"],
      ["Sample rate", "0.5 Hz"],
      ["Interface", "1-wire"],
    ],
  },
  {
    ref: "Q1",
    name: "ULN2003A",
    qty: 1,
    pkg: "SOIC-16",
    unit: 0.42,
    desc: "Darlington relay driver array",
    datasheet: "uln2003a_ti.pdf",
    reasoning:
      "Provides integrated flyback diodes for the inductive pump relay coil, protecting the ESP32 GPIO from back-EMF without discrete components.",
    specs: [
      ["I_out", "500 mA/ch"],
      ["V_max", "50 V"],
      ["Channels", "7"],
    ],
  },
  {
    ref: "K1",
    name: "SRD-05VDC-SL-C",
    qty: 1,
    pkg: "THT Relay",
    unit: 0.85,
    desc: "SPDT power relay 10 A",
    datasheet: "srd_relay.pdf",
    reasoning: "Rated 10 A @ 250 VAC — 4× margin over the 12 V DC pump inrush current.",
    specs: [
      ["Coil", "5 V · 71 mA"],
      ["Contacts", "10 A / 250 VAC"],
    ],
  },
  {
    ref: "J1",
    name: "USB4110-GF-A",
    qty: 1,
    pkg: "USB-C 16P",
    unit: 0.62,
    desc: "USB-C receptacle, power only",
    datasheet: "usb4110.pdf",
    reasoning: "Through-hole shield tabs improve mechanical retention for field-serviced hardware.",
    specs: [
      ["Rating", "5 V / 3 A"],
      ["Cycles", "10 000"],
    ],
  },
  {
    ref: "C1-C6",
    name: "Ceramic Cap 100 nF",
    qty: 6,
    pkg: "0603",
    unit: 0.02,
    desc: "X7R decoupling capacitors",
    datasheet: "grm188r71h104.pdf",
    reasoning: "One decoupling cap per active IC power pin, placed within 2 mm of the pad.",
    specs: [
      ["Value", "100 nF ±10%"],
      ["Voltage", "50 V"],
    ],
  },
  {
    ref: "C7",
    name: "Electrolytic 470 µF",
    qty: 1,
    pkg: "D8×10 mm",
    unit: 0.14,
    desc: "Bulk input capacitance",
    datasheet: "ucd1v471.pdf",
    reasoning: "Buffers the 500 mA Wi-Fi transmit bursts to keep the 3V3 rail ripple under 50 mV.",
    specs: [
      ["Value", "470 µF"],
      ["ESR", "0.09 Ω"],
    ],
  },
  {
    ref: "R1-R8",
    name: "Resistor Network",
    qty: 8,
    pkg: "0603",
    unit: 0.01,
    desc: "Pull-ups & dividers",
    datasheet: "rc0603.pdf",
    reasoning:
      "I²C pull-ups (4.7 kΩ), 1-wire pull-up (10 kΩ), boot strapping and status LED limits.",
    specs: [["Tolerance", "±1%"]],
  },
  {
    ref: "J3",
    name: "Soil Probe Header",
    qty: 1,
    pkg: "JST-XH 3P",
    unit: 0.11,
    desc: "Capacitive moisture probe input",
    datasheet: "jst_xh.pdf",
    reasoning: "Keyed connector prevents reversed probe insertion in the field.",
    specs: [["Pitch", "2.5 mm"]],
  },
  {
    ref: "PCB",
    name: "FR-4 2-layer board",
    qty: 1,
    pkg: "48 × 36 mm",
    unit: 1.9,
    desc: "1.6 mm, HASL, green mask",
    datasheet: "fr4_stackup.pdf",
    reasoning:
      "Two layers are sufficient — no impedance-controlled nets and a solid GND pour on L2.",
    specs: [
      ["Layers", "2"],
      ["Thickness", "1.6 mm"],
      ["Copper", "1 oz"],
      ["Min trace", "0.20 mm"],
    ],
  },
];

export type Check = {
  name: string;
  status: "PASS" | "WARNING" | "FAIL";
  score: number;
  note: string;
};

export const checks: Check[] = [
  { name: "Electrical Rules", status: "PASS", score: 100, note: "0 violations across 41 nets" },
  { name: "Power Integrity", status: "PASS", score: 96, note: "3V3 rail ripple 38 mV @ 500 mA" },
  {
    name: "Connectivity",
    status: "WARNING",
    score: 88,
    note: "Routing incomplete: 2 nets require manual routing",
  },
  { name: "ERC", status: "PASS", score: 100, note: "No unconnected or conflicting pins" },
  { name: "DRC", status: "WARNING", score: 82, note: "2 clearances at 0.19 mm (min 0.20 mm)" },
  { name: "Manufacturing", status: "WARNING", score: 88, note: "Silkscreen overlaps pad on K1" },
  { name: "Thermal", status: "PASS", score: 93, note: "U2 rise 24 °C over ambient" },
];

export const confidence = 94;

export type Alternative = {
  id: string;
  title: string;
  tag: string;
  cost: string;
  power: string;
  size: string;
  parts: number;
  notes: string;
  recommended?: boolean;
};

export const alternatives: Alternative[] = [
  {
    id: "A",
    title: "Design A",
    tag: "Cheapest",
    cost: "$9.84",
    power: "310 mW avg",
    size: "48 × 36 mm",
    parts: 23,
    notes: "AMS1117 LDO, DHT22, single-sided assembly. Lowest BOM cost, highest quiescent draw.",
  },
  {
    id: "B",
    title: "Design B",
    tag: "Low power",
    cost: "$13.20",
    power: "94 mW avg",
    size: "52 × 38 mm",
    parts: 27,
    notes:
      "TPS62203 buck + deep-sleep RTC gating. 3.3× battery life, adds inductor + feedback network.",
    recommended: true,
  },
  {
    id: "C",
    title: "Design C",
    tag: "Smallest",
    cost: "$15.75",
    power: "340 mW avg",
    size: "34 × 28 mm",
    parts: 25,
    notes: "4-layer stackup, 0402 passives, ESP32-MINI-1. Requires finer 0.15 mm DRC class.",
  },
];

export type ChatEntry = { role: "user" | "system"; text: string; time: string };

export const chatHistory: ChatEntry[] = [
  {
    role: "user",
    text: "Design an ESP32-based smart irrigation controller with soil moisture sensor and relay",
    time: "10:02",
  },
  {
    role: "system",
    text: "✅ Requirements extracted (14). Architecture resolved into 6 blocks. 23 components selected from the verified library.",
    time: "10:02",
  },
  { role: "user", text: "Replace DHT11 with DHT22", time: "10:07" },
  {
    role: "system",
    text: "✅ U4 swapped to DHT22 / AM2302. Footprint unchanged (THT-4). Pull-up R7 raised to 10 kΩ. Re-running verification...",
    time: "10:07",
  },
  { role: "user", text: "Make the board 20% smaller", time: "10:11" },
  {
    role: "system",
    text: "✅ Board resized 60×45 mm → 48×36 mm. Re-placed 23 components, 94% auto-routed. ⚠️ 2 clearances now at 0.19 mm — below the 0.20 mm fab class.",
    time: "10:11",
  },
];

export const suggestions = [
  "Move USB-C to the left edge",
  "Add a status LED on GPIO2",
  "Switch to a 4-layer stackup",
  "Reduce BOM cost by 15%",
];

export const exportArtifacts = [
  { name: "Schematic", file: "flowcad_irrigation_sch.pdf", size: "412 KB", fmt: "PDF" },
  { name: "PCB Layout", file: "flowcad_irrigation.kicad_pcb", size: "1.8 MB", fmt: "KICAD" },
  { name: "Netlist", file: "flowcad_irrigation.net", size: "64 KB", fmt: "NET" },
  { name: "Gerber Files", file: "gerber_x2_bundle.zip", size: "3.2 MB", fmt: "ZIP" },
  { name: "Drill Files", file: "drill_pth_npth.zip", size: "88 KB", fmt: "ZIP" },
  { name: "Bill of Materials", file: "bom_lcsc_matched.csv", size: "12 KB", fmt: "CSV" },
  { name: "3D Model", file: "flowcad_irrigation.step", size: "9.4 MB", fmt: "STEP" },
  { name: "Design Report", file: "verification_report.pdf", size: "740 KB", fmt: "PDF" },
];

export const samplePrompt =
  "Design an ESP32-based smart irrigation controller with soil moisture sensor and relay...";

export const bomTotal = components.reduce((s, c) => s + c.unit * c.qty, 0);
