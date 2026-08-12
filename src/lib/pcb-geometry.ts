import type { Part } from "./design-store";

export type Pad = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  hole: number;
  name: string;
};

const THT = new Set(["conn", "relay", "motor", "batt", "sw", "xtal"]);
const TWO_PIN = new Set(["res", "cap", "led", "diode", "ind"]);

/** pads in part-local coordinates */
export function padsFor(p: Part): Pad[] {
  if (TWO_PIN.has(p.sym)) {
    const pw = Math.max(5, p.pw * 0.3);
    return [
      { x: 0, y: 0, w: pw, h: p.ph, r: 1, hole: 0, name: "1" },
      { x: p.pw - pw, y: 0, w: pw, h: p.ph, r: 1, hole: 0, name: "2" },
    ];
  }

  if (THT.has(p.sym)) {
    const n = Math.max(2, p.pins);
    const gap = p.pw / (n + 1);
    const d = Math.min(11, gap * 0.75);
    return Array.from({ length: n }, (_, i) => ({
      x: gap * (i + 1) - d / 2,
      y: p.ph - d - 3,
      w: d,
      h: d,
      r: d / 2,
      hole: d * 0.42,
      name: String(i + 1),
    }));
  }

  // SMD IC style: pin rows left + right
  const perSide = Math.max(2, Math.round(p.pins / 2));
  const step = p.ph / (perSide + 1);
  const w = 7;
  const h = Math.max(3.5, step * 0.42);
  const pads: Pad[] = [];
  for (let i = 0; i < perSide; i++) {
    pads.push({ x: -w + 1.5, y: step * (i + 1) - h / 2, w, h, r: 1, hole: 0, name: String(i + 1) });
    pads.push({
      x: p.pw - 1.5,
      y: step * (perSide - i) - h / 2,
      w,
      h,
      r: 1,
      hole: 0,
      name: String(perSide + i + 1),
    });
  }
  return pads;
}

export function isPowerNet(net: string) {
  return /^[+-]|gnd|vbus|vbat|vcc|vout|vin|3v3|5v|pump|motor|coil|sw$/i.test(net.trim());
}

/** KiCad-style 45° trace between two points */
export function tracePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  if (adx > ady) {
    return `M${x1} ${y1} H${x1 + sx * (adx - ady)} L${x2} ${y2}`;
  }
  return `M${x1} ${y1} V${y1 + sy * (ady - adx)} L${x2} ${y2}`;
}

/** anchor point on a part used for routing (first pad centre, in board coords) */
export function anchor(p: Part, toward: { px: number; py: number }) {
  const pads = padsFor(p);
  const target = { x: toward.px, y: toward.py };
  let best = pads[0]!;
  let bestD = Infinity;
  for (const pad of pads) {
    const cx = p.px + pad.x + pad.w / 2;
    const cy = p.py + pad.y + pad.h / 2;
    const d = (cx - target.x) ** 2 + (cy - target.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = pad;
    }
  }
  return { x: p.px + best.x + best.w / 2, y: p.py + best.y + best.h / 2 };
}
