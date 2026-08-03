const parts = [
  { ref: "U1", x: 150, y: 90, w: 130, h: 90 },
  { ref: "U2", x: 60, y: 210, w: 60, h: 40 },
  { ref: "J1", x: 30, y: 90, w: 40, h: 56 },
  { ref: "K1", x: 320, y: 200, w: 80, h: 62 },
  { ref: "Q1", x: 320, y: 110, w: 62, h: 40 },
  { ref: "U4", x: 150, y: 210, w: 62, h: 40 },
  { ref: "C7", x: 240, y: 210, w: 40, h: 40 },
  { ref: "J3", x: 400, y: 60, w: 46, h: 30 },
  { ref: "J4", x: 400, y: 280, w: 46, h: 30 },
];

const traces = [
  "M70 118 H150",
  "M90 210 V150 H150",
  "M280 130 H320",
  "M360 150 V200",
  "M212 230 H240",
  "M280 230 H320",
  "M400 75 H360 V110",
  "M400 295 H380 V262",
  "M120 230 H150",
];

export function PcbLayout() {
  return (
    <div className="cad-grid-fine h-full w-full overflow-auto">
      <svg viewBox="0 0 500 360" className="h-full min-h-[420px] w-full">
        {/* Board outline */}
        <rect
          x="14"
          y="40"
          width="470"
          height="290"
          rx="10"
          className="fill-pass/6 stroke-pass/70"
          strokeWidth="1.6"
        />
        {[
          [30, 56],
          [468, 56],
          [30, 314],
          [468, 314],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="6" className="fill-none stroke-copper/70" strokeWidth="1.2" />
            <circle cx={x} cy={y} r="2.6" className="fill-background stroke-copper" strokeWidth="1" />
          </g>
        ))}

        {traces.map((d, i) => (
          <path key={i} d={d} className="stroke-copper/80" strokeWidth="2" fill="none" />
        ))}

        {parts.map((p) => (
          <g key={p.ref} className="cursor-pointer transition-opacity hover:opacity-80">
            <rect
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              rx="2"
              className="fill-panel-raised stroke-silk/70"
              strokeWidth="1.2"
            />
            <circle cx={p.x + 7} cy={p.y + 7} r="2" className="fill-silk/80" />
            <text
              x={p.x + p.w / 2}
              y={p.y + p.h / 2 + 3}
              textAnchor="middle"
              className="fill-silk font-mono text-[9px]"
            >
              {p.ref}
            </text>
          </g>
        ))}

        <text x="18" y="28" className="fill-muted-foreground font-mono text-[10px]">
          TOP · L1/L2 · 48.00 × 36.00 mm · 1.6 mm FR-4 · 94% ROUTED
        </text>
        <text x="18" y="350" className="fill-muted-foreground font-mono text-[9px]">
          GND POUR L2 · MIN TRACE 0.20 mm · 2 AIRWIRES
        </text>
      </svg>
    </div>
  );
}
