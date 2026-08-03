import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileCheck2, ArrowLeft, Package } from "lucide-react";
import { Logo } from "@/components/flowcad/Logo";
import { Button } from "@/components/ui/button";
import { MeterBar, StatusBadge } from "@/components/flowcad/StatusBadge";
import { exportArtifacts, checks, confidence, bomTotal } from "@/lib/flowcad-data";

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "Export & Manufacturing Files — FlowCAD" },
      {
        name: "description",
        content:
          "Download Gerbers, drill files, netlist, BOM, 3D STEP model and the FlowCAD verification report for your generated PCB.",
      },
      { property: "og:title", content: "Export & Manufacturing Files — FlowCAD" },
      {
        property: "og:description",
        content: "Manufacturing-ready outputs with a 94% design confidence report.",
      },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const [downloaded, setDownloaded] = useState<string[]>([]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
          <Logo />
          <span className="label-mono hidden sm:inline">/ export</span>
          <Link to="/workspace" className="ml-auto">
            <Button variant="ghost" size="sm" className="text-[12px]">
              <ArrowLeft className="size-3.5" /> Back to workspace
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="relative overflow-hidden rounded-xl border border-teal/30 bg-panel p-6">
          <div className="cad-grid absolute inset-0 opacity-25" />
          <div className="relative flex flex-wrap items-center gap-6">
            <div>
              <p className="label-mono">Design Confidence</p>
              <p className="mt-1 font-mono text-5xl font-semibold text-teal">{confidence}%</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                IRRIGATION_CTRL · REV B · 48 × 36 mm · 23 parts · ${bomTotal.toFixed(2)} / board
              </p>
            </div>
            <div className="min-w-[280px] flex-1 space-y-2.5">
              {checks.map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    {c.name}
                  </span>
                  <MeterBar
                    value={c.score}
                    tone={c.status === "PASS" ? "pass" : c.status === "WARNING" ? "warn" : "fail"}
                  />
                  <span className="w-9 shrink-0 text-right font-mono text-[11px]">{c.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Package className="size-4 text-teal" />
          <h1 className="text-[15px] font-medium">Manufacturing outputs</h1>
          <StatusBadge status="PASS" className="ml-auto" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exportArtifacts.map((a) => {
            const done = downloaded.includes(a.name);
            return (
              <article
                key={a.name}
                className="group rounded-lg border border-border bg-panel p-4 transition-colors hover:border-teal/40"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-muted-foreground">
                    {a.fmt}
                  </span>
                  <button
                    onClick={() => setDownloaded((d) => [...new Set([...d, a.name])])}
                    aria-label={`Download ${a.name}`}
                    className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-teal/50 hover:text-teal"
                  >
                    {done ? <FileCheck2 className="size-4 text-pass" /> : <Download className="size-4" />}
                  </button>
                </div>
                <h2 className="mt-3 text-[13px] font-medium">{a.name}</h2>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{a.file}</p>
                <p className="mt-2 font-mono text-[10px] text-teal">{a.size}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel-raised px-5 py-4">
          <div>
            <p className="text-[13px] font-medium">Download complete fabrication package</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              flowcad_irrigation_rev_b_fab.zip · 15.7 MB
            </p>
          </div>
          <Button className="ml-auto text-[12px]">
            <Download className="size-3.5" /> Download all
          </Button>
        </div>
      </main>
    </div>
  );
}
