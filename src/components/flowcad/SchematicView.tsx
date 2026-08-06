import { CadCanvas, useDragItem } from "./CadCanvas";
import { moveSchematic, selectPart, useDesign, type Part } from "@/lib/design-store";
import { cn } from "@/lib/utils";

function size(p: Part) {
  return p.tall ? { w: 120, h: 100 } : { w: 96, h: 62 };
}

function route(a: Part, b: Part) {
  const sa = size(a);
  const sb = size(b);
  const x1 = a.sx + sa.w;
  const y1 = a.sy + sa.h / 2;
  const x2 = b.sx;
  const y2 = b.sy + sb.h / 2;
  const mx = x1 + (x2 - x1) / 2;
  return { d: `M${x1} ${y1} H${mx} V${y2} H${x2}`, lx: mx, ly: (y1 + y2) / 2 };
}

export function SchematicView() {
  const d = useDesign();
  const drag = useDragItem();

  return (
    <CadCanvas
      viewBox="0 0 900 480"
      gridClass="cad-grid"
      onBackgroundClick={() => selectPart(null)}
      statusLeft={
        <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1">
          SHEET 1/3 · IRRIGATION_CTRL · {d.parts.length} symbols · {d.nets.length} nets
        </span>
      }
    >
      {({ toLocal, snap }) => (
        <>
          {d.nets.map((n, i) => {
            const a = d.parts.find((p) => p.ref === n.from);
            const b = d.parts.find((p) => p.ref === n.to);
            if (!a || !b) return null;
            const r = route(a, b);
            const hot = d.selected === a.ref || d.selected === b.ref;
            return (
              <g key={`${n.from}-${n.to}-${i}`}>
                <path
                  d={r.d}
                  fill="none"
                  strokeWidth={hot ? 2 : 1.4}
                  className={hot ? "stroke-teal" : "stroke-teal/55"}
                />
                <text
                  x={r.lx}
                  y={r.ly - 5}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono text-[9px]"
                >
                  {n.net}
                </text>
              </g>
            );
          })}

          {d.parts.map((p) => {
            const s = size(p);
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
                <rect
                  x={p.sx}
                  y={p.sy}
                  width={s.w}
                  height={s.h}
                  rx="2"
                  strokeWidth={active ? 2.2 : 1.3}
                  className={cn(
                    "fill-panel stroke-silk/60",
                    active && "stroke-teal fill-teal/12 [filter:drop-shadow(0_0_6px_var(--color-teal))]",
                  )}
                />
                {Array.from({ length: 4 }).map((_, i) => (
                  <line
                    key={i}
                    x1={p.sx - 12}
                    x2={p.sx}
                    y1={p.sy + 12 + i * 12}
                    y2={p.sy + 12 + i * 12}
                    className="stroke-silk/60"
                    strokeWidth="1.2"
                  />
                ))}
                <text
                  x={p.sx + s.w / 2}
                  y={p.sy + s.h / 2 - 2}
                  textAnchor="middle"
                  className="fill-foreground font-mono text-[11px]"
                >
                  {p.ref}
                </text>
                <text
                  x={p.sx + s.w / 2}
                  y={p.sy + s.h / 2 + 14}
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
    </CadCanvas>
  );
}
