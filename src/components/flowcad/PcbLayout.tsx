import { useState } from "react";
import { CadCanvas, useDragItem } from "./CadCanvas";
import {
  EDGE_MARGIN,
  boardPx,
  movePcb,
  selectPart,
  triggerReroute,
  useDesign,
} from "@/lib/design-store";
import { cn } from "@/lib/utils";
import { Layers, Cpu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const BX = 40; // board left offset in SVG units
const BY = 46; // board top offset in SVG units

// ── Trace width in SVG px for a given net-class width in mm ──────────────────
function traceWidthPx(widthMm: number): number {
  return Math.max(1.0, widthMm * 9 * 0.7); // PX_PER_MM * display factor
}

// ── Net-class colour ──────────────────────────────────────────────────────────
function netClassColor(netName: string): string {
  const n = netName.toUpperCase();
  if (n.includes("GND") || n.includes("PWR") || n.includes("VCC") || n.includes("VDD"))
    return "stroke-copper";
  if (n.includes("RF") || n.includes("ANT")) return "stroke-teal";
  if (
    n.includes("SDA") ||
    n.includes("SCL") ||
    n.includes("SPI") ||
    n.includes("MOSI") ||
    n.includes("MISO")
  )
    return "stroke-primary/80";
  return "stroke-copper/70";
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRect({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      className="fill-muted/30 stroke-border/40 animate-pulse"
      strokeWidth="1"
    />
  );
}

// ── Crosshair for mounting holes ──────────────────────────────────────────────
function MountingHoleSvg({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="fill-none stroke-copper/70" strokeWidth="1.2" />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.33}
        className="fill-background stroke-copper"
        strokeWidth="1"
      />
      <line
        x1={cx - r * 1.6}
        x2={cx + r * 1.6}
        y1={cy}
        y2={cy}
        className="stroke-copper/40"
        strokeWidth="0.6"
      />
      <line
        x1={cx}
        x2={cx}
        y1={cy - r * 1.6}
        y2={cy + r * 1.6}
        className="stroke-copper/40"
        strokeWidth="0.6"
      />
    </g>
  );
}

// ── Keepout hatch ─────────────────────────────────────────────────────────────
function KeepoutSvg({ points, label }: { points: string; label: string }) {
  return (
    <g>
      <polygon
        points={points}
        className="fill-warn/8 stroke-warn/60"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      {/* Label at centroid (first vertex as fallback) */}
      <text
        x={points.split(" ")[0]?.split(",")[0] ?? "0"}
        y={(parseFloat(points.split(" ")[0]?.split(",")[1] ?? "0") + 12).toString()}
        className="fill-warn/70 font-mono text-[8px]"
      >
        {label}
      </text>
    </g>
  );
}

// ── Nets sidebar ──────────────────────────────────────────────────────────────
function NetsSidebar({
  netIndex,
  hiddenNets,
  onToggle,
}: {
  netIndex: Record<string, string[]>;
  hiddenNets: Set<string>;
  onToggle: (net: string) => void;
}) {
  const nets = Object.entries(netIndex).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border bg-sidebar text-[10px]">
      <div className="flex h-8 items-center border-b border-border px-2">
        <span className="label-mono text-muted-foreground">NETS ({nets.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {nets.map(([netName, refs]) => {
          const hidden = hiddenNets.has(netName);
          return (
            <button
              key={netName}
              onClick={() => onToggle(netName)}
              className={cn(
                "flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-accent/50 transition-colors",
                hidden && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  netName.toUpperCase().includes("GND")
                    ? "bg-copper"
                    : netName.toUpperCase().includes("VCC") || netName.toUpperCase().includes("3V3")
                      ? "bg-pass"
                      : netName.toUpperCase().includes("RF")
                        ? "bg-teal"
                        : "bg-primary/70",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono">{netName}</span>
              <span className="shrink-0 text-muted-foreground">{refs.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PcbLayout({ projectId }: { projectId?: string }) {
  const d = useDesign();
  const drag = useDragItem();
  const b = boardPx(d);

  const [viewMode, setViewMode] = useState<"copper" | "objects">("copper");
  const [showNets, setShowNets] = useState(true);
  const [hiddenNets, setHiddenNets] = useState<Set<string>>(new Set());

  const outOfSpec = (px: number, py: number, pw: number, ph: number) =>
    px < EDGE_MARGIN ||
    py < EDGE_MARGIN ||
    px + pw > b.w - EDGE_MARGIN ||
    py + ph > b.h - EDGE_MARGIN;

  const toggleNet = (net: string) => {
    setHiddenNets((prev) => {
      const next = new Set(prev);
      next.has(net) ? next.delete(net) : next.add(net);
      return next;
    });
  };

  const netIndex = d.layout?.net_index ?? {};
  const keepouts = d.layout?.keepouts ?? [];
  const mountingHoles = d.layout?.mounting_holes ?? [];
  const traceWidths = d.layout?.trace_widths ?? {};

  // Convert layout mounting holes to SVG coords
  const PX = 9; // PX_PER_MM
  const mountingHoleSvg = mountingHoles.map((mh) => ({
    cx: BX + mh.x_mm * PX,
    cy: BY + mh.y_mm * PX,
    r: (mh.drill_mm / 2) * PX,
  }));

  // Convert keepout zones to SVG polygon point strings
  const keepoutSvgs = keepouts.map((kz) => ({
    points: kz.polygon.map(([x, y]) => `${BX + x * PX},${BY + y * PX}`).join(" "),
    label: kz.label,
  }));

  const statusLeft = (
    <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1">
      {d.pcbLayoutStatus === "ready"
        ? `TOP · L1/L2 · ${d.board.w.toFixed(2)} × ${d.board.h.toFixed(2)} mm · ${d.layout?.layers ?? 2}L FR-4 · ${d.layout?.data_source === "kicad" ? "KiCad" : "Computed"}`
        : d.pcbLayoutStatus === "loading"
          ? "PCB LAYOUT · routing…"
          : d.pcbLayoutStatus === "error"
            ? `PCB ERROR · ${d.pcbLayoutError ?? "unknown"}`
            : "PCB LAYOUT · awaiting generation"}
    </span>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Nets sidebar */}
      {showNets && d.pcbLayoutStatus === "ready" && Object.keys(netIndex).length > 0 && (
        <div className="w-44 shrink-0">
          <NetsSidebar netIndex={netIndex} hiddenNets={hiddenNets} onToggle={toggleNet} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <CadCanvas
          viewBox={`0 0 ${Math.max(560, b.w + 120)} ${Math.max(420, b.h + 130)}`}
          onBackgroundClick={() => selectPart(null)}
          statusLeft={statusLeft}
          statusRight={
            <div className="flex items-center gap-1">
              {/* View toggle */}
              <button
                onClick={() => setViewMode((v) => (v === "copper" ? "objects" : "copper"))}
                className={cn(
                  "label-mono rounded border px-2 py-1 transition-colors",
                  "border-border bg-panel/80 hover:bg-accent/50",
                )}
                title={viewMode === "copper" ? "Switch to Objects view" : "Switch to Copper view"}
              >
                {viewMode === "copper" ? (
                  <Layers className="inline size-3 mr-1" />
                ) : (
                  <Cpu className="inline size-3 mr-1" />
                )}
                {viewMode === "copper" ? "Copper" : "Objects"}
              </button>
              {/* Nets toggle */}
              <button
                onClick={() => setShowNets((v) => !v)}
                className="label-mono rounded border border-border bg-panel/80 px-2 py-1 hover:bg-accent/50"
              >
                Nets {showNets ? "◀" : "▶"}
              </button>
              {/* Auto-Layout button */}
              <Button
                size="sm"
                variant="secondary"
                disabled={d.rerouteInProgress || !projectId}
                onClick={() => projectId && triggerReroute(projectId)}
                className="h-6 gap-1 px-2 font-mono text-[10px]"
              >
                <RefreshCw className={cn("size-3", d.rerouteInProgress && "animate-spin")} />
                {d.rerouteInProgress ? "Routing…" : "Auto-Layout"}
              </Button>
            </div>
          }
        >
          {({ toLocal, snap }) => (
            <>
              {/* ── Board outline ──────────────────────────────────── */}
              <rect
                x={BX}
                y={BY}
                width={b.w}
                height={b.h}
                rx="8"
                className="fill-pass/6 stroke-pass/70"
                strokeWidth="1.6"
              />
              {/* Edge keepout dashes */}
              <rect
                x={BX + EDGE_MARGIN}
                y={BY + EDGE_MARGIN}
                width={Math.max(0, b.w - EDGE_MARGIN * 2)}
                height={Math.max(0, b.h - EDGE_MARGIN * 2)}
                rx="4"
                fill="none"
                strokeDasharray="4 4"
                className="stroke-warn/35"
                strokeWidth="1"
              />

              {/* ── Keepout zones ──────────────────────────────────── */}
              {keepoutSvgs.map((kz, i) => (
                <KeepoutSvg key={i} points={kz.points} label={kz.label} />
              ))}

              {/* ── Mounting holes ─────────────────────────────────── */}
              {mountingHoleSvg.length > 0
                ? mountingHoleSvg.map((mh, i) => (
                  <MountingHoleSvg key={i} cx={mh.cx} cy={mh.cy} r={Math.max(4, mh.r)} />
                ))
                : // Default corner holes when no layout data
                [
                  [BX + 14, BY + 14],
                  [BX + b.w - 14, BY + 14],
                  [BX + 14, BY + b.h - 14],
                  [BX + b.w - 14, BY + b.h - 14],
                ].map(([x, y], i) => (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r="6"
                      className="fill-none stroke-copper/70"
                      strokeWidth="1.2"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="2.6"
                      className="fill-background stroke-copper"
                      strokeWidth="1"
                    />
                  </g>
                ))}

              {/* ── Loading skeleton ───────────────────────────────── */}
              {d.pcbLayoutStatus === "loading" && (
                <>
                  <SkeletonRect x={BX + 20} y={BY + 20} w={80} h={50} />
                  <SkeletonRect x={BX + 120} y={BY + 30} w={60} h={40} />
                  <SkeletonRect x={BX + 200} y={BY + 20} w={90} h={60} />
                  <SkeletonRect x={BX + 20} y={BY + 100} w={40} h={25} />
                  <SkeletonRect x={BX + 80} y={BY + 110} w={40} h={25} />
                </>
              )}

              {/* ── Error state ────────────────────────────────────── */}
              {d.pcbLayoutStatus === "error" && (
                <foreignObject x={BX + 20} y={BY + 30} width={Math.max(300, b.w - 40)} height={100}>
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center">
                    <span className="font-mono text-[10px] font-semibold text-destructive">
                      ⚠ PCB LAYOUT ERROR
                    </span>
                    <span className="font-mono text-[9px] text-destructive/70">
                      {d.pcbLayoutError}
                    </span>
                  </div>
                </foreignObject>
              )}

              {/* ── Idle ───────────────────────────────────────────── */}
              {d.pcbLayoutStatus === "idle" && (
                <foreignObject x={BX + 20} y={BY + 30} width={Math.max(300, b.w - 40)} height={80}>
                  <div className="flex items-center justify-center rounded-xl border border-border bg-panel/60 p-4">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Enter a prompt to generate the PCB layout
                    </span>
                  </div>
                </foreignObject>
              )}

              {/* ── Copper traces (from layout.routing) ─────────────── */}
              {d.pcbLayoutStatus === "ready" &&
                viewMode === "copper" &&
                d.layout?.routing.map((seg, i) => {
                  if (hiddenNets.has(seg.net)) return null;
                  // Get width from net class
                  const nc =
                    Object.keys(traceWidths).find((k) =>
                      k === "Power"
                        ? seg.net.toUpperCase().match(/GND|VCC|VDD|PWR|3V3|5V/)
                        : k === "RF"
                          ? seg.net.toUpperCase().match(/RF|ANT/)
                          : true,
                    ) ?? "Default";
                  const tw = traceWidthPx(traceWidths[nc] ?? 0.2);
                  return (
                    <line
                      key={i}
                      x1={BX + seg.x1_mm * PX}
                      y1={BY + seg.y1_mm * PX}
                      x2={BX + seg.x2_mm * PX}
                      y2={BY + seg.y2_mm * PX}
                      className={netClassColor(seg.net)}
                      strokeWidth={tw}
                      strokeLinecap="round"
                    />
                  );
                })}

              {/* ── Fallback: net connections from d.nets (schematic routing) */}
              {d.pcbLayoutStatus === "ready" &&
                !d.layout?.routing.length &&
                d.nets.map((n, i) => {
                  if (hiddenNets.has(n.net)) return null;
                  const a = d.parts.find((p) => p.ref === n.from);
                  const c = d.parts.find((p) => p.ref === n.to);
                  if (!a || !c) return null;
                  const x1 = BX + a.px + a.pw / 2;
                  const y1 = BY + a.py + a.ph / 2;
                  const x2 = BX + c.px + c.pw / 2;
                  const y2 = BY + c.py + c.ph / 2;
                  return (
                    <path
                      key={i}
                      d={`M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}`}
                      fill="none"
                      className={netClassColor(n.net)}
                      strokeWidth="2"
                    />
                  );
                })}

              {/* ── Component footprints ───────────────────────────── */}
              {d.pcbLayoutStatus === "ready" &&
                d.parts.map((p) => {
                  const active = d.selected === p.ref;
                  const bad = outOfSpec(p.px, p.py, p.pw, p.ph);
                  return (
                    <g
                      key={p.ref}
                      className="cursor-move"
                      onPointerDown={(e) =>
                        drag(e, {
                          toLocal,
                          snap,
                          start: { x: p.px, y: p.py },
                          onMove: (x, y) => movePcb(p.ref, x, y),
                          onSelect: () => selectPart(p.ref),
                        })
                      }
                    >
                      <rect
                        x={BX + p.px}
                        y={BY + p.py}
                        width={p.pw}
                        height={p.ph}
                        rx="2"
                        strokeWidth={active ? 2.2 : 1.2}
                        className={cn(
                          "fill-panel-raised stroke-silk/70",
                          bad && "stroke-warn",
                          active &&
                          "stroke-teal fill-teal/14 [filter:drop-shadow(0_0_6px_var(--color-teal))]",
                        )}
                      />
                      {/* Pin 1 marker */}
                      <circle
                        cx={BX + p.px + 7}
                        cy={BY + p.py + 7}
                        r="2"
                        className="fill-silk/80"
                      />
                      {/* Ref designator */}
                      <text
                        x={BX + p.px + p.pw / 2}
                        y={BY + p.py + p.ph / 2 + 3}
                        textAnchor="middle"
                        className="fill-silk font-mono text-[9px]"
                      >
                        {p.ref}
                      </text>
                    </g>
                  );
                })}

              {/* ── DRC note + footer ──────────────────────────────── */}
              <text x={BX} y={BY + b.h + 20} className="fill-muted-foreground font-mono text-[9px]">
                {d.pcbLayoutStatus === "ready"
                  ? `GND POUR L2 · MIN TRACE ${d.layout?.trace_widths?.['Default']?.toFixed(2) ?? "0.20"} mm · ${d.parts.length} PLACED`
                  : ""}
              </text>
              {d.drcNote && (
                <text x={BX} y={BY - 12} className="fill-warn font-mono text-[9px]">
                  ⚠ DRC: {d.drcNote}
                </text>
              )}
            </>
          )}
        </CadCanvas>
      </div>
    </div>
  );
}
