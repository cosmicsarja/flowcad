import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Move } from "lucide-react";
import { cn } from "@/lib/utils";

export const GRID = 10;
export function snapTo(v: number, on: boolean, size = GRID) {
  return on ? Math.round(v / size) * size : Math.round(v);
}

export type CanvasApi = {
  /** convert a pointer event to canvas-local (content) coordinates */
  toLocal: (e: { clientX: number; clientY: number }) => { x: number; y: number };
  snap: boolean;
  zoom: number;
};

const MIN = 0.3;
const MAX = 5;

export function CadCanvas({
  viewBox,
  gridClass = "cad-grid-fine",
  onBackgroundClick,
  statusLeft,
  children,
}: {
  viewBox: string;
  gridClass?: string;
  onBackgroundClick?: () => void;
  statusLeft?: ReactNode;
  children: (api: CanvasApi) => ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [snap, setSnap] = useState(true);
  const [panning, setPanning] = useState(false);
  const stateRef = useRef({ zoom, off });
  stateRef.current = { zoom, off };

  // wheel zoom (non-passive so we can preventDefault, incl. trackpad pinch)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const { zoom: z, off: o } = stateRef.current;
      const next = Math.min(MAX, Math.max(MIN, z * Math.exp(-dy * 0.0015)));
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const k = next / z;
      setOff({ x: px - (px - o.x) * k, y: py - (py - o.y) * k });
      setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomAtCenter = (factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    const { zoom: z, off: o } = stateRef.current;
    const next = Math.min(MAX, Math.max(MIN, z * factor));
    const k = next / z;
    setOff({ x: px - (px - o.x) * k, y: py - (py - o.y) * k });
    setZoom(next);
  };

  const reset = () => {
    setZoom(1);
    setOff({ x: 0, y: 0 });
  };

  const toLocal = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const { zoom: z, off: o } = stateRef.current;
    return { x: (p.x - o.x) / z, y: (p.y - o.y) / z };
  }, []);

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const start = { x: e.clientX, y: e.clientY };
    const base = { ...stateRef.current.off };
    let moved = false;
    setPanning(true);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      setOff({ x: base.x + dx, y: base.y + dy });
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) onBackgroundClick?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative h-full w-full overflow-hidden",
        gridClass,
        panning ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ touchAction: "none" }}
    >
      <svg ref={svgRef} viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="snapdots" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.6" className="fill-muted-foreground/45" />
          </pattern>
        </defs>
        <g transform={`translate(${off.x} ${off.y}) scale(${zoom})`}>
          <rect
            x={-4000}
            y={-4000}
            width={8000}
            height={8000}
            fill="transparent"
            onPointerDown={startPan}
          />
          {snap && (
            <rect
              x={-200}
              y={-200}
              width={2400}
              height={1800}
              fill="url(#snapdots)"
              pointerEvents="none"
            />
          )}
          {children({ toLocal, snap, zoom })}
        </g>
      </svg>

      {statusLeft && (
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2">{statusLeft}</div>
      )}

      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border border-border bg-panel/90 p-1 backdrop-blur">
        <CanvasBtn label="Zoom out" onClick={() => zoomAtCenter(1 / 1.25)}>
          <ZoomOut className="size-3.5" />
        </CanvasBtn>
        <span className="w-11 text-center font-mono text-[10px] text-teal">
          {Math.round(zoom * 100)}%
        </span>
        <CanvasBtn label="Zoom in" onClick={() => zoomAtCenter(1.25)}>
          <ZoomIn className="size-3.5" />
        </CanvasBtn>
        <CanvasBtn label="Fit to screen" onClick={reset}>
          <Maximize2 className="size-3.5" />
        </CanvasBtn>
        <CanvasBtn label="Toggle snap to grid" active={snap} onClick={() => setSnap((s) => !s)}>
          <Grid3x3 className="size-3.5" />
        </CanvasBtn>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
        <Move className="size-3" /> drag empty space to pan · scroll to zoom · snap {snap ? "on" : "off"}
      </div>
    </div>
  );
}

export function CanvasBtn({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-md border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:text-teal",
        active && "border-teal/50 bg-teal/10 text-teal",
      )}
    >
      {children}
    </button>
  );
}

/** shared drag helper for draggable canvas items */
export function useDragItem() {
  return useCallback(
    (
      e: React.PointerEvent,
      opts: {
        toLocal: CanvasApi["toLocal"];
        snap: boolean;
        start: { x: number; y: number };
        onMove: (x: number, y: number) => void;
        onSelect?: () => void;
      },
    ) => {
      e.stopPropagation();
      opts.onSelect?.();
      const origin = opts.toLocal(e);
      const base = { ...opts.start };
      const move = (ev: PointerEvent) => {
        const p = opts.toLocal(ev);
        opts.onMove(
          snapTo(base.x + (p.x - origin.x), opts.snap),
          snapTo(base.y + (p.y - origin.y), opts.snap),
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [],
  );
}
