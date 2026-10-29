import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Box,
  AlertTriangle,
  Loader2,
  Move3d,
  Play,
  Pause,
  Layers,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Compass,
} from "lucide-react";
import { CanvasBtn } from "./CadCanvas";
import { useDesign } from "@/lib/design-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Solder-mask Color Palettes (Req 8)                                 */
/* ------------------------------------------------------------------ */

export type SolderMaskColor = "green" | "black" | "blue" | "red" | "purple";

interface MaskPalette {
  name: string;
  hex: string;
  threeColor: number;
  roughness: number;
  metalness: number;
}

const SOLDER_MASK_PALETTES: Record<SolderMaskColor, MaskPalette> = {
  green: {
    name: "Classic Green",
    hex: "#1A5336",
    threeColor: 0x1a5336,
    roughness: 0.35,
    metalness: 0.05,
  },
  black: {
    name: "Matte Black",
    hex: "#18181b",
    threeColor: 0x18181b,
    roughness: 0.55,
    metalness: 0.02,
  },
  blue: {
    name: "Royal Blue",
    hex: "#0F3D78",
    threeColor: 0x0f3d78,
    roughness: 0.35,
    metalness: 0.05,
  },
  red: {
    name: "Crimson Red",
    hex: "#8B1E1E",
    threeColor: 0x8b1e1e,
    roughness: 0.35,
    metalness: 0.05,
  },
  purple: {
    name: "Signature Purple",
    hex: "#4A154B",
    threeColor: 0x4a154b,
    roughness: 0.35,
    metalness: 0.05,
  },
};

/* ------------------------------------------------------------------ */
/* Three.js Studio Scene Helpers                                      */
/* ------------------------------------------------------------------ */

function buildScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  bottomLight: THREE.DirectionalLight;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09090b);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(60, 70, 80);

  // Soft ambient & studio hemisphere lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x22222a, 0.75);
  scene.add(hemisphereLight);

  // Primary directional key light with soft shadows
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(80, 130, 90);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 800;
  keyLight.shadow.bias = -0.0001;
  scene.add(keyLight);

  // Secondary fill light (slightly cooler for crisp definition)
  const fillLight = new THREE.DirectionalLight(0xdce7f5, 0.9);
  fillLight.position.set(-80, 70, -70);
  scene.add(fillLight);

  // Rim light for component silhouette highlights
  const rimLight = new THREE.DirectionalLight(0x4adfe3, 0.35);
  rimLight.position.set(0, 90, -100);
  scene.add(rimLight);

  // Dedicated bottom fill light — ensures bottom copper (B.Cu) and pins are clearly visible
  const bottomLight = new THREE.DirectionalLight(0xffffff, 0.7);
  bottomLight.position.set(0, -90, 0);
  scene.add(bottomLight);

  return {
    scene,
    camera,
    ambientLight,
    hemisphereLight,
    keyLight,
    fillLight,
    rimLight,
    bottomLight,
  };
}

/* ------------------------------------------------------------------ */
/* Status Overlays                                                    */
/* ------------------------------------------------------------------ */

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#09090b]/80 backdrop-blur-sm">
      <div className="relative">
        <Loader2 className="size-9 animate-spin text-teal" />
        <div className="absolute inset-0 rounded-full bg-teal/20 blur-xl animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center px-4">
        <span className="font-mono text-[12px] font-semibold text-teal tracking-wider uppercase">
          {message}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground max-w-sm">
          Rendering authentic KiCad 3D STEP components, solder mask, and physical copper traces…
        </span>
      </div>
    </div>
  );
}

function UnavailableOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#09090b] p-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-panel/50 p-8 text-center backdrop-blur-sm max-w-md shadow-2xl">
        <div className="flex size-12 items-center justify-center rounded-full border border-border bg-panel">
          <AlertTriangle className="size-6 text-warn" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[13px] font-semibold text-foreground">
            3D PCB Model Not Yet Generated
          </span>
          <span className="font-mono text-[11px] text-muted-foreground leading-relaxed">
            {message}
          </span>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/50 px-4 py-2 mt-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            Complete the routing & export stage to render the physical KiCad 3D board.
          </span>
        </div>
      </div>
    </div>
  );
}

