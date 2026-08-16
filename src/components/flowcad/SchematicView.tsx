import { CadCanvas, useDragItem } from "./CadCanvas";
import { moveSchematic, selectPart, useDesign, type Part } from "@/lib/design-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* symbol primitives — IEC/ANSI style                                  */
/* ------------------------------------------------------------------ */

function Leads({ p, vertical = false }: { p: Part; vertical?: boolean }) {
  const cy = p.sy + p.sh / 2;
  const cx = p.sx + p.sw / 2;
  return vertical ? (
    <>
      <line x1={cx} x2={cx} y1={p.sy} y2={p.sy + 8} className="stroke-silk/70" strokeWidth="1.4" />
      <line x1={cx} x2={cx} y1={p.sy + p.sh - 8} y2={p.sy + p.sh} className="stroke-silk/70" strokeWidth="1.4" />
    </>
  ) : (
    <>
      <line x1={p.sx} x2={p.sx + 16} y1={cy} y2={cy} className="stroke-silk/70" strokeWidth="1.4" />
      <line x1={p.sx + p.sw - 16} x2={p.sx + p.sw} y1={cy} y2={cy} className="stroke-silk/70" strokeWidth="1.4" />
    </>
  );
}

function BoxSymbol({ p, active, detail }: { p: Part; active: boolean; detail?: React.ReactNode }) {
  const perSide = Math.max(2, Math.round(p.pins / 2));
  const step = (p.sh - 16) / (perSide + 1);
  return (
    <>
      <rect
        x={p.sx}
        y={p.sy}
        width={p.sw}
        height={p.sh}
        rx="2"
        strokeWidth={active ? 2.2 : 1.4}
        className={cn("fill-panel stroke-silk/70", active && "stroke-teal fill-teal/12")}
      />
      {/* pin 1 marker */}
      <circle cx={p.sx + 8} cy={p.sy + 9} r="2.4" className="fill-silk/60" />
      {Array.from({ length: perSide }).map((_, i) => {
        const y = p.sy + 14 + step * (i + 1);
        return (
          <g key={i}>
            <line x1={p.sx - 20} x2={p.sx} y1={y} y2={y} className="stroke-silk/65" strokeWidth="1.3" />
            <text x={p.sx + 5} y={y + 3} className="fill-muted-foreground font-mono text-[7px]">
              {i + 1}
            </text>
            <line
              x1={p.sx + p.sw}
              x2={p.sx + p.sw + 20}
              y1={y}
              y2={y}
              className="stroke-silk/65"
              strokeWidth="1.3"
            />
            <text
              x={p.sx + p.sw - 5}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[7px]"
            >
              {perSide * 2 - i}
            </text>
          </g>
        );
      })}
      {detail}
    </>
  );
}

