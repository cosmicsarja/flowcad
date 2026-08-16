import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RotateCcw, ZoomIn, ZoomOut, Box, AlertTriangle, Loader2, Move3d } from "lucide-react";
import { CanvasBtn } from "./CadCanvas";
import { useDesign } from "@/lib/design-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Three.js scene helpers                                               */
/* ------------------------------------------------------------------ */

function buildScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ambientLight: THREE.AmbientLight;
  dirLight: THREE.DirectionalLight;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0c0c);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(0, 60, 80);

  // Ambient light — soft fill
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Key directional light
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(40, 80, 60);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Rim light (back)
  const rimLight = new THREE.DirectionalLight(0x4adfe3, 0.35);
  rimLight.position.set(-40, -20, -60);
  scene.add(rimLight);

  return { scene, camera, ambientLight, dirLight };
}

/* ------------------------------------------------------------------ */
/* Status overlays                                                     */
/* ------------------------------------------------------------------ */

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0c0c]">
      <div className="relative">
        <Loader2 className="size-8 animate-spin text-teal" />
        <div className="absolute inset-0 rounded-full bg-teal/20 blur-xl animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-mono text-[12px] font-semibold text-teal">LOADING 3D MODEL</span>
        <span className="font-mono text-[10px] text-muted-foreground">Fetching GLB from backend…</span>
      </div>
    </div>
  );
}

function UnavailableOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0c0c0c]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-panel/40 p-8 text-center backdrop-blur-sm">
        <div className="flex size-12 items-center justify-center rounded-full border border-border bg-panel">
          <AlertTriangle className="size-6 text-warn" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13px] font-semibold text-foreground">3D Model Unavailable</span>
          <span className="max-w-[280px] font-mono text-[10px] text-muted-foreground leading-relaxed">{message}</span>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/50 px-4 py-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            Generate a project with a running backend to produce the GLB export.
          </span>
        </div>
      </div>
    </div>
  );
}

function ErrorOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0c0c0c]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <span className="font-mono text-[12px] font-semibold text-destructive">3D Model Load Error</span>
        <span className="max-w-[300px] font-mono text-[10px] text-destructive/70">{message}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

type LoadState = "idle" | "loading" | "ready" | "error";

export function ThreeDView() {
  const d = useDesign();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Three.js instance refs (survive re-renders)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // ── Initialise renderer + scene once ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const { scene, camera } = buildScene();
    sceneRef.current = scene;
    cameraRef.current = camera;

    // OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 400;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Resize observer
    const ro = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = wrap;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(wrap);
    // Initial size
    const { clientWidth: w, clientHeight: h } = wrap;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // Render loop
    let running = true;
    const loop = () => {
      if (!running) return;
      animFrameRef.current = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── Load GLB when glbUrl changes ───────────────────────────────────
  useEffect(() => {
    const glbUrl = d.glbUrl;
    if (!glbUrl || !sceneRef.current) {
      if (!glbUrl && d.threeDStatus === "idle") {
        setLoadState("idle");
      }
      return;
    }
    if (glbUrl === loadedUrl) return; // already loaded this URL

    setLoadState("loading");
    setLoadError(null);

    // Remove any previous model
    if (modelRef.current && sceneRef.current) {
      sceneRef.current.remove(modelRef.current);
      modelRef.current = null;
    }

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;

        // Center the model on the origin
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);

        // Scale so longest axis is ~60 units
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) model.scale.setScalar(60 / maxDim);

        sceneRef.current!.add(model);
        modelRef.current = model;

        // Reset camera to a nice isometric angle
        const cam = cameraRef.current!;
        cam.position.set(60, 50, 80);
        controlsRef.current?.target.set(0, 0, 0);
        controlsRef.current?.update();

        setLoadedUrl(glbUrl);
        setLoadState("ready");
      },
      undefined,
      (err) => {
        console.error("[ThreeDView] GLTFLoader error:", err);
        setLoadState("error");
        setLoadError(
          err instanceof Error
            ? err.message
            : "Failed to load GLB — the model may be corrupt or the server returned an error.",
        );
      },
    );
  }, [d.glbUrl, d.threeDStatus, loadedUrl]);

  // ── Sync threeDStatus to loadState ────────────────────────────────
  useEffect(() => {
    if (d.threeDStatus === "loading" && loadState === "idle") setLoadState("loading");
    if (d.threeDStatus === "error" && loadState !== "error") {
      setLoadState("error");
      setLoadError(d.threeDError ?? "3D model unavailable");
    }
    if (d.threeDStatus === "idle") setLoadState("idle");
  }, [d.threeDStatus, d.threeDError, loadState]);

  const resetCamera = () => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    cam.position.set(60, 50, 80);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  const zoomBy = (factor: number) => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.position.multiplyScalar(factor);
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#0c0c0c]">
      {/* Three.js canvas — always mounted so renderer persists */}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full",
          loadState !== "ready" && "opacity-0 pointer-events-none",
        )}
        style={{ touchAction: "none" }}
      />

      {/* Radial gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800/10 via-transparent to-transparent" />

      {/* ── Status overlays ──────────────────────────────────────── */}
      {loadState === "loading" && <LoadingOverlay />}
      {loadState === "idle" && (
        <UnavailableOverlay message="No 3D model yet. Generate a design first to see the board render here." />
      )}
      {loadState === "error" && <ErrorOverlay message={loadError ?? "Unknown error"} />}

      {/* ── HUD labels ───────────────────────────────────────────── */}
      {loadState === "ready" && (
        <>
          <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2">
            <span className="label-mono rounded border border-border bg-panel/80 px-2 py-1 backdrop-blur text-teal shadow-lg">
              GLB · {d.board.w.toFixed(1)} × {d.board.h.toFixed(1)} mm
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
            <Move3d className="size-3" /> drag to orbit · scroll to zoom · right-click to pan
          </div>
        </>
      )}

      {/* ── Camera controls toolbar ──────────────────────────────── */}
      {loadState === "ready" && (
        <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/60 p-2.5 backdrop-blur-md shadow-2xl">
          <CanvasBtn label="Zoom in" onClick={() => zoomBy(0.85)}>
            <ZoomIn className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Zoom out" onClick={() => zoomBy(1.18)}>
            <ZoomOut className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Reset view" onClick={resetCamera}>
            <RotateCcw className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Toggle wireframe" onClick={() => {
            if (!modelRef.current) return;
            modelRef.current.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                (child.material as THREE.MeshStandardMaterial).wireframe =
                  !(child.material as THREE.MeshStandardMaterial).wireframe;
              }
            });
          }}>
            <Box className="size-3.5" />
          </CanvasBtn>
        </div>
      )}
    </div>
  );
}
