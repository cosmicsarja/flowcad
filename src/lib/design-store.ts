import { useSyncExternalStore } from "react";
import {
  components as catalog,
  checks as initialChecks,
  chatHistory,
  type Check,
  type ChatEntry,
} from "./flowcad-data";

export type Part = {
  ref: string;
  name: string;
  value: string;
  pkg: string;
  unit: number;
  qty: number;
  /** schematic coords (svg units) */
  sx: number;
  sy: number;
  /** pcb coords, relative to board origin (svg units) */
  px: number;
  py: number;
  pw: number;
  ph: number;
  /** 3d height */
  z: number;
  tall?: boolean;
};

export type Net = { from: string; to: string; net: string };

export const PX_PER_MM = 9;
export const EDGE_MARGIN = 12; // svg units ≈ 1.3 mm keep-out

export type DesignState = {
  board: { w: number; h: number };
  parts: Part[];
  nets: Net[];
  selected: string | null;
  checks: Check[];
  confidence: number;
  chat: ChatEntry[];
  verifying: boolean;
  drcNote: string | null;
};

const initialParts: Part[] = [
  { ref: "J1", name: "USB4110-GF-A", value: "USB-C", pkg: "USB-C 16P", unit: 0.62, qty: 1, sx: 40, sy: 60, px: 16, py: 50, pw: 40, ph: 56, z: 10 },
  { ref: "U2", name: "AMS1117-3.3", value: "LDO 3V3", pkg: "SOT-223", unit: 0.18, qty: 1, sx: 220, sy: 60, px: 46, py: 170, pw: 60, ph: 40, z: 8 },
  { ref: "U1", name: "ESP32-WROOM-32E", value: "Wi-Fi MCU", pkg: "SMD-38", unit: 3.4, qty: 1, sx: 400, sy: 130, px: 136, py: 50, pw: 130, ph: 90, z: 14, tall: true },
  { ref: "C7", name: "Electrolytic 470 µF", value: "470µF", pkg: "D8×10 mm", unit: 0.14, qty: 1, sx: 640, sy: 50, px: 226, py: 170, pw: 40, ph: 40, z: 18 },
  { ref: "Q1", name: "ULN2003A", value: "Relay driver", pkg: "SOIC-16", unit: 0.42, qty: 1, sx: 640, sy: 220, px: 300, py: 70, pw: 62, ph: 40, z: 9 },
  { ref: "U4", name: "DHT22 / AM2302", value: "Temp / RH", pkg: "THT-4", unit: 2.9, qty: 1, sx: 400, sy: 300, px: 136, py: 170, pw: 62, ph: 40, z: 12 },
  { ref: "R1", name: "Resistor 10k", value: "10k", pkg: "0603", unit: 0.01, qty: 8, sx: 40, sy: 240, px: 106, py: 130, pw: 26, ph: 18, z: 4 },
  { ref: "K1", name: "SRD-05VDC-SL-C", value: "Relay 10A", pkg: "THT Relay", unit: 0.85, qty: 1, sx: 220, sy: 300, px: 296, py: 160, pw: 80, ph: 62, z: 22 },
  { ref: "J3", name: "Soil Probe Header", value: "JST-XH 3P", pkg: "JST-XH 3P", unit: 0.11, qty: 1, sx: 640, sy: 340, px: 380, py: 24, pw: 46, ph: 30, z: 10 },
];

const initialNets: Net[] = [
  { from: "J1", to: "U2", net: "+5V" },
  { from: "U2", to: "U1", net: "+3V3" },
  { from: "U1", to: "U4", net: "GPIO4" },
  { from: "U1", to: "Q1", net: "GPIO26" },
  { from: "Q1", to: "K1", net: "PUMP_SW" },
  { from: "U1", to: "J3", net: "ADC1_CH0" },
  { from: "U2", to: "C7", net: "+3V3" },
  { from: "R1", to: "U1", net: "I2C_SDA" },
];