function Symbol({ p, active }: { p: Part; active: boolean }) {
  const cx = p.sx + p.sw / 2;
  const cy = p.sy + p.sh / 2;
  const stroke = active ? "stroke-teal" : "stroke-silk/80";

  switch (p.sym) {
    case "res":
      return (
        <>
          <Leads p={p} />
          <rect
            x={p.sx + 16}
            y={cy - 9}
            width={p.sw - 32}
            height={18}
            className={cn("fill-panel", stroke)}
            strokeWidth={active ? 2 : 1.4}
          />
        </>
      );
    case "cap":
      return (
        <>
          <line x1={p.sx} x2={cx - 5} y1={cy} y2={cy} className="stroke-silk/70" strokeWidth="1.4" />
          <line x1={cx + 5} x2={p.sx + p.sw} y1={cy} y2={cy} className="stroke-silk/70" strokeWidth="1.4" />
          <line x1={cx - 5} x2={cx - 5} y1={cy - 12} y2={cy + 12} className={stroke} strokeWidth={active ? 2.4 : 1.8} />
          <path
            d={`M${cx + 5} ${cy - 12} Q${cx + 11} ${cy} ${cx + 5} ${cy + 12}`}
            fill="none"
            className={stroke}
            strokeWidth={active ? 2.4 : 1.8}
          />
        </>
      );
    case "led":
    case "diode":
      return (
        <>
          <Leads p={p} />
          <path d={`M${cx - 9} ${cy - 10} L${cx + 7} ${cy} L${cx - 9} ${cy + 10} Z`} className={cn("fill-panel", stroke)} strokeWidth="1.4" />
          <line x1={cx + 7} x2={cx + 7} y1={cy - 11} y2={cy + 11} className={stroke} strokeWidth="1.8" />
          {p.sym === "led" && (
            <>
              <path d={`M${cx - 2} ${cy - 14} l7 -7 m0 0 l-4 0.6 m4 -0.6 l-0.6 4`} fill="none" className="stroke-teal" strokeWidth="1.1" />
              <path d={`M${cx + 4} ${cy - 14} l7 -7 m0 0 l-4 0.6 m4 -0.6 l-0.6 4`} fill="none" className="stroke-teal" strokeWidth="1.1" />
            </>
          )}
        </>
      );
    case "ind":
      return (
        <>
          <Leads p={p} />
          <path
            d={`M${p.sx + 16} ${cy} q7 -12 14 0 q7 -12 14 0 q7 -12 14 0`}
            fill="none"
            className={stroke}
            strokeWidth="1.6"
          />
        </>
      );
    case "xtal":
      return (
        <>
          <Leads p={p} />
          <line x1={cx - 8} x2={cx - 8} y1={cy - 11} y2={cy + 11} className={stroke} strokeWidth="1.6" />
          <rect x={cx - 4} y={cy - 9} width={8} height={18} className={cn("fill-panel", stroke)} strokeWidth="1.4" />
          <line x1={cx + 8} x2={cx + 8} y1={cy - 11} y2={cy + 11} className={stroke} strokeWidth="1.6" />
        </>
      );
    case "batt":
      return (
        <>
          <Leads p={p} />
          <line x1={cx - 7} x2={cx - 7} y1={cy - 13} y2={cy + 13} className={stroke} strokeWidth="2" />
          <line x1={cx - 1} x2={cx - 1} y1={cy - 7} y2={cy + 7} className={stroke} strokeWidth="2" />
          <line x1={cx + 5} x2={cx + 5} y1={cy - 13} y2={cy + 13} className={stroke} strokeWidth="2" />
          <line x1={cx + 11} x2={cx + 11} y1={cy - 7} y2={cy + 7} className={stroke} strokeWidth="2" />
          <text x={cx - 14} y={cy - 16} className="fill-muted-foreground font-mono text-[8px]">+</text>
        </>
      );
    case "sw":
      return (
        <>
          <Leads p={p} />
          <circle cx={p.sx + 18} cy={cy} r="2.6" className={cn("fill-background", stroke)} strokeWidth="1.3" />
          <circle cx={p.sx + p.sw - 18} cy={cy} r="2.6" className={cn("fill-background", stroke)} strokeWidth="1.3" />
          <line x1={p.sx + 18} x2={p.sx + p.sw - 20} y1={cy - 2} y2={cy - 13} className={stroke} strokeWidth="1.6" />
        </>
      );
    case "conn":
      return (
        <BoxSymbol
          p={p}
          active={active}
          detail={
            <>
              {Array.from({ length: Math.min(6, p.pins) }).map((_, i) => (
                <rect
                  key={i}
                  x={p.sx + p.sw - 22}
                  y={p.sy + 14 + i * 9}
                  width={12}
                  height={5}
                  className="fill-copper/70"
                />
              ))}
            </>
          }
        />
      );
    case "relay":
      return (
        <BoxSymbol
          p={p}
          active={active}
          detail={
            <>
              <rect x={p.sx + 16} y={cy - 6} width={20} height={14} className="fill-copper/25 stroke-copper/70" strokeWidth="1.2" />
              <line x1={p.sx + 44} x2={p.sx + p.sw - 18} y1={cy + 6} y2={cy - 6} className="stroke-silk/80" strokeWidth="1.5" />
              <line x1={p.sx + 36} x2={p.sx + 44} y1={cy} y2={cy} strokeDasharray="2 2" className="stroke-muted-foreground" strokeWidth="1" />
            </>
          }
        />
      );
    case "disp":
      return (
        <BoxSymbol
          p={p}
          active={active}
          detail={
            <rect
              x={p.sx + 18}
              y={p.sy + 16}
              width={p.sw - 36}
              height={p.sh - 42}
              className="fill-teal/12 stroke-teal/40"
              strokeWidth="1"
            />
          }
        />
      );
    default:
      return <BoxSymbol p={p} active={active} />;
  }
}

