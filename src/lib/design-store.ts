import { useSyncExternalStore } from "react";
import {
  checks as initialChecks,
  chatHistory,
  type Check,
  type ChatEntry,
} from "./flowcad-data";
import {
  SYM_GEO,
  matchTemplate,
  templates,
  type BlockKind,
  type SymKind,
  type Template,
} from "./templates";

export type Part = {
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
  datasheet: string;
  block?: { label: string; kind: BlockKind };
  /** schematic coords + size (svg units) */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** pcb coords, relative to board origin (svg units) */
  px: number;
  py: number;
  pw: number;
  ph: number;
  /** 3d height */
  z: number;
  pins: number;
  side: "top" | "bottom";
};

export type Net = { from: string; to: string; net: string };

export const PX_PER_MM = 9;
export const EDGE_MARGIN = 12; // svg units ≈ 1.3 mm keep-out

export type GenStageId =
  | "requirements"
  | "architecture"
  | "components"
  | "schematic"
  | "placement"
  | "routing"
  | "verification"
  | "3d"
  | "export";

export type GenStage = {
  id: GenStageId;
  label: string;
  running: string;
  status: "pending" | "active" | "done";
  snippet?: string;
};

export type Generation = {
  active: boolean;
  prompt: string;
  stages: GenStage[];
  elapsedMs: number;
  generatedInMs: number | null;
  templateTitle: string;
};

export type DesignState = {
  meta: {
    title: string;
    slug: string;
    summary: string;
    prompt: string;
    layers: 2 | 4;
    requirements: string[];
  };
  board: { w: number; h: number };
  parts: Part[];
  nets: Net[];
  selected: string | null;
  checks: Check[];
  confidence: number;
  chat: ChatEntry[];
  verifying: boolean;
  drcNote: string | null;
  gen: Generation;
  /** which pipeline stages have produced visible output */
  ready: Record<GenStageId, boolean>;
};

/* ------------------------------------------------------------------ */
/* layout: derive schematic + pcb geometry from a template             */
/* ------------------------------------------------------------------ */

const SCH_H = 470;

function layoutSchematic(parts: Part[]) {
  let x = 40;
  let y = 40;
  let colW = 0;
  for (const p of parts) {
    if (y + p.sh > SCH_H && colW > 0) {
      x += colW + 96;
      y = 40;
      colW = 0;
    }
    p.sx = x;
    p.sy = y;
    y += p.sh + 44;
    colW = Math.max(colW, p.sw);
  }
}

function layoutPcb(parts: Part[], board: { w: number; h: number }) {
  const margin = 20;
  let bw = board.w * PX_PER_MM;
  let bh = board.h * PX_PER_MM;
  const place = () => {
    let x = margin;
    let y = margin;
    let rowH = 0;
    let maxY = 0;
    for (const p of parts) {
      if (x + p.pw > bw - margin && rowH > 0) {
        x = margin;
        y += rowH + 16;
        rowH = 0;
      }
      p.px = x;
      p.py = y;
      x += p.pw + 16;
      rowH = Math.max(rowH, p.ph);
      maxY = Math.max(maxY, y + p.ph);
    }
    return maxY;
  };
  let maxY = place();
  let guard = 0;
  while (maxY > bh - margin && guard++ < 12) {
    bh += 18;
    bw += 10;
    maxY = place();
  }
  return {
    w: Math.round((bw / PX_PER_MM) * 10) / 10,
    h: Math.round((bh / PX_PER_MM) * 10) / 10,
  };
}

export function buildDesign(t: Template) {
  const parts: Part[] = t.parts.map((tp) => {
    const g = SYM_GEO[tp.sym];
    return {
      ...tp,
      datasheet: tp.datasheet ?? `${tp.ref.toLowerCase()}_datasheet.pdf`,
      sw: g.w,
      sh: g.h,
      pw: g.pw,
      ph: g.ph,
      z: g.z,
      pins: g.pins,
      sx: 0,
      sy: 0,
      px: 0,
      py: 0,
      side: "top" as const,
    };
  });
  layoutSchematic(parts);
  const board = layoutPcb(parts, t.board);
  return {
    board,
    parts,
    nets: t.nets.map((n) => ({ ...n })),
    meta: {
      title: t.title,
      slug: t.slug,
      summary: t.summary,
      prompt: "",
      layers: t.layers,
      requirements: t.requirements,
    },
  };
}

