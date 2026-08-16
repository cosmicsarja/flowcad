import { selectPart, useDesign } from "@/lib/design-store";
import { CadCanvas } from "./CadCanvas";
import { cn } from "@/lib/utils";

// ── Category tones (border + fill) ───────────────────────────────────────────
const kindTone: Record<string, string> = {
  power: "stroke-copper/70 fill-copper/8",
  mcu: "stroke-teal/80 fill-teal/10",
  sensor: "stroke-primary/70 fill-primary/8",
  actuator: "stroke-pass/70 fill-pass/8",
  io: "stroke-muted-foreground/60 fill-muted/40",
  passive: "stroke-muted-foreground/40 fill-muted/20",
};

// ── Category icons (inline SVG paths, 16×16 viewBox) ─────────────────────────
function KindIcon({ kind, x, y }: { kind: string; x: number; y: number }) {
  const common = "fill-none stroke-current";
  switch (kind) {
    case "power":
      return (
        <g transform={`translate(${x - 7},${y - 7})`} className="stroke-copper/70">
          {/* lightning bolt */}
          <path d="M9 2 L5 9 h4 L7 14 L13 7 h-4 Z" className={common} strokeWidth="1.2" />
        </g>
      );
    case "mcu":
      return (
        <g transform={`translate(${x - 7},${y - 7})`} className="stroke-teal/80">
          {/* chip */}
          <rect x="3" y="3" width="10" height="10" rx="1" className={common} strokeWidth="1.2" />
          <line x1="3" y1="6" x2="1" y2="6" strokeWidth="1" className="stroke-current" />
          <line x1="3" y1="9" x2="1" y2="9" strokeWidth="1" className="stroke-current" />
          <line x1="13" y1="6" x2="15" y2="6" strokeWidth="1" className="stroke-current" />
          <line x1="13" y1="9" x2="15" y2="9" strokeWidth="1" className="stroke-current" />
        </g>
      );
    case "sensor":
      return (
        <g transform={`translate(${x - 7},${y - 7})`} className="stroke-primary/70">
          {/* eye */}
          <ellipse cx="8" cy="8" rx="6" ry="3.5" className={common} strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2" className={common} strokeWidth="1.2" />
        </g>
      );
    case "actuator":
      return (
        <g transform={`translate(${x - 7},${y - 7})`} className="stroke-pass/70">
          {/* cog */}
          <circle cx="8" cy="8" r="3" className={common} strokeWidth="1.2" />
          <circle
            cx="8"
            cy="8"
            r="5.5"
            className={common}
            strokeWidth="1.2"
            strokeDasharray="2.5 1.5"
          />
        </g>
      );
    default:
      return (
        <g transform={`translate(${x - 7},${y - 7})`} className="stroke-muted-foreground/60">
          {/* plug */}
          <rect x="5" y="3" width="6" height="8" rx="1" className={common} strokeWidth="1.2" />
          <line x1="8" y1="11" x2="8" y2="14" strokeWidth="1.4" className="stroke-current" />
        </g>
      );
  }
}

type ArchNodeGeom = { id: string; x: number; y: number; w: number; h: number };

// ── Edge routing ──────────────────────────────────────────────────────────────
function edge(fromId: string, toId: string, nodes: ArchNodeGeom[]) {
  const a = nodes.find((b) => b.id === fromId);
  const b = nodes.find((b) => b.id === toId);
  if (!a || !b) return { d: "", lx: 0, ly: 0 };
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const mx = x1 + (x2 - x1) / 2;
  return { d: `M${x1} ${y1} H${mx} V${y2} H${x2}`, lx: mx, ly: (y1 + y2) / 2 };
}

// ── Skeleton placeholder block ────────────────────────────────────────────────
function SkeletonBlock({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={8}
      className="fill-muted/30 stroke-border/50 animate-pulse"
      strokeWidth="1"
    />
  );
}