function ErrorOverlay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#09090b] p-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center max-w-md shadow-2xl">
        <AlertTriangle className="size-8 text-destructive" />
        <span className="font-mono text-[13px] font-semibold text-destructive">
          3D Model Render Error
        </span>
        <span className="font-mono text-[11px] text-destructive/80 leading-relaxed">{message}</span>
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-1.5 font-mono text-[11px] text-destructive hover:bg-destructive/20 transition-colors"
        >
          Retry 3D Load
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main 3D PCB View Component                                          */
/* ------------------------------------------------------------------ */

type LoadState = "idle" | "loading" | "ready" | "error";

export function ThreeDView() {
  const d = useDesign();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Three.js instances
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);

  // State
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadMessage, setLoadMessage] = useState<string>("Loading 3D PCB Model");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [solderMaskColor, setSolderMaskColor] = useState<SolderMaskColor>("green");
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [boardDimensions, setBoardDimensions] = useState<{
    w: number;
    h: number;
    thickness: number;
    maxDim: number;
  } | null>(null);

  // ── Apply solder-mask color & PBR tuning to meshes ────────────────
  const applyMaterialTuning = useCallback(
    (colorKey: SolderMaskColor, rootGroup?: THREE.Group) => {
      const target = rootGroup ?? modelRef.current;
      if (!target) return;
      const palette = SOLDER_MASK_PALETTES[colorKey];

      target.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const name = (child.name || "").toLowerCase();
          const parentName = (child.parent?.name || "").toLowerCase();
          const mat = child.material as THREE.MeshStandardMaterial;
          if (!mat) return;

          // Double-sided rendering so thin copper and mask layers don't vanish
          mat.side = THREE.DoubleSide;

          // 1. Check if mesh is Solder Mask or FR4 Substrate
          const isPcbMask =
            name.includes("soldermask") ||
            name.includes("pcb") ||
            name.includes("substrate") ||
            parentName.includes("soldermask") ||
            parentName.includes("pcb") ||
            (mat.color && !mat.metalness && mat.color.g > mat.color.r * 1.3 && mat.color.g > 0.1);

          if (isPcbMask) {
            if (!child.userData["_clonedMat"]) {
              child.material = mat.clone();
              child.userData["_clonedMat"] = true;
            }
            const maskMat = child.material as THREE.MeshStandardMaterial;
            maskMat.color.set(palette.threeColor);
            maskMat.roughness = palette.roughness;
            maskMat.metalness = palette.metalness;
            maskMat.needsUpdate = true;
            return;
          }

          // 2. Realistic Copper Traces (F.Cu & B.Cu)
          if (name.includes("copper") || name.includes("track")) {
            mat.metalness = 0.9;
            mat.roughness = 0.22;
            mat.color.setHex(0xb87333); // Real copper gleam
            mat.needsUpdate = true;
            return;
          }

          // 3. Realistic Metal Pins, Pads, and Vias
          if (
            name.includes("pad") ||
            name.includes("pin") ||
            name.includes("lead") ||
            name.includes("via")
          ) {
            mat.metalness = 0.95;
            mat.roughness = 0.18;
            mat.color.setHex(0xd4d8df); // Bright tinned solder / HASL
            mat.needsUpdate = true;
            return;
          }

          // 4. Silkscreen text and component outlines
          if (name.includes("silkscreen") || name.includes("silk")) {
            mat.color.setHex(0xfafafa);
            mat.roughness = 0.9;
            mat.metalness = 0.0;
            mat.needsUpdate = true;
          }
        }
      });
    },
    [],
  );

  // ── Initialise Three.js Renderer & Scene Once ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    const { scene, camera } = buildScene();
    sceneRef.current = scene;
    cameraRef.current = camera;

    // Smooth OrbitControls (Req 9)
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 5;
    controls.maxDistance = 1000;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = wrap;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(wrap);

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

  // ── Load Real KiCad GLB via GLTFLoader (Req 1, 2, 3, 4, 5, 6, 7) ──
  const loadGlbModel = useCallback(
    (url: string) => {
      if (!sceneRef.current) return;

      setLoadState("loading");
      setLoadMessage("Loading KiCad 3D Geometry");
      setLoadError(null);

      // Remove existing model
      if (modelRef.current) {
        sceneRef.current.remove(modelRef.current);
        modelRef.current = null;
      }

      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          if (!sceneRef.current) return;

          // Clean up any stale model
          if (modelRef.current) {
            sceneRef.current.remove(modelRef.current);
          }

          const model = gltf.scene;

          // KiCad exports in meters (1 unit = 1m). Scale by 1000 to convert to millimeters.
          model.scale.set(1000, 1000, 1000);
          model.updateMatrixWorld(true);

          // Center the physical model at (0, 0, 0)
          const box = new THREE.Box3().setFromObject(model);
          const center = new THREE.Vector3();
          box.getCenter(center);
          model.position.x = -center.x;
          model.position.y = -center.y;
          model.position.z = -center.z;

          // Enable shadows and PBR tuning across all meshes
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Compute exact physical dimensions
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.z, 20);

          setBoardDimensions({
            w: size.x,
            h: size.z,
            thickness: size.y,
            maxDim,
          });

          // Apply initial solder mask color & metallic finish
          applyMaterialTuning(solderMaskColor, model);

          sceneRef.current.add(model);
          modelRef.current = model;

          // Position camera at a crisp 45° isometric angle
          const cam = cameraRef.current;
          const ctrl = controlsRef.current;
          if (cam && ctrl) {
            cam.position.set(maxDim * 0.9, maxDim * 1.0, maxDim * 1.1);
            cam.lookAt(0, 0, 0);
            ctrl.target.set(0, 0, 0);
            ctrl.minDistance = maxDim * 0.2;
            ctrl.maxDistance = maxDim * 8.0;
            ctrl.update();
          }

          setLoadState("ready");
        },
        (progress) => {
          if (progress.total > 0) {
            const pct = Math.round((progress.loaded / progress.total) * 100);
            setLoadMessage(`Loading 3D PCB · ${pct}%`);
          }
        },
        (err) => {
          console.error("[ThreeDView] Failed to load authentic KiCad GLB:", err);
          setLoadState("error");
          setLoadError(
            "Could not load 3D PCB model. The GLB file may still be generating or unreachable.",
          );
        },
      );
    },
    [applyMaterialTuning, solderMaskColor],
  );

  // ── Watch glbUrl in design store ──────────────────────────────────
  useEffect(() => {
    if (d.glbUrl) {
      loadGlbModel(d.glbUrl);
    } else if (d.gen.active) {
      setLoadState("loading");
      setLoadMessage("Generating KiCad 3D PCB");
    } else {
      setLoadState("idle");
    }
  }, [d.glbUrl, d.gen.active, loadGlbModel]);

  // ── Handle Solder-mask Color Changes (Req 8) ──────────────────────
  const handleColorChange = (colorKey: SolderMaskColor) => {
    setSolderMaskColor(colorKey);
    applyMaterialTuning(colorKey);
  };

  // ── Camera Preset Controls (Req 9) ────────────────────────────────
  const setCameraPreset = (preset: "iso" | "top" | "bottom" | "side") => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const maxDim = boardDimensions?.maxDim || 60;

    ctrl.target.set(0, 0, 0);

    if (preset === "iso") {
      cam.position.set(maxDim * 0.9, maxDim * 1.0, maxDim * 1.1);
    } else if (preset === "top") {
      // Top view: looking directly down at F.Cu
      cam.position.set(0, maxDim * 1.6, 0.001);
    } else if (preset === "bottom") {
      // Bottom view: looking directly up at B.Cu
      cam.position.set(0, -maxDim * 1.6, 0.001);
    } else if (preset === "side") {
      // Edge profile view to inspect component heights and board thickness
      cam.position.set(maxDim * 1.6, 0, 0);
    }

    cam.lookAt(0, 0, 0);
    ctrl.update();
  };

  const resetCamera = () => setCameraPreset("iso");

  const zoomBy = (factor: number) => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.position.multiplyScalar(factor);
  };

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    if (controlsRef.current) {
      controlsRef.current.autoRotate = next;
      controlsRef.current.autoRotateSpeed = 2.5;
    }
  };

  const toggleWireframe = () => {
    const next = !wireframe;
    setWireframe(next);
    if (modelRef.current) {
      modelRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          (child.material as THREE.MeshStandardMaterial).wireframe = next;
        }
      });
    }
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#09090b]">
      {/* ── Three.js Canvas ────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full",
          loadState !== "ready" && "opacity-0 pointer-events-none",
        )}
        style={{ touchAction: "none" }}
      />

      {/* Subtle vignette backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800/10 via-transparent to-transparent" />

      {/* ── Status Overlays ────────────────────────────────────────── */}
      {loadState === "loading" && <LoadingOverlay message={loadMessage} />}
      {loadState === "idle" && (
        <UnavailableOverlay message="Generate or open a project to export the authentic KiCad 3D PCB layout." />
      )}
      {loadState === "error" && (
        <ErrorOverlay
          message={loadError ?? "An error occurred while loading the 3D model."}
          onRetry={() => {
            if (d.glbUrl) loadGlbModel(d.glbUrl);
          }}
        />
      )}

      {/* ── Top-Left HUD: Accurate Physical PCB Dimensions ─────────── */}
      {loadState === "ready" && (
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5 z-20">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-teal/30 bg-panel/85 px-2.5 py-1 font-mono text-[11px] font-semibold text-teal backdrop-blur-md shadow-lg">
              <Sparkles className="size-3 text-teal" />
              KiCad 3D Physical Board
            </span>
            {boardDimensions && (
              <span className="rounded-lg border border-border bg-panel/80 px-2.5 py-1 font-mono text-[11px] text-foreground/80 backdrop-blur-md shadow-lg">
                {boardDimensions.w.toFixed(1)} × {boardDimensions.h.toFixed(1)} mm · FR4 1.6mm
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Top-Right HUD: Solder-Mask Color Selector (Req 8) ──────── */}
      {loadState === "ready" && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/70 p-1.5 backdrop-blur-md shadow-2xl z-20">
          <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-1.5">
            Mask
          </span>
          {(Object.keys(SOLDER_MASK_PALETTES) as SolderMaskColor[]).map((key) => {
            const pal = SOLDER_MASK_PALETTES[key];
            const isSelected = solderMaskColor === key;
            return (
              <button
                key={key}
                title={pal.name}
                onClick={() => handleColorChange(key)}
                className={cn(
                  "size-5 rounded-full border transition-all duration-150 relative",
                  isSelected
                    ? "border-teal scale-110 shadow-[0_0_8px_rgba(74,223,227,0.5)]"
                    : "border-white/20 hover:scale-105 hover:border-white/50 opacity-80 hover:opacity-100",
                )}
                style={{ backgroundColor: pal.hex }}
              />
            );
          })}
        </div>
      )}

      {/* ── Bottom-Left Navigation Tip ─────────────────────────────── */}
      {loadState === "ready" && (
        <div className="pointer-events-none absolute bottom-3 left-3 hidden sm:flex items-center gap-2 rounded-lg border border-border/40 bg-black/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-md z-20">
          <Move3d className="size-3 text-teal" />
          <span>Left-drag to 360° orbit · Right-drag to pan · Scroll to zoom</span>
        </div>
      )}

      {/* ── Bottom-Right Camera Presets & Controls Toolbar (Req 9) ─── */}
      {loadState === "ready" && (
        <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/70 p-2 backdrop-blur-md shadow-2xl z-20">
          <CanvasBtn label="Top View (F.Cu)" onClick={() => setCameraPreset("top")}>
            <ArrowUp className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Bottom View (B.Cu)" onClick={() => setCameraPreset("bottom")}>
            <ArrowDown className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Side Profile View" onClick={() => setCameraPreset("side")}>
            <Layers className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Isometric 3D View" onClick={() => setCameraPreset("iso")}>
            <Compass className="size-3.5" />
          </CanvasBtn>
          <div className="my-0.5 h-px bg-white/10" />
          <CanvasBtn
            label={autoRotate ? "Stop 360° rotation" : "Auto-rotate 360° turntable"}
            onClick={toggleAutoRotate}
          >
            {autoRotate ? <Pause className="size-3.5 text-teal" /> : <Play className="size-3.5" />}
          </CanvasBtn>
          <CanvasBtn label="Zoom in" onClick={() => zoomBy(0.82)}>
            <ZoomIn className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Zoom out" onClick={() => zoomBy(1.22)}>
            <ZoomOut className="size-3.5" />
          </CanvasBtn>
          <CanvasBtn label="Toggle wireframe" onClick={toggleWireframe}>
            <Box className={cn("size-3.5", wireframe && "text-teal")} />
          </CanvasBtn>
          <CanvasBtn label="Reset camera" onClick={resetCamera}>
            <RotateCcw className="size-3.5" />
          </CanvasBtn>
        </div>
      )}
    </div>
  );
}