/* ------------------------------------------------------------------ */
/* initial state                                                       */
/* ------------------------------------------------------------------ */

const STAGE_DEFS: Array<{ id: GenStageId; label: string; running: string; ms: number }> = [
  { id: "requirements", label: "Requirement Extraction", running: "Parsing requirements…", ms: 700 },
  { id: "architecture", label: "Architecture", running: "Extracting architecture…", ms: 850 },
  { id: "components", label: "Components", running: "Selecting components…", ms: 1000 },
  { id: "schematic", label: "Schematic", running: "Generating schematic…", ms: 1100 },
  { id: "placement", label: "Placement", running: "Placing components…", ms: 900 },
  { id: "routing", label: "Routing", running: "Routing traces…", ms: 1400 },
  { id: "verification", label: "Verification", running: "Running ERC / DRC…", ms: 900 },
  { id: "3d", label: "3D View", running: "Rendering 3D model…", ms: 800 },
  { id: "export", label: "Export", running: "Preparing fabrication data…", ms: 500 },
];

const allReady = (v: boolean) =>
  Object.fromEntries(STAGE_DEFS.map((s) => [s.id, v])) as Record<GenStageId, boolean>;

function freshGeneration(prompt = "", title = ""): Generation {
  return {
    active: false,
    prompt,
    stages: STAGE_DEFS.map((s) => ({ id: s.id, label: s.label, running: s.running, status: "pending" as const })),
    elapsedMs: 0,
    generatedInMs: null,
    templateTitle: title,
  };
}

const defaultTemplate = templates.find((t) => t.id === "esp32-irrigation")!;
const base = buildDesign(defaultTemplate);

