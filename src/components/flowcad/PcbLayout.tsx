import { CadCanvas, useDragItem } from "./CadCanvas";
import {
  EDGE_MARGIN,
  boardPx,
  movePcb,
  selectPart,
  useDesign,
} from "@/lib/design-store";
import { cn } from "@/lib/utils";

const BX = 40;
const BY = 46;

export function PcbLayout() {
  const d = useDesign();
  const drag = useDragItem();
  const b = boardPx(d);

  const outOfSpec = (px: number, py: number, pw: number, ph: number) =>
    px < EDGE_MARGIN || py < EDGE_MARGIN || px + pw > b.w - EDGE_MARGIN || py + ph > b.h - EDGE_MARGIN;

  return (
    <CadCanvas
      viewBox={`0 0 ${Math.max(560, b.w + 120)} ${Math.max(420, b.h + 130)}`}
      onBackgroundClick={() => selectPart(null)}
      statusLeft={
        <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1">
          TOP · L1/L2 · {d.board.w.toFixed(2)} × {d.board.h.toFixed(2)} mm · 1.6 mm FR-4
        </span>
      }
    >
      {({ toLocal, snap }) => (
        <>
          {/* board outline */}
          <rect
            x={BX}
            y={BY}
            width={b.w}
            height={b.h}
            rx="8"
            className="fill-pass/6 stroke-pass/70"
            strokeWidth="1.6"
          />
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
          {[
            [BX + 14, BY + 14],
            [BX + b.w - 14, BY + 14],
            [BX + 14, BY + b.h - 14],
            [BX + b.w - 14, BY + b.h - 14],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="6" className="fill-none stroke-copper/70" strokeWidth="1.2" />
              <circle cx={x} cy={y} r="2.6" className="fill-background stroke-copper" strokeWidth="1" />
            </g>
          ))}

          {/* copper traces follow the netlist */}
          {d.nets.map((n, i) => {
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
                className="stroke-copper/70"
                strokeWidth="2"
              />
            );
          })}

          {d.parts.map((p) => {
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
                    active && "stroke-teal fill-teal/14 [filter:drop-shadow(0_0_6px_var(--color-teal))]",
                  )}
                />
                <circle cx={BX + p.px + 7} cy={BY + p.py + 7} r="2" className="fill-silk/80" />
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

          <text x={BX} y={BY + b.h + 20} className="fill-muted-foreground font-mono text-[9px]">
            GND POUR L2 · MIN TRACE 0.20 mm · {d.parts.length} PLACED
          </text>
          {d.drcNote && (
            <text x={BX} y={BY - 12} className="fill-warn font-mono text-[9px]">
              ⚠ DRC: {d.drcNote}
            </text>
          )}
        </>
      )}
    </CadCanvas>
  );
}
