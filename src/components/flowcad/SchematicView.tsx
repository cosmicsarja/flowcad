export function SchematicView() {
  const nets = [
    "M120 90 H300",
    "M300 90 V150 H420",
    "M420 150 H560",
    "M560 150 V260 H700",
    "M300 90 V300 H420",
    "M420 300 H560",
    "M700 90 V150",
    "M120 260 H300 V300",
  ];

  const symbols = [
    { x: 60, y: 60, label: "J1", value: "USB-C" },
    { x: 240, y: 60, label: "U2", value: "AMS1117-3.3" },
    { x: 400, y: 120, label: "U1", value: "ESP32-WROOM-32E", tall: true },
    { x: 660, y: 60, label: "C7", value: "470µF" },
    { x: 660, y: 230, label: "Q1", value: "ULN2003A" },
    { x: 400, y: 270, label: "U4", value: "DHT22" },
    { x: 60, y: 230, label: "R1", value: "10k" },
  ];

  return (
    <div className="cad-grid h-full w-full overflow-auto">
      <svg viewBox="0 0 840 420" className="h-full min-h-[420px] w-full min-w-[840px]">
        {nets.map((d, i) => (
          <path key={i} d={d} className="stroke-teal/60" strokeWidth="1.4" fill="none" />
        ))}
        {[
          [300, 90],
          [560, 150],
          [420, 300],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.2" className="fill-teal" />
        ))}

        {symbols.map((s) => (
          <g key={s.label} className="cursor-pointer">
            <rect
              x={s.x}
              y={s.y}
              width={s.tall ? 120 : 90}
              height={s.tall ? 100 : 60}
              className="fill-panel stroke-silk/60"
              strokeWidth="1.3"
              rx="2"
            />
            {Array.from({ length: 4 }).map((_, i) => (
              <line
                key={i}
                x1={s.x - 12}
                x2={s.x}
                y1={s.y + 12 + i * 12}
                y2={s.y + 12 + i * 12}
                className="stroke-silk/60"
                strokeWidth="1.2"
              />
            ))}
            <text
              x={s.x + (s.tall ? 60 : 45)}
              y={s.y + (s.tall ? 46 : 28)}
              textAnchor="middle"
              className="fill-foreground font-mono text-[11px]"
            >
              {s.label}
            </text>
            <text
              x={s.x + (s.tall ? 60 : 45)}
              y={s.y + (s.tall ? 64 : 44)}
              textAnchor="middle"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {s.value}
            </text>
          </g>
        ))}

        <g>
          <text x={30} y={400} className="fill-muted-foreground font-mono text-[10px]">
            SHEET 1/3 · IRRIGATION_CTRL · REV B · 41 NETS · ERC CLEAN
          </text>
        </g>
      </svg>
    </div>
  );
}
