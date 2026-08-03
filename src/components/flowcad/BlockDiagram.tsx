import { blocks, connections } from "@/lib/flowcad-data";
import { cn } from "@/lib/utils";

const kindTone: Record<string, string> = {
  power: "stroke-copper/70 fill-copper/8",
  mcu: "stroke-teal/80 fill-teal/10",
  sensor: "stroke-primary/70 fill-primary/8",
  actuator: "stroke-pass/70 fill-pass/8",
  io: "stroke-muted-foreground/60 fill-muted/40",
};

function edge(fromId: string, toId: string) {
  const a = blocks.find((b) => b.id === fromId)!;
  const b = blocks.find((b) => b.id === toId)!;
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const mx = x1 + (x2 - x1) / 2;
  return { d: `M${x1} ${y1} H${mx} V${y2} H${x2}`, lx: mx, ly: (y1 + y2) / 2 };
}

export function BlockDiagram({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="cad-grid-fine h-full w-full overflow-auto">
      <svg viewBox="0 0 900 440" className="h-full min-h-[440px] w-full min-w-[900px]">
        {connections.map((c) => {
          const e = edge(c.from, c.to);
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

        {blocks.map((b) => {
          const active = selected === b.id;
          return (
            <g
              key={b.id}
              onClick={() => onSelect(b.id)}
              className="cursor-pointer transition-opacity hover:opacity-90"
            >
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={8}
                strokeWidth={active ? 2 : 1.3}
                className={cn(kindTone[b.kind], active && "stroke-teal fill-teal/18")}
              />
              <text
                x={b.x + b.w / 2}
                y={b.y + b.h / 2 - 4}
                textAnchor="middle"
                className="fill-foreground font-mono text-[11px] font-medium"
              >
                {b.label}
              </text>
              <text
                x={b.x + b.w / 2}
                y={b.y + b.h / 2 + 12}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[9px]"
              >
                {b.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
