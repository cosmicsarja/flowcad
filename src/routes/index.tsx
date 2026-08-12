import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  MessagesSquare,
  ShieldCheck,
  Workflow,
  Factory,
  CircuitBoard,
  Plus,
} from "lucide-react";
import { Logo } from "@/components/flowcad/Logo";
import { Button } from "@/components/ui/button";
import { samplePrompt } from "@/lib/flowcad-data";
import { resetDesign, queuePrompt } from "@/lib/design-store";


export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "FlowCAD — Prompt-to-PCB AI Design Platform" },
      {
        name: "description",
        content:
          "FlowCAD turns a plain-language description into a verified schematic, PCB layout, 3D model and manufacturing files.",
      },
      { property: "og:title", content: "FlowCAD — Prompt-to-PCB AI Design Platform" },
      {
        property: "og:description",
        content:
          "Describe an electronic system. FlowCAD designs the schematic, PCB, verification report and Gerbers.",
      },
    ],
  }),
  component: Landing,
}));

const features = [
  {
    icon: MessagesSquare,
    title: "Conversational Design",
    body: "Iterate in natural language — 'move USB-C to the left edge' re-places, re-routes and re-verifies the board.",
  },
  {
    icon: ShieldCheck,
    title: "Verification-Aware AI",
    body: "ERC, DRC, power integrity and manufacturability checks run inside the loop, not after it.",
  },
  {
    icon: Workflow,
    title: "Multi-Agent Pipeline",
    body: "Specialised agents for architecture, part selection, placement and routing hand off with traceable reasoning.",
  },
  {
    icon: Factory,
    title: "Manufacturing-Ready",
    body: "Gerber X2, drill files, pick-and-place, LCSC-matched BOM and a signed design report on export.",
  },
];

const pipeline = ["Prompt", "Architecture", "Schematic", "PCB", "Verification", "3D", "Export"];

function Landing() {
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();

  function startNewProject(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    // Generate a local UUID — no backend or Supabase call needed to open the workspace.
    // The pipeline itself will persist to Supabase when the backend is running.
    const id = crypto.randomUUID();
    resetDesign();
    queuePrompt(trimmed);
    void navigate({ to: "/project/$id", params: { id } });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Logo />
          <nav className="hidden items-center gap-5 md:flex">
            {["Platform", "Pipeline", "Library", "Docs"].map((n) => (
              <span
                key={n}
                className="cursor-default font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-teal"
              >
                {n}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              className="text-[12px]"
              onClick={() => startNewProject(prompt || samplePrompt)}
            >
              <Plus className="size-3.5" /> New Project
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="cad-grid-fine absolute inset-0 opacity-50" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/50 to-transparent" />
          <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/8 px-3 py-1 font-mono text-[10px] tracking-widest text-teal uppercase">
              <CircuitBoard className="size-3" /> EDA · rev 0.9 preview
            </span>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-balance md:text-6xl">
              Describe it. <span className="text-gradient-teal">FlowCAD designs it.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              A prompt-to-PCB platform that reasons like a hardware engineer — from requirements to
              Gerbers, with verification in every loop.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                startNewProject(prompt);
              }}
              className="mx-auto mt-9 max-w-2xl rounded-xl border border-border bg-panel p-2 glow-ring"
            >
              <div className="flex items-center gap-2">
                <span className="pl-3 font-mono text-[13px] text-teal">›</span>
                <input
                  id="prompt-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={samplePrompt}
                  className="h-11 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground"
                />
                <Button type="submit" className="h-9 shrink-0 text-[12px]">
                  Generate design <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </form>
            <p className="mt-3 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              avg. first schematic in 48 s · 2 400+ verified parts in library
            </p>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <p className="label-mono text-center">The pipeline</p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
              {pipeline.map((p, i) => (
                <div key={p} className="flex items-center gap-2">
                  <div className="rounded-md border border-border bg-panel px-3.5 py-2 font-mono text-[11px] tracking-wide transition-colors hover:border-teal/60 hover:text-teal">
                    <span className="mr-2 text-[9px] text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {p}
                  </div>
                  {i < pipeline.length - 1 && (
                    <span className="h-px w-6 bg-gradient-to-r from-teal/60 to-primary/40" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <article
                key={f.title}
                className="group rounded-xl border border-border bg-panel p-5 transition-colors hover:border-teal/40"
              >
                <f.icon className="size-5 text-teal" />
                <h2 className="mt-4 text-[14px] font-medium">{f.title}</h2>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-10">
            <div>
              <p className="text-[15px] font-medium">Start with an example prompt</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                ESP32 irrigation controller · LED blinker · BME280 weather station
              </p>
            </div>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => startNewProject("Design an ESP32-based smart irrigation controller with soil moisture sensor, DHT22 temp/humidity sensor, 12V relay driver, USB-C 5V power, and 3.3V LDO regulator.")}
            >
              Launch example <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo />
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            © 2026 FlowCAD · build 0.9.2-rc
          </span>
        </div>
      </footer>
    </div>
  );
}
