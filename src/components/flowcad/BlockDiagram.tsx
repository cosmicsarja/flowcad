import { blocks, connections } from "@/lib/flowcad-data";
import { selectPart, useDesign } from "@/lib/design-store";
import { CadCanvas } from "./CadCanvas";
import { cn } from "@/lib/utils";

const kindTone: Record<string, string> = {
  power: "stroke-copper/70 fill-copper/8",
  mcu: "stroke-teal/80 fill-teal/10",
  sensor: "stroke-primary/70 fill-primary/8",
  actuator: "stroke-pass/70 fill-pass/8",
  io: "stroke-muted-foreground/60 fill-muted/40",
};

export const blockToRef: Record<string, string> = {
  usb: "J1",
  reg: "U2",
  mcu: "U1",
  soil: "J3",
  temp: "U4",
  relay: "Q1",
  pump: "K1",
  oled: "C7",
};

function edge(fromId: string, toId: string, allBlocks: typeof blocks) {
  const a = allBlocks.find((b) => b.id === fromId);
  const b = allBlocks.find((b) => b.id === toId);
  if (!a || !b) return { d: "", lx: 0, ly: 0 };
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const mx = x1 + (x2 - x1) / 2;
  return { d: `M${x1} ${y1} H${mx} V${y2} H${x2}`, lx: mx, ly: (y1 + y2) / 2 };
}

export function BlockDiagram() {
  const d = useDesign();

  // Use dynamic architecture from API if available, otherwise fallback to static
  const renderBlocks = d.architecture?.nodes.length ? d.architecture.nodes : blocks;
  const renderConns = d.architecture?.edges.length ? d.architecture.edges : connections;

  return (
    <CadCanvas
      viewBox="0 0 900 440"
      onBackgroundClick={() => selectPart(null)}
      statusLeft={
        <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1">
          ARCHITECTURE · {renderBlocks.length} functional blocks
        </span>
      }
    >
      {() => (
        <>
          {renderConns.map((c) => {
            const e = edge(c.from, c.to, renderBlocks as typeof blocks);
            if (!e.d) return null;
            return (
              <g key={`${c.from}-${c.to}`}>
                <path d={e.d} fill="none" className="trace-flow stroke-primary/70" strokeWidth="1.6" />
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

          {renderBlocks.map((b) => {
            // "U1 · Wi-Fi MCU" -> "U1"
            const ref = b.sub ? b.sub.split(" ")[0] : null;
            const active = d.selected === ref;
            return (
              <g
                key={b.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectPart(ref);
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
                  className={cn(kindTone[b.kind] || kindTone.io, active && "stroke-teal fill-teal/18")}
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
        </>
      )}
    </CadCanvas>
  );
}
