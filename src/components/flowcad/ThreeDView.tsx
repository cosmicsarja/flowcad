import { useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut, Box, Layers, Move3d } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { CanvasBtn } from "./CadCanvas";
import { boardPx, selectPart, useDesign } from "@/lib/design-store";
import { cn } from "@/lib/utils";

function Cube({
  w,
  h,
  d,
  color,
  className,
  style,
  children,
  onClick,
}: {
  w: number;
  h: number;
  d: number;
  color: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={cn("absolute cursor-pointer", className)}
      style={{ width: w, height: h, transformStyle: "preserve-3d", ...style }}
      onPointerDown={onClick}
    >
      {/* Top */}
      <div
        className={cn("absolute inset-0 flex items-center justify-center border border-white/10", color)}
        style={{ transform: `translateZ(${d}px)` }}
      >
        {children}
      </div>
      {/* Bottom */}
      <div className={cn("absolute inset-0", color)} style={{ filter: "brightness(0.3)" }} />
      {/* Front */}
      <div
        className={cn("absolute top-full left-0 origin-top", color)}
        style={{ width: w, height: d, transform: `rotateX(-90deg)`, filter: "brightness(0.7)" }}
      />
      {/* Back */}
      <div
        className={cn("absolute bottom-full left-0 origin-bottom", color)}
        style={{ width: w, height: d, transform: `rotateX(90deg)`, filter: "brightness(0.5)" }}
      />
      {/* Left */}
      <div
        className={cn("absolute top-0 right-full origin-right", color)}
        style={{ width: d, height: h, transform: `rotateY(-90deg)`, filter: "brightness(0.8)" }}
      />
      {/* Right */}
      <div
        className={cn("absolute top-0 left-full origin-left", color)}
        style={{ width: d, height: h, transform: `rotateY(90deg)`, filter: "brightness(0.6)" }}
      />
    </div>
  );
}

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
      className="relative h-full w-full cursor-grab overflow-hidden bg-[#0c0c0c] active:cursor-grabbing"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800/20 via-background to-background" />

      <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: "1500px" }}>
        <div
          className="relative transition-transform duration-100 ease-out"
          style={{
            width: b.w * scale,
            height: b.h * scale,
            transformStyle: "preserve-3d",
            transform: `scale(${zoom}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
          }}
        >
          {/* PCB Substrate */}
          <div className="absolute inset-0 rounded-[4px] bg-[#1b4f30] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,255,255,0.15)] ring-1 ring-black/50" style={{ transformStyle: "preserve-3d" }}>
            {/* Fake copper traces and pads */}
            <div className="absolute inset-0 opacity-30 mix-blend-screen" style={{ backgroundImage: "radial-gradient(#b8860b 1px, transparent 1px)", backgroundSize: "12px 12px" }} />
            <div className="cad-grid absolute inset-0 opacity-20 mix-blend-overlay" />
            
            {/* Silk screen text */}
            <span className="absolute bottom-2 left-2 font-mono text-[10px] text-white/80 font-bold" style={{ transform: "translateZ(0.1px)" }}>
              FLOWCAD · {d.board.w.toFixed(1)} × {d.board.h.toFixed(1)} mm
            </span>
          </div>

          {/* Components */}
          {d.parts.map((p) => {
            let color = "bg-zinc-800";
            if (p.sym === "ic" || p.sym === "module") color = "bg-zinc-900";
            else if (p.sym === "cap") color = "bg-[#b88c51]";
            else if (p.sym === "res") color = "bg-zinc-950";
            else if (p.sym === "led") color = "bg-red-500";
            else if (p.sym === "conn") color = "bg-zinc-200";
            else if (p.sym === "relay") color = "bg-blue-900";

            return (
              <Cube
                key={p.ref}
                w={p.pw * scale}
                h={p.ph * scale}
                d={p.z * scale}
                color={color}
                className={cn(
                  "transition-transform duration-300 ease-out",
                  d.selected === p.ref && "ring-2 ring-teal ring-offset-2 ring-offset-transparent shadow-[0_0_15px_rgba(45,212,191,0.5)]"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  selectPart(p.ref);
                }}
                style={{
                  left: p.px * scale,
                  top: p.py * scale,
                  transform: `translateZ(${exploded ? p.z * scale * 2 : 0}px)`,
                }}
              >
                {/* Silkscreen RefDes on top of component */}
                <span className={cn("font-mono text-center text-white/70", p.sym === "conn" ? "text-black/50" : "", p.pw * scale < 15 ? "text-[6px]" : "text-[8px]")}>
                  {p.ref}
                </span>
                {(p.sym === "ic" || p.sym === "module") && (
                   <div className="absolute top-1 left-1 size-1 rounded-full bg-white/20" />
                )}
              </Cube>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2">
        <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1 backdrop-blur text-teal shadow-lg">
          CSS3D RENDER · {d.parts.length} bodies
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
        <Move3d className="size-3" /> drag to orbit · scroll to zoom
      </div>

      <div className="absolute right-3 bottom-3 w-64 space-y-3 rounded-xl border border-white/10 bg-black/60 p-4 backdrop-blur-md shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="label-mono text-zinc-300">Orbit X</span>
          <span className="font-mono text-[11px] text-teal">{Math.round(rotX)}°</span>
        </div>
        <Slider value={[rotX]} min={0} max={90} onValueChange={(v) => setRotX(v[0] ?? rotX)} />
        <div className="flex items-center justify-between">
          <span className="label-mono text-zinc-300">Orbit Z</span>
          <span className="font-mono text-[11px] text-teal">{Math.round(rotZ)}°</span>
        </div>
        <Slider value={[rotZ]} min={-180} max={180} onValueChange={(v) => setRotZ(v[0] ?? rotZ)} />
        <div className="flex gap-1.5 pt-2">
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