let state: DesignState = {
  board: { w: 48, h: 36 },
  parts: initialParts,
  nets: initialNets,
  selected: null,
  checks: initialChecks.map((c) => ({ ...c })),
  confidence: 94,
  chat: chatHistory.map((c) => ({ ...c })),
  verifying: false,
  drcNote: null,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function set(patch: Partial<DesignState>) {
  state = { ...state, ...patch };
  emit();
}

export function useDesign(): DesignState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function getDesign() {
  return state;
}

/* ---------------- derived helpers ---------------- */

export function boardPx(s: DesignState = state) {
  return { w: s.board.w * PX_PER_MM, h: s.board.h * PX_PER_MM };
}

export function partDetails(ref: string) {
  const part = state.parts.find((p) => p.ref === ref);
  const cat = catalog.find((c) => c.ref === ref || c.name === part?.name);
  return { part, cat };
}

export function bomLines(s: DesignState = state) {
  return s.parts.map((p) => ({
    ref: p.ref,
    name: p.name,
    qty: p.qty,
    pkg: p.pkg,
    unit: p.unit,
    total: p.unit * p.qty,
  }));
}

export function bomTotalNow(s: DesignState = state) {
  return bomLines(s).reduce((a, l) => a + l.total, 0);
}

/* ---------------- verification ---------------- */

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

function computeChecks(s: DesignState): { checks: Check[]; confidence: number; drcNote: string | null } {
  const b = boardPx(s);
  const offenders = s.parts.filter(
    (p) =>
      p.px < EDGE_MARGIN ||
      p.py < EDGE_MARGIN ||
      p.px + p.pw > b.w - EDGE_MARGIN ||
      p.py + p.ph > b.h - EDGE_MARGIN,
  );
  const overflow = s.parts.filter((p) => p.px + p.pw > b.w || p.py + p.ph > b.h);
  const density =
    s.parts.reduce((a, p) => a + p.pw * p.ph, 0) / Math.max(1, b.w * b.h);

  const checks: Check[] = [
    { name: "Electrical Rules", status: "PASS", score: 100, note: `0 violations across ${s.nets.length * 5 + 6} nets` },
    {
      name: "Power Integrity",
      status: "PASS",
      score: 96,
      note: "3V3 rail ripple 38 mV @ 500 mA",
    },
    {
      name: "Connectivity",
      status: "PASS",
      score: 98,
      note: `${s.nets.length} routed nets · 2 airwires pending`,
    },
    { name: "ERC", status: "PASS", score: 100, note: "No unconnected or conflicting pins" },
    overflow.length
      ? {
          name: "DRC",
          status: "FAIL" as const,
          score: 46,
          note: `${overflow.map((p) => p.ref).join(", ")} outside board outline`,
        }
      : offenders.length
        ? {
            name: "DRC",
            status: "WARNING" as const,
            score: clamp(90 - offenders.length * 9, 40, 90),
            note: `${offenders.map((p) => p.ref).join(", ")} within 1.3 mm of board edge (min 2.0 mm)`,
          }
        : { name: "DRC", status: "PASS" as const, score: 97, note: "All clearances ≥ 0.20 mm" },
    density > 0.42
      ? {
          name: "Manufacturing",
          status: "WARNING" as const,
          score: clamp(Math.round(100 - density * 90), 45, 90),
          note: `Placement density ${(density * 100).toFixed(0)}% — assembly headroom tight`,
        }
      : { name: "Manufacturing", status: "PASS" as const, score: 94, note: "Silkscreen and pads clear" },
    {
      name: "Thermal",
      status: density > 0.5 ? ("WARNING" as const) : ("PASS" as const),
      score: density > 0.5 ? 78 : 93,
      note: density > 0.5 ? "U2 rise 41 °C — add copper pour" : "U2 rise 24 °C over ambient",
    },
  ];

  const confidence = Math.round(checks.reduce((a, c) => a + c.score, 0) / checks.length);
  const drc = checks.find((c) => c.name === "DRC")!;
  return { checks, confidence, drcNote: drc.status === "PASS" ? null : drc.note };
}

function revalidate(next: Partial<DesignState>) {
  const merged = { ...state, ...next };
  const { checks, confidence, drcNote } = computeChecks(merged);
  set({ ...next, checks, confidence, drcNote });
}

/* ---------------- actions ---------------- */

export function selectPart(ref: string | null) {
  set({ selected: ref });
}

export function moveSchematic(ref: string, x: number, y: number) {
  set({
    parts: state.parts.map((p) => (p.ref === ref ? { ...p, sx: x, sy: y } : p)),
  });
}

export function movePcb(ref: string, x: number, y: number) {
  revalidate({
    parts: state.parts.map((p) => (p.ref === ref ? { ...p, px: x, py: y } : p)),
  });
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function pushChat(role: ChatEntry["role"], text: string) {
  set({ chat: [...state.chat, { role, text, time: now() }] });
}

const catalogAdd: Record<string, Omit<Part, "ref" | "sx" | "sy" | "px" | "py">> = {
  led: { name: "Status LED 0805", value: "LED", pkg: "0805", unit: 0.05, qty: 1, pw: 24, ph: 16, z: 5 },
  buzzer: { name: "Piezo Buzzer", value: "BUZZ", pkg: "THT-2", unit: 0.35, qty: 1, pw: 40, ph: 40, z: 20 },
  oled: { name: "OLED 128×64", value: "I²C 0x3C", pkg: "FPC-4", unit: 2.1, qty: 1, pw: 60, ph: 34, z: 8 },
  battery: { name: "Li-Po Connector", value: "JST-PH", pkg: "JST-PH 2P", unit: 0.15, qty: 1, pw: 30, ph: 24, z: 8 },
  rtc: { name: "DS3231 RTC", value: "RTC", pkg: "SOIC-16", unit: 1.6, qty: 1, pw: 52, ph: 32, z: 7 },
  capacitor: { name: "Ceramic Cap 100 nF", value: "100nF", pkg: "0603", unit: 0.02, qty: 1, pw: 20, ph: 14, z: 3 },
  resistor: { name: "Resistor 4.7k", value: "4k7", pkg: "0603", unit: 0.01, qty: 1, pw: 20, ph: 14, z: 3 },
  antenna: { name: "u.FL Antenna Conn.", value: "u.FL", pkg: "SMD", unit: 0.4, qty: 1, pw: 24, ph: 24, z: 6 },
};

function refFor(prefix: string) {
  let i = 1;
  while (state.parts.some((p) => p.ref === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function freeSlot() {
  const b = boardPx();
  const cols = Math.max(1, Math.floor((b.w - 40) / 70));
  const i = state.parts.length;
  return {
    px: clamp(20 + (i % cols) * 70, 16, Math.max(16, b.w - 70)),
    py: clamp(20 + Math.floor(i / cols) * 50, 16, Math.max(16, b.h - 50)),
  };
}

function clampParts(parts: Part[], b: { w: number; h: number }) {
  return parts.map((p) => ({
    ...p,
    px: clamp(p.px, 4, Math.max(4, b.w - p.pw - 4)),
    py: clamp(p.py, 4, Math.max(4, b.h - p.ph - 4)),
  }));
}

export function resizeBoard(factor: number) {
  const board = {
    w: Math.round(clamp(state.board.w * factor, 18, 140) * 10) / 10,
    h: Math.round(clamp(state.board.h * factor, 14, 120) * 10) / 10,
  };
  const b = { w: board.w * PX_PER_MM, h: board.h * PX_PER_MM };
  revalidate({ board, parts: clampParts(state.parts, b) });
  return board;
}

const LOCATIONS: Record<string, (b: { w: number; h: number }, p: Part) => { px: number; py: number }> = {
  left: (b, p) => ({ px: 16, py: (b.h - p.ph) / 2 }),
  right: (b, p) => ({ px: b.w - p.pw - 16, py: (b.h - p.ph) / 2 }),
  top: (b, p) => ({ px: (b.w - p.pw) / 2, py: 16 }),
  bottom: (b, p) => ({ px: (b.w - p.pw) / 2, py: b.h - p.ph - 16 }),
  center: (b, p) => ({ px: (b.w - p.pw) / 2, py: (b.h - p.ph) / 2 }),
  middle: (b, p) => ({ px: (b.w - p.pw) / 2, py: (b.h - p.ph) / 2 }),
};

function findPart(query: string) {
  const q = query.toLowerCase();
  return (
    state.parts.find((p) => p.ref.toLowerCase() === q) ??
    state.parts.find((p) => p.name.toLowerCase().includes(q) || p.value.toLowerCase().includes(q)) ??
    state.parts.find((p) => q.includes(p.ref.toLowerCase()) || q.includes(p.name.toLowerCase().split(" ")[0]!.toLowerCase()))
  );
}

/** Pattern-matched mock "AI" command interpreter. */
export function runCommand(input: string) {
  const text = input.trim();
  if (!text) return;
  pushChat("user", text);
  const t = text.toLowerCase();
  let reply = "";

  const pct = t.match(/(\d{1,2})\s*%/);
  const resize = /(smaller|bigger|larger|shrink|grow|resize|reduce the size|increase the size)/.test(t) && /board|pcb|outline/.test(t);
  const move = t.match(/move\s+(?:the\s+)?([a-z0-9\-.\s]+?)\s+to\s+(?:the\s+)?(left|right|top|bottom|center|middle)/);
  const swap = t.match(/(?:replace|swap)\s+(?:the\s+)?([a-z0-9\-.\s]+?)\s+(?:with|for)\s+(?:an?\s+)?([a-z0-9\-.\s/]+)/);
  const add = t.match(/add\s+(?:an?\s+)?([a-z0-9\-.\s]+)/);

  if (resize) {
    const p = pct ? Number(pct[1]) / 100 : 0.15;
    const grow = /bigger|larger|grow|increase/.test(t);
    const b = resizeBoard(grow ? 1 + p : 1 - p);
    reply = `✅ Board resized to ${b.w} × ${b.h} mm (${grow ? "+" : "−"}${Math.round(p * 100)}%). Re-placing ${state.parts.length} components…`;
  } else if (move) {
    const part = findPart(move[1]!.trim());
    const loc = move[2]!;
    if (!part) {
      reply = `⚠️ No component matching “${move[1]!.trim()}” in the current design.`;
    } else {
      const b = boardPx();
      const pos = LOCATIONS[loc]!(b, part);
      revalidate({
        parts: state.parts.map((p) =>
          p.ref === part.ref ? { ...p, px: Math.round(pos.px), py: Math.round(pos.py) } : p,
        ),
      });
      selectPart(part.ref);
      reply = `✅ ${part.ref} (${part.name}) moved to the ${loc} of the board. Re-routing affected nets…`;
    }
  } else if (swap) {
    const part = findPart(swap[1]!.trim());
    const newName = swap[2]!.trim().replace(/[.\s]+$/, "");
    if (!part) {
      reply = `⚠️ No component matching “${swap[1]!.trim()}” to replace.`;
    } else {
      const pretty = newName.toUpperCase();
      revalidate({
        parts: state.parts.map((p) =>
          p.ref === part.ref
            ? { ...p, name: pretty, value: pretty.slice(0, 12), unit: Math.round(p.unit * 1.25 * 100) / 100 }
            : p,
        ),
      });
      selectPart(part.ref);
      reply = `✅ ${part.ref} swapped: ${part.name} → ${pretty}. Footprint kept (${part.pkg}), BOM line updated to $${(part.unit * 1.25).toFixed(2)}.`;
    }
  } else if (add) {
    const key =
      Object.keys(catalogAdd).find((k) => t.includes(k)) ??
      (/\bled\b/.test(t) ? "led" : null);
    const spec = key ? catalogAdd[key]! : catalogAdd.capacitor!;
    const prefix = key === "led" ? "D" : key === "resistor" ? "R" : key === "capacitor" ? "C" : "U";
    const ref = refFor(prefix);
    const slot = freeSlot();
    const part: Part = {
      ref,
      ...spec,
      ...slot,
      sx: 60 + ((state.parts.length * 190) % 660),
      sy: 380,
    };
    revalidate({
      parts: [...state.parts, part],
      nets: [...state.nets, { from: "U1", to: ref, net: `GPIO${13 + state.parts.length}` }],
    });
    selectPart(ref);
    reply = `✅ Added ${ref} · ${spec.name} to the schematic, PCB and BOM. Net GPIO${13 + state.parts.length} assigned.`;
  } else {
    reply = "✅ Constraint accepted. Auto-router restarted — re-running verification…";
    revalidate({});
  }

  set({ verifying: true });
  pushChat("system", reply);
  window.setTimeout(() => {
    revalidate({ verifying: false });
    const s = state;
    const warn = s.checks.filter((c) => c.status !== "PASS");
    pushChat(
      "system",
      warn.length
        ? `Verification complete — confidence ${s.confidence}%. ⚠️ ${warn.map((w) => `${w.name}: ${w.note}`).join(" · ")}`
        : `Verification complete — confidence ${s.confidence}%. All DRC/ERC checks pass.`,
    );
  }, 1100);
}

export function resetDesign() {
  state = {
    ...state,
    board: { w: 48, h: 36 },
    parts: initialParts,
    nets: initialNets,
    selected: null,
  };
  revalidate({});
}
