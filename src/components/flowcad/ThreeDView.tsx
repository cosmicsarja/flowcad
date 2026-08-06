import { useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut, Box, Layers, Move3d } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { CanvasBtn } from "./CadCanvas";
import { boardPx, selectPart, useDesign } from "@/lib/design-store";
import { cn } from "@/lib/utils";

export function ThreeDView() {
  const d = useDesign();
  const b = boardPx(d);
  const [rotX, setRotX] = useState(58);
  const [rotZ, setRotZ] = useState(-28);
  const [zoom, setZoom] = useState(1);
  const [exploded, setExploded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zRef = useRef(zoom);
  zRef.current = zoom;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setZoom(Math.min(2.6, Math.max(0.35, zRef.current * Math.exp(-dy * 0.0015))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const startOrbit = (e: React.PointerEvent) => {
    const start = { x: e.clientX, y: e.clientY, rx: rotX, rz: rotZ };
    const move = (ev: PointerEvent) => {
      setRotX(Math.min(90, Math.max(0, start.rx - (ev.clientY - start.y) * 0.4)));
      setRotZ(((start.rz + (ev.clientX - start.x) * 0.4 + 540) % 360) - 180);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const scale = 460 / Math.max(340, b.w);

  return (
    <div
      ref={wrapRef}
      onPointerDown={startOrbit}
      className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      style={{ touchAction: "none" }}
    >
      <div className="cad-grid absolute inset-0 opacity-40" />

      <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: "1200px" }}>
        <div
          className="relative transition-transform duration-100 ease-out"
          style={{
            width: b.w * scale,
            height: b.h * scale,
            transformStyle: "preserve-3d",
            transform: `scale(${zoom}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
          }}
        >
          <div className="absolute inset-0 rounded-md border border-pass/50 bg-pass/15 shadow-[0_40px_80px_-30px_oklch(0_0_0/70%)]">
            <div className="cad-grid absolute inset-0 rounded-md opacity-30" />
            <span className="absolute bottom-1 left-2 font-mono text-[9px] text-silk/70">
              FLOWCAD · {d.board.w.toFixed(1)} × {d.board.h.toFixed(1)} mm
            </span>
          </div>
          {d.parts.map((p) => (
            <div
              key={p.ref}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectPart(p.ref);
              }}
              className={cn(
                "absolute cursor-pointer rounded-[2px] border border-silk/40 bg-panel-raised",
                d.selected === p.ref && "border-teal bg-teal/30",
              )}
              style={{
                left: p.px * scale,
                top: p.py * scale,
                width: p.pw * scale,
                height: p.ph * scale,
                transform: `translateZ(${p.z * (exploded ? 3.5 : 1)}px)`,
                transition: "transform 300ms ease-out",
              }}
            >
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-silk/80">
                {p.ref}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2">
        <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1 backdrop-blur">
          STEP AP214 · {d.parts.length} bodies
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
        <Move3d className="size-3" /> drag to orbit · scroll to zoom
      </div>

      <div className="absolute right-3 bottom-3 w-64 space-y-3 rounded-lg border border-border bg-panel/90 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="label-mono">Orbit X</span>
          <span className="font-mono text-[11px] text-teal">{Math.round(rotX)}°</span>
        </div>
        <Slider value={[rotX]} min={0} max={90} onValueChange={(v) => setRotX(v[0] ?? rotX)} />
        <div className="flex items-center justify-between">
          <span className="label-mono">Orbit Z</span>
          <span className="font-mono text-[11px] text-teal">{Math.round(rotZ)}°</span>
        </div>
        <Slider value={[rotZ]} min={-180} max={180} onValueChange={(v) => setRotZ(v[0] ?? rotZ)} />
        <div className="flex gap-1 pt-1">
          <CanvasBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(2.6, z * 1.2))}>
            <ZoomIn className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.35, z / 1.2))}>
            <ZoomOut className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn
            label="Reset view"
            onClick={() => {
              setRotX(58);
              setRotZ(-28);
              setZoom(1);
            }}
          >
            <RotateCcw className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Exploded view" active={exploded} onClick={() => setExploded((v) => !v)}>
            <Layers className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Solid bodies" onClick={() => setExploded(false)}>
            <Box className="size-3.5" />
          </CanvasBtn>
        </div>
      </div>
    </div>
  );
}
