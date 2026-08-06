import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDesign } from "@/lib/design-store";
import { Share2, Play, Download, PanelLeftClose, PanelRightClose } from "lucide-react";
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

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — ESP32 Irrigation Controller · FlowCAD" },
      {
        name: "description",
        content:
          "FlowCAD workspace: pipeline stepper, block diagram, schematic, PCB layout, 3D preview, verification and BOM for an ESP32 irrigation controller.",
      },
      { property: "og:title", content: "FlowCAD Workspace — ESP32 Irrigation Controller" },
      {
        property: "og:description",
        content: "A CAD-grade multi-panel workspace for AI-generated PCB designs.",
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
  const [stage, setStage] = useState("routing");
  const [rightTab, setRightTab] = useState("details");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const design = useDesign();

  useEffect(() => {
    if (design.selected) setRightTab("details");
  }, [design.selected]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
        <Logo />
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
          / irrigation_ctrl <span className="text-teal">rev B</span>
        </span>
        <StatusBadge
          status={design.verifying ? "RUNNING" : design.checks.some((c) => c.status !== "PASS") ? "WARNING" : "PASS"}
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
          <Button variant="secondary" size="sm" className="text-[12px]">
            <Play className="size-3.5" /> Re-run
          </Button>
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
                  {`grid 0.25 mm · units mm · ${design.board.w.toFixed(1)} × ${design.board.h.toFixed(1)} mm · ${design.parts.length} parts`}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden bg-background">
                <TabsContent value="block" className="m-0 h-full">
                  <BlockDiagram />
                </TabsContent>
                <TabsContent value="schematic" className="m-0 h-full">
                  <SchematicView />
                </TabsContent>
                <TabsContent value="pcb" className="m-0 h-full">
                  <PcbLayout />
                </TabsContent>
                <TabsContent value="3d" className="m-0 h-full">
                  <ThreeDView />
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