/* ------------------------------------------------------------------ */
/* wire routing                                                        */
/* ------------------------------------------------------------------ */

function anchors(a: Part, b: Part) {
  const rightOfA = { x: a.sx + a.sw + 20, y: a.sy + a.sh / 2 };
  const leftOfB = { x: b.sx - 20, y: b.sy + b.sh / 2 };
  if (b.sx + b.sw / 2 < a.sx + a.sw / 2) {
    return {
      from: { x: a.sx - 20, y: a.sy + a.sh / 2 },
      to: { x: b.sx + b.sw + 20, y: b.sy + b.sh / 2 },
    };
  }
  return { from: rightOfA, to: leftOfB };
}

/* ------------------------------------------------------------------ */
/* status overlays                                                     */
/* ------------------------------------------------------------------ */

function SkeletonSymbol({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={108} height={62} rx={3} className="fill-muted/25 stroke-border/40 animate-pulse" strokeWidth="1" />
      <rect x={x + 8} y={y + 8} width={60} height={8} rx={2} className="fill-muted/40 animate-pulse" />
      <rect x={x + 8} y={y + 22} width={40} height={6} rx={2} className="fill-muted/30 animate-pulse" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* main component                                                      */
/* ------------------------------------------------------------------ */

export function SchematicView() {
  const d = useDesign();
  const drag = useDragItem();

  const statusLeft = (
    <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1">
      {d.schematicStatus === "ready"
        ? `SHEET 1/1 · ${d.meta.slug.toUpperCase()} · ${d.parts.length} symbols · ${d.nets.length} nets`
        : d.schematicStatus === "loading"
          ? "SHEET 1/1 · generating schematic…"
          : d.schematicStatus === "error"
            ? `SCHEMATIC ERROR · ${d.schematicError ?? "unknown"}`
            : "SCHEMATIC · awaiting generation"}
    </span>
  );

  return (
    <CadCanvas
      viewBox="0 0 1120 560"
      gridClass="cad-grid"
      onBackgroundClick={() => selectPart(null)}
      statusLeft={statusLeft}
    >
      {({ toLocal, snap }) => (
        <>
          {/* sheet frame */}
          <rect x={8} y={8} width={1104} height={544} fill="none" className="stroke-border" strokeWidth="1.5" />
          <rect x={860} y={480} width={244} height={64} fill="none" className="stroke-border" strokeWidth="1.2" />
          <text x={872} y={500} className="fill-muted-foreground font-mono text-[9px]">
            FLOWCAD · {d.meta.title || "—"}
          </text>
          <text x={872} y={514} className="fill-muted-foreground font-mono text-[9px]">
            SHEET 1/1 · REV B · A4
          </text>
          <text x={872} y={534} className="fill-muted-foreground font-mono text-[9px]">
            {d.parts.length} SYMBOLS · {d.nets.length} NETS
          </text>

          {/* ── Loading skeleton ───────────────────────────── */}
          {d.schematicStatus === "loading" && (
            <>
              {[40, 160, 280, 400].map((y, i) => (
                <SkeletonSymbol key={i} x={40} y={y} />
              ))}
              {[40, 180, 320].map((y, i) => (
                <SkeletonSymbol key={`b-${i}`} x={220} y={y} />
              ))}
              {[80, 220].map((y, i) => (
                <SkeletonSymbol key={`c-${i}`} x={450} y={y} />
              ))}
            </>
          )}

          {/* ── Error state ────────────────────────────────── */}
          {d.schematicStatus === "error" && (
            <foreignObject x="160" y="180" width="500" height="120">
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
                <span className="font-mono text-[11px] font-semibold tracking-wide text-destructive">⚠ SCHEMATIC ERROR</span>
                <span className="font-mono text-[10px] text-destructive/70">{d.schematicError}</span>
              </div>
            </foreignObject>
          )}

          {/* ── Idle ───────────────────────────────────────── */}
          {d.schematicStatus === "idle" && (
            <foreignObject x="200" y="200" width="400" height="80">
              <div className="flex items-center justify-center rounded-xl border border-border bg-panel/60 p-5 text-center">
                <span className="font-mono text-[10px] text-muted-foreground">Enter a prompt below to generate the schematic</span>
              </div>
            </foreignObject>
          )}

          {/* ── Real data ──────────────────────────────────── */}
          {d.schematicStatus === "ready" && (
            <>
              {/* Net wires with actual net name labels */}
              {d.nets.map((n, i) => {
                const a = d.parts.find((p) => p.ref === n.from);
                const b = d.parts.find((p) => p.ref === n.to);
                if (!a || !b) return null;
                const { from, to } = anchors(a, b);
                const mx = from.x + (to.x - from.x) / 2;
                const hot = d.selected === a.ref || d.selected === b.ref;
                return (
                  <g key={`${n.from}-${n.to}-${i}`}>
                    <path
                      d={`M${from.x} ${from.y} H${mx} V${to.y} H${to.x}`}
                      fill="none"
                      strokeWidth={hot ? 2.2 : 1.4}
                      className={hot ? "stroke-teal" : "stroke-teal/55"}
                    />
                    <circle cx={from.x} cy={from.y} r="2.4" className="fill-teal/80" />
                    <circle cx={to.x} cy={to.y} r="2.4" className="fill-teal/80" />
                    {/* Net name label at midpoint */}
                    <rect
                      x={mx - n.net.length * 3.3 - 5}
                      y={(from.y + to.y) / 2 - 8}
                      width={n.net.length * 6.6 + 10}
                      height={14}
                      rx={2}
                      className="fill-background stroke-border"
                      strokeWidth="0.8"
                    />
                    <text
                      x={mx}
                      y={(from.y + to.y) / 2 + 2}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono text-[8px]"
                    >
                      {n.net}
                    </text>
                  </g>
                );
              })}

              {/* Component symbols */}
              {d.parts.map((p) => {
                const active = d.selected === p.ref;
                return (
                  <g
                    key={p.ref}
                    className="cursor-move"
                    onPointerDown={(e) =>
                      drag(e, {
                        toLocal,
                        snap,
                        start: { x: p.sx, y: p.sy },
                        onMove: (x, y) => moveSchematic(p.ref, x, y),
                        onSelect: () => selectPart(p.ref),
                      })
                    }
                  >
                    {active && (
                      <rect
                        x={p.sx - 24}
                        y={p.sy - 10}
                        width={p.sw + 48}
                        height={p.sh + 20}
                        rx="3"
                        fill="none"
                        strokeDasharray="4 3"
                        className="stroke-teal/60"
                        strokeWidth="1"
                      />
                    )}
                    <Symbol p={p} active={active} />
                    {/* Reference designator */}
                    <text
                      x={p.sx + p.sw / 2}
                      y={p.sy - 14}
                      textAnchor="middle"
                      className={cn("font-mono text-[10px]", active ? "fill-teal" : "fill-foreground")}
                    >
                      {p.ref}
                    </text>
                    {/* Value label */}
                    <text
                      x={p.sx + p.sw / 2}
                      y={p.sy + p.sh + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono text-[9px]"
                    >
                      {p.value}
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
