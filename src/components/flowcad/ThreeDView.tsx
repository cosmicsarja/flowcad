import { useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut, Box, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function ThreeDView() {
  const [rotX, setRotX] = useState(58);
  const [rotZ, setRotZ] = useState(-28);
  const [zoom, setZoom] = useState(1);

  const parts = [
    { ref: "U1", x: 26, y: 16, w: 34, h: 22, z: 14, tone: "bg-secondary" },
    { ref: "U2", x: 10, y: 46, w: 14, h: 10, z: 8, tone: "bg-panel-raised" },
    { ref: "K1", x: 62, y: 44, w: 22, h: 16, z: 22, tone: "bg-muted" },
    { ref: "J1", x: 4, y: 18, w: 10, h: 14, z: 10, tone: "bg-panel-raised" },
    { ref: "C7", x: 46, y: 48, w: 10, h: 10, z: 18, tone: "bg-secondary" },
    { ref: "U4", x: 28, y: 50, w: 14, h: 10, z: 12, tone: "bg-panel-raised" },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="cad-grid absolute inset-0 opacity-40" />

      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: "1200px" }}
      >
        <div
          className="relative transition-transform duration-300 ease-out"
          style={{
            width: 460,
            height: 340,
            transformStyle: "preserve-3d",
            transform: `scale(${zoom}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
          }}
        >
          <div className="absolute inset-0 rounded-md border border-pass/50 bg-pass/15 shadow-[0_40px_80px_-30px_oklch(0_0_0/70%)]">
            <div className="cad-grid absolute inset-0 rounded-md opacity-30" />
            <span className="absolute bottom-2 left-3 font-mono text-[10px] text-silk/70">
              FLOWCAD · IRRIGATION_CTRL REV B
            </span>
          </div>
          {parts.map((p) => (
            <div
              key={p.ref}
              className={`absolute rounded-[2px] border border-silk/40 ${p.tone}`}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.w}%`,
                height: `${p.h}%`,
                transform: `translateZ(${p.z}px)`,
              }}
            >
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-silk/80">
                {p.ref}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1 backdrop-blur">
          STEP AP214 · 23 bodies
        </span>
      </div>

      <div className="absolute right-3 bottom-3 w-64 space-y-3 rounded-lg border border-border bg-panel/90 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="label-mono">Orbit X</span>
          <span className="font-mono text-[11px] text-teal">{rotX}°</span>
        </div>
        <Slider value={[rotX]} min={0} max={90} onValueChange={(v) => setRotX(v[0])} />
        <div className="flex items-center justify-between">
          <span className="label-mono">Orbit Z</span>
          <span className="font-mono text-[11px] text-teal">{rotZ}°</span>
        </div>
        <Slider value={[rotZ]} min={-180} max={180} onValueChange={(v) => setRotZ(v[0])} />
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>
            <ZoomIn className="size-3.5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setRotX(58);
              setRotZ(-28);
              setZoom(1);
            }}
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button size="sm" variant="secondary">
            <Layers className="size-3.5" />
          </Button>
          <Button size="sm" variant="secondary">
            <Box className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
