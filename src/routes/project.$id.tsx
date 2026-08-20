import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDesign, takeQueuedPrompt, resetDesign, runGeneration } from "@/lib/design-store";
import { Share2, Download, PanelLeftClose, PanelRightClose, Plus, Zap } from "lucide-react";
import { Logo } from "@/components/flowcad/Logo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PipelineStepper } from "@/components/flowcad/PipelineStepper";
import { BlockDiagram } from "@/components/flowcad/BlockDiagram";
import { SchematicView } from "@/components/flowcad/SchematicView";
import { PcbLayout } from "@/components/flowcad/PcbLayout";
import { ThreeDView } from "@/components/flowcad/ThreeDView";
import { ChatDock } from "@/components/flowcad/ChatDock";
import {
  DetailsPanel,
  VerificationPanel,
  BomPanel,
  AlternativesPanel,
} from "@/components/flowcad/ContextPanels";
import { StatusBadge } from "@/components/flowcad/StatusBadge";
import { CanvasEmpty } from "@/components/flowcad/CanvasEmpty";

export const Route = createFileRoute("/project/$id")({
  head: () => ({
    meta: [
      { title: "Workspace · FlowCAD" },
      {
        name: "description",
        content:
          "FlowCAD AI-powered PCB workspace — pipeline stepper, schematic, PCB layout, 3D preview, verification and BOM.",
      },
    ],
  }),
  component: Workspace,
});

const canvasTabs = [
  { v: "block", l: "Block Diagram" },
  { v: "schematic", l: "Schematic" },
  { v: "pcb", l: "PCB Layout" },
  { v: "3d", l: "3D View" },
];

const contextTabs = [
  { v: "details", l: "Details" },
  { v: "verification", l: "Verify" },
  { v: "bom", l: "BOM" },
  { v: "alternatives", l: "Alts" },
];

function Workspace() {
  const { id } = Route.useParams();
  const [stage, setStage] = useState("requirements");
  const [rightTab, setRightTab] = useState("details");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const design = useDesign();
  const hasArch = (design.architecture?.nodes?.length ?? 0) > 0;
  const hasParts = design.parts.length > 0;
  const hasNets = design.nets.length > 0;
  const has3d = Boolean(design.glbUrl);
  const hasDesign = hasParts || hasArch || hasNets || has3d || design.gen.active;
  const showBlock = hasArch || design.gen.active;
  const showSchematic = hasParts || hasNets || design.gen.active;
  const showPcb = hasParts || Boolean(design.layout) || design.gen.active;
  const show3d = has3d || design.ready['3d'] || design.gen.active;

  // On mount: if a prompt was queued from the landing page, run it
  useEffect(() => {
    const queued = takeQueuedPrompt();
    if (queued) {
      void runGeneration(queued, id);
    }
  }, [id]);

  // Auto-select Details when a component is clicked
  useEffect(() => {
    if (design.selected) setRightTab("details");
  }, [design.selected]);

  const projectTitle = design.meta.title || (design.gen.active ? "Generating…" : "New Project");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
        <Logo />
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
          / <span className="text-foreground/70">{projectTitle}</span>
          {design.meta.slug && <span className="text-teal"> {design.meta.slug}</span>}
        </span>
        <StatusBadge
          status={
            design.gen.active
              ? "RUNNING"
              : design.verifying
                ? "RUNNING"
                : design.checks.some((c) => c.status !== "PASS")
                  ? "WARNING"
                  : hasDesign
                    ? "PASS"
                    : "RUNNING"
          }
          className="hidden md:inline-flex"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => setLeftOpen((v) => !v)}
          >
            <PanelLeftClose className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => setRightOpen((v) => !v)}
          >
            <PanelRightClose className="size-3.5" />
          </Button>
          <Link to="/">
            <Button variant="secondary" size="sm" className="text-[12px]">
              <Plus className="size-3.5" /> New Project
            </Button>
          </Link>
          <Button variant="secondary" size="sm" className="hidden text-[12px] sm:inline-flex">
            <Share2 className="size-3.5" /> Share
          </Button>
          <Link to="/export">
            <Button size="sm" className="text-[12px]">
              <Download className="size-3.5" /> Export
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {leftOpen && (
          <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">
            <PipelineStepper activeId={stage} onSelect={setStage} />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <Tabs defaultValue="block" className="flex min-h-0 flex-1 flex-col gap-0">
              <div className="flex h-10 shrink-0 items-center border-b border-border bg-panel px-2">
                <TabsList className="h-8 bg-transparent p-0">
                  {canvasTabs.map(({ v, l }) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="rounded-md px-3 font-mono text-[11px] tracking-wide data-[state=active]:bg-accent data-[state=active]:text-teal"
                    >
                      {l}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <span className="ml-auto hidden font-mono text-[10px] text-muted-foreground md:inline">
                  {hasDesign
                    ? `grid 0.25 mm · units mm · ${design.board.w.toFixed(1)} × ${design.board.h.toFixed(1)} mm · ${design.parts.length} parts`
                    : "Enter a prompt below to generate a design"}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden bg-background">
                <TabsContent value="block" className="m-0 h-full">
                  {showBlock ? (
                    <BlockDiagram />
                  ) : (
                    <CanvasEmpty
                      label="Block Diagram"
                      description="No design yet — enter a prompt below to generate the block diagram"
                    />
                  )}
                </TabsContent>
                <TabsContent value="schematic" className="m-0 h-full">
                  {showSchematic ? (
                    <SchematicView />
                  ) : (
                    <CanvasEmpty
                      label="Schematic"
                      description="No schematic yet — enter a prompt below to generate the circuit"
                    />
                  )}
                </TabsContent>
                <TabsContent value="pcb" className="m-0 h-full">
                  {showPcb ? (
                    <PcbLayout projectId={id} />
                  ) : (
                    <CanvasEmpty
                      label="PCB Layout"
                      description="No PCB layout yet — enter a prompt to generate and place components"
                    />
                  )}
                </TabsContent>
                <TabsContent value="3d" className="m-0 h-full">
                  {show3d ? (
                    <ThreeDView />
                  ) : (
                    <CanvasEmpty
                      label="3D View"
                      description="No 3D model yet — generate a design first to see the board render"
                    />
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className="h-72 shrink-0">
            <ChatDock />
          </div>
        </div>

        {rightOpen && (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-sidebar xl:flex">
            <Tabs
              value={rightTab}
              onValueChange={setRightTab}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <TabsList className="h-10 w-full shrink-0 justify-start rounded-none border-b border-border bg-panel p-1">
                {contextTabs.map(({ v, l }) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="rounded-md px-2.5 font-mono text-[11px] data-[state=active]:bg-accent data-[state=active]:text-teal"
                  >
                    {l}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="details" className="m-0">
                  <DetailsPanel />
                </TabsContent>
                <TabsContent value="verification" className="m-0">
                  <VerificationPanel />
                </TabsContent>
                <TabsContent value="bom" className="m-0">
                  <BomPanel />
                </TabsContent>
                <TabsContent value="alternatives" className="m-0">
                  <AlternativesPanel />
                </TabsContent>
              </div>
            </Tabs>
          </aside>
        )}
      </div>
    </div>
  );
}