// ── Error / empty overlay ─────────────────────────────────────────────────────
function StatusOverlay({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <foreignObject x="200" y="160" width="500" height="120">
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center",
          isError
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-border bg-panel/60 text-muted-foreground",
        )}
      >
        <span className="font-mono text-[11px] font-semibold tracking-wide">
          {isError ? "⚠ ARCHITECTURE ERROR" : "⌛ WAITING FOR ARCHITECTURE"}
        </span>
        <span className="font-mono text-[10px] opacity-70">{message}</span>
      </div>
    </foreignObject>
  );
}

export function BlockDiagram() {
  const d = useDesign();

  const nodes = d.architecture?.nodes ?? [];
  const edges = d.architecture?.edges ?? [];

  const statusLeft = (
    <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1">
      {d.blockDiagramStatus === "ready"
        ? `ARCHITECTURE · ${nodes.length} functional blocks`
        : d.blockDiagramStatus === "loading"
          ? "ARCHITECTURE · loading…"
          : d.blockDiagramStatus === "error"
            ? "ARCHITECTURE · error"
            : "ARCHITECTURE · awaiting generation"}
    </span>
  );

  return (
    <CadCanvas
      viewBox="0 0 900 440"
      onBackgroundClick={() => selectPart(null)}
      statusLeft={statusLeft}
    >
      {() => (
        <>
          {/* ── Skeleton loading ─────────────────────────────── */}
          {d.blockDiagramStatus === "loading" && (
            <>
              <SkeletonBlock x={30} y={60} w={170} h={62} />
              <SkeletonBlock x={30} y={160} w={170} h={62} />
              <SkeletonBlock x={260} y={100} w={200} h={92} />
              <SkeletonBlock x={520} y={50} w={176} h={62} />
              <SkeletonBlock x={520} y={160} w={176} h={62} />
              <SkeletonBlock x={520} y={270} w={176} h={62} />
            </>
          )}

          {/* ── Error state ──────────────────────────────────── */}
          {d.blockDiagramStatus === "error" && (
            <StatusOverlay message={d.blockDiagramError ?? "Unknown error"} isError />
          )}

          {/* ── Idle (no generation started) ─────────────────── */}
          {d.blockDiagramStatus === "idle" && (
            <StatusOverlay message="Enter a prompt below to generate the architecture" />
          )}

          {/* ── Real data ────────────────────────────────────── */}
          {d.blockDiagramStatus === "ready" && (
            <>
              {edges.map((c) => {
                const e = edge(c.from, c.to, nodes as ArchNodeGeom[]);
                if (!e.d) return null;
                return (
                  <g key={`${c.from}-${c.to}`}>
                    <path
                      d={e.d}
                      fill="none"
                      className="trace-flow stroke-primary/70"
                      strokeWidth="1.6"
                    />
                    <rect
                      x={e.lx - c.net.length * 3.6 - 5}
                      y={e.ly - 9}
                      width={c.net.length * 7.2 + 10}
                      height={16}
                      rx={4}
                      className="fill-background stroke-border"
                      strokeWidth="1"
                    />
                    <text
                      x={e.lx}
                      y={e.ly + 2.5}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono text-[9px]"
                    >
                      {c.net}
                    </text>
                  </g>
                );
              })}

              {nodes.map((b) => {
                const ref = b.sub ? (b.sub.split(" ")[0] ?? null) : null;
                const active = d.selected === ref;
                const cx = b.x + b.w / 2;
                const cy = b.y + b.h / 2;
                return (
                  <g
                    key={b.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      selectPart(ref ?? null);
                    }}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                  >
                    <rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={8}
                      strokeWidth={active ? 2 : 1.3}
                      className={cn(
                        kindTone[b.kind] || kindTone["io"],
                        active && "stroke-teal fill-teal/18",
                      )}
                    />
                    {/* Category icon */}
                    <KindIcon kind={b.kind} x={b.x + 16} y={cy} />
                    <text
                      x={cx + 6}
                      y={cy - 4}
                      textAnchor="middle"
                      className="fill-foreground font-mono text-[11px] font-medium"
                    >
                      {b.label}
                    </text>
                    <text
                      x={cx + 6}
                      y={cy + 12}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono text-[9px]"
                    >
                      {b.sub}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </>
      )}
    </CadCanvas>
  );
}