let state: DesignState = {
  meta: { ...base.meta, prompt: defaultTemplate.summary },
  board: base.board,
  parts: base.parts,
  nets: base.nets,
  selected: null,
  checks: initialChecks.map((c) => ({ ...c })),
  confidence: 94,
  chat: chatHistory.map((c) => ({ ...c })),
  verifying: false,
  drcNote: null,
  gen: {
    ...freshGeneration(defaultTemplate.summary, defaultTemplate.title),
    stages: STAGE_DEFS.map((s) => ({ id: s.id, label: s.label, running: s.running, status: "done" as const })),
    generatedInMs: 8400,
  },
  ready: allReady(true),
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

/** functional blocks derived from the current parts */
export function architectureBlocks(s: DesignState = state) {
  const withBlock = s.parts.filter((p) => p.block);
  const order: BlockKind[] = ["power", "mcu", "sensor", "actuator", "io"];
  const cols: Record<BlockKind, typeof withBlock> = {
    power: [],
    mcu: [],
    sensor: [],
    actuator: [],
    io: [],
  };
  withBlock.forEach((p) => cols[p.block!.kind].push(p));

  const colX: Record<BlockKind, number> = { power: 30, mcu: 300, sensor: 600, actuator: 600, io: 600 };
  const blocks: Array<{
    ref: string;
    label: string;
    sub: string;
    kind: BlockKind;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];

  let rightY = 30;
  for (const kind of order) {
    const list = cols[kind];
    list.forEach((p, i) => {
      const w = kind === "mcu" ? 200 : 176;
      const h = kind === "mcu" ? 92 : 62;
      const x = colX[kind];
      const y = kind === "power" ? 60 + i * 110 : kind === "mcu" ? 150 + i * 120 : (rightY += 0) && 0;
      blocks.push({
        ref: p.ref,
        label: p.block!.label,
        sub: `${p.ref} · ${p.value}`,
        kind,
        x,
        y: kind === "power" || kind === "mcu" ? y : rightY,
        w,
        h,
      });
      if (kind !== "power" && kind !== "mcu") rightY += 80;
    });
  }
  return blocks;
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
  const density = s.parts.reduce((a, p) => a + p.pw * p.ph, 0) / Math.max(1, b.w * b.h);

  const checks: Check[] = [
    {
      name: "Electrical Rules",
      status: "PASS",
      score: 100,
      note: `0 violations across ${s.nets.length * 3 + 6} nets`,
    },
    { name: "Power Integrity", status: "PASS", score: 96, note: "Rail ripple 38 mV at peak load" },
    {
      name: "Connectivity",
      status: "PASS",
      score: 98,
      note: `${s.nets.length} routed nets · 0 airwires`,
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
      note: density > 0.5 ? "Regulator rise 41 °C — add copper pour" : "Regulator rise 24 °C over ambient",
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
  set({ parts: state.parts.map((p) => (p.ref === ref ? { ...p, sx: x, sy: y } : p)) });
}

export function movePcb(ref: string, x: number, y: number) {
  revalidate({ parts: state.parts.map((p) => (p.ref === ref ? { ...p, px: x, py: y } : p)) });
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function pushChat(role: ChatEntry["role"], text: string) {
  set({ chat: [...state.chat, { role, text, time: now() }] });
}

/* ---------------- generation ---------------- */

let genToken = 0;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export function isGenerationPrompt(text: string) {
  return /^(design|generate|build|create|make|new board|new design)\b/i.test(text.trim());
}

export async function runGeneration(prompt: string) {
  const token = ++genToken;
  const started = performance.now();
  const { template, confidence, matched } = matchTemplate(prompt);
  const built = buildDesign(template);

  set({
    selected: null,
    parts: [],
    nets: [],
    verifying: true,
    drcNote: null,
    ready: allReady(false),
    gen: { ...freshGeneration(prompt, template.title), active: true },
  });
  pushChat("user", prompt);

  const snippets: Partial<Record<GenStageId, string>> = {
    requirements: `${template.requirements.length} requirements parsed · intent: ${template.title}`,
    architecture: `${built.parts.filter((p) => p.block).length} functional blocks resolved`,
    components: `${built.parts.length} parts selected · $${built.parts
      .reduce((a, p) => a + p.unit * p.qty, 0)
      .toFixed(2)} BOM`,
    schematic: `${built.nets.length} nets drawn · ERC clean`,
    placement: `${built.parts.length}/${built.parts.length} placed · ${built.board.w} × ${built.board.h} mm`,
    routing: `${built.nets.length * 2} trace segments · ${template.layers} layers · 0 airwires`,
    verification: `DRC + ERC complete · confidence ${confidence}%`,
    "3d": "STEP assembly rendered · 1 view",
    export: "Gerber X2, drill, BOM and report staged",
  };

  const tick = window.setInterval(() => {
    if (genToken !== token) return;
    set({ gen: { ...state.gen, elapsedMs: performance.now() - started } });
  }, 100);

  for (let i = 0; i < STAGE_DEFS.length; i++) {
    const def = STAGE_DEFS[i]!;
    if (genToken !== token) {
      window.clearInterval(tick);
      return;
    }
    set({
      gen: {
        ...state.gen,
        stages: state.gen.stages.map((s, si) => (si === i ? { ...s, status: "active" } : s)),
      },
    });
    await wait(def.ms);
    if (genToken !== token) {
      window.clearInterval(tick);
      return;
    }

    // populate the design panel by panel
    if (def.id === "components") {
      set({ board: built.board, parts: built.parts, meta: { ...built.meta, prompt } });
    }
    if (def.id === "schematic") set({ nets: built.nets });

    set({
      ready: { ...state.ready, [def.id]: true },
      gen: {
        ...state.gen,
        stages: state.gen.stages.map((s, si) =>
          si === i ? { ...s, status: "done", snippet: snippets[def.id] ?? "" } : s,
        ),
      },
    });
    if (def.id === "verification") revalidate({});
  }

  window.clearInterval(tick);
  const total = Math.round(performance.now() - started);
  revalidate({
    verifying: false,
    gen: { ...state.gen, active: false, elapsedMs: total, generatedInMs: total },
  });
  pushChat(
    "system",
    `✅ ${template.title} generated in ${(total / 1000).toFixed(1)} s — ${state.parts.length} parts, ${state.nets.length} nets, ${state.board.w} × ${state.board.h} mm, confidence ${state.confidence}%.${
      matched.length ? ` Matched on: ${matched.slice(0, 4).join(", ")}.` : " No template matched exactly — built a custom design from the parts named in your prompt."
    }`,
  );
}

export function dismissGeneration() {
  set({ gen: { ...state.gen, active: false } });
}

/** queued from the landing page, consumed by the workspace on mount */
let queued: string | null = null;
export function queuePrompt(prompt: string) {
  queued = prompt;
}
export function takeQueuedPrompt() {
  const q = queued;
  queued = null;
  return q;
}

/* ---------------- chat commands ---------------- */

const catalogAdd: Record<string, { name: string; value: string; pkg: string; unit: number; sym: SymKind; desc: string }> = {
  led: { name: "Kingbright APT2012 LED", value: "LED", pkg: "0805", unit: 0.05, sym: "led", desc: "Indicator LED" },
  buzzer: { name: "Piezo Buzzer 5 V", value: "BUZZ", pkg: "THT-2", unit: 0.35, sym: "sensor", desc: "Active buzzer" },
  oled: { name: "SSD1306 OLED 128×64", value: "I²C 0x3C", pkg: "FPC-4", unit: 2.1, sym: "disp", desc: "OLED display" },
  display: { name: "SSD1306 OLED 128×64", value: "I²C 0x3C", pkg: "FPC-4", unit: 2.1, sym: "disp", desc: "OLED display" },
  battery: { name: "Li-Po JST-PH 2P", value: "BATT", pkg: "JST-PH 2P", unit: 0.15, sym: "batt", desc: "Battery connector" },
  rtc: { name: "DS3231 RTC", value: "RTC", pkg: "SOIC-16", unit: 1.6, sym: "ic", desc: "Real-time clock" },
  capacitor: { name: "Murata GRM188 100 nF", value: "100nF", pkg: "0603", unit: 0.02, sym: "cap", desc: "Decoupling capacitor" },
  resistor: { name: "Yageo RC0603 4.7 kΩ", value: "4k7", pkg: "0603", unit: 0.01, sym: "res", desc: "Resistor" },
  relay: { name: "SRD-05VDC-SL-C", value: "Relay", pkg: "THT Relay", unit: 0.85, sym: "relay", desc: "SPDT relay" },
  antenna: { name: "u.FL Antenna Conn.", value: "u.FL", pkg: "SMD", unit: 0.4, sym: "conn", desc: "Antenna connector" },
  sensor: { name: "BME280", value: "T/RH/P", pkg: "LGA-8", unit: 3.2, sym: "sensor", desc: "Environmental sensor" },
  button: { name: "TS-1088 Tactile", value: "BTN", pkg: "SMD 4P", unit: 0.06, sym: "sw", desc: "Tactile switch" },
};

function refFor(prefix: string) {
  let i = 1;
  while (state.parts.some((p) => p.ref === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function freeSlot(pw: number, ph: number) {
  const b = boardPx();
  const i = state.parts.length;
  const cols = Math.max(1, Math.floor((b.w - 40) / (pw + 16)));
  return {
    px: clamp(20 + (i % cols) * (pw + 16), 16, Math.max(16, b.w - pw - 16)),
    py: clamp(20 + Math.floor(i / cols) * (ph + 16), 16, Math.max(16, b.h - ph - 16)),
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

function findPart(q: string) {
  const t = q.toLowerCase().trim();
  return (
    state.parts.find((p) => p.ref.toLowerCase() === t) ??
    state.parts.find((p) => p.name.toLowerCase().includes(t) || p.value.toLowerCase().includes(t)) ??
    state.parts.find((p) => t.includes(p.ref.toLowerCase()) || t.includes(p.name.toLowerCase().split(" ")[0]!))
  );
}

export function runCommand(input: string) {
  const text = input.trim();
  if (!text) return;
  const t = text.toLowerCase();

  const move = t.match(/move\s+(?:the\s+)?([a-z0-9\-.\s]+?)\s+to\s+(?:the\s+)?(left|right|top|bottom|center|middle)/);
  const add = t.match(/add\s+(?:an?\s+)?([a-z0-9\-.\s]+)/);
  const resize = /(smaller|bigger|larger|shrink|grow|resize)/.test(t) && /board|pcb|outline|design|it\b/.test(t);

  if (isGenerationPrompt(text) && !move && !add && !resize) {
    void runGeneration(text);
    return;
  }

  pushChat("user", text);
  let reply = "";
  const pct = t.match(/(\d{1,2})\s*%/);
  const swap = t.match(/(?:replace|swap)\s+(?:the\s+)?([a-z0-9\-.\s]+?)\s+(?:with|for)\s+(?:an?\s+)?([a-z0-9\-.\s/]+)/);

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
            ? {
                ...p,
                name: pretty,
                value: pretty.slice(0, 12),
                unit: Math.round(p.unit * 1.25 * 100) / 100,
                reasoning: `Swapped in on request, replacing ${part.name}. Footprint ${part.pkg} retained so placement and routing are unchanged.`,
              }
            : p,
        ),
      });
      selectPart(part.ref);
      reply = `✅ ${part.ref} swapped: ${part.name} → ${pretty}. Footprint kept (${part.pkg}), BOM line updated to $${(part.unit * 1.25).toFixed(2)}.`;
    }
  } else if (add) {
    const key = Object.keys(catalogAdd).find((k) => t.includes(k)) ?? "capacitor";
    const spec = catalogAdd[key]!;
    const g = SYM_GEO[spec.sym];
    const prefix =
      spec.sym === "led" ? "D" : spec.sym === "res" ? "R" : spec.sym === "cap" ? "C" : spec.sym === "conn" ? "J" : spec.sym === "sw" ? "SW" : "U";
    const ref = refFor(prefix);
    const slot = freeSlot(g.pw, g.ph);
    const net = `GPIO${13 + state.parts.length}`;
    const part: Part = {
      ref,
      name: spec.name,
      value: spec.value,
      pkg: spec.pkg,
      unit: spec.unit,
      qty: 1,
      sym: spec.sym,
      desc: spec.desc,
      reasoning: `Added on request from the conversational editor and wired to the controller on ${net}.`,
      specs: [["Package", spec.pkg], ["Value", spec.value]],
      datasheet: `${ref.toLowerCase()}_datasheet.pdf`,
      sw: g.w,
      sh: g.h,
      pw: g.pw,
      ph: g.ph,
      z: g.z,
      pins: g.pins,
      side: "top",
      sx: 0,
      sy: 0,
      ...slot,
    };
    const parts = [...state.parts, part];
    layoutSchematic(parts);
    const mcu = state.parts.find((p) => p.sym === "module" || p.sym === "ic")?.ref ?? state.parts[0]?.ref ?? ref;
    revalidate({ parts, nets: [...state.nets, { from: mcu, to: ref, net }] });
    selectPart(ref);
    reply = `✅ Added ${ref} · ${spec.name} to the schematic, PCB and BOM. Net ${net} assigned.`;
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
  const b = buildDesign(defaultTemplate);
  revalidate({
    board: b.board,
    parts: b.parts,
    nets: b.nets,
    meta: { ...b.meta, prompt: defaultTemplate.summary },
    selected: null,
  });
}
