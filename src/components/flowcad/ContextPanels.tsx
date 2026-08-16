import { ExternalLink, Cpu, Sparkles, MousePointerSquareDashed, Loader2 } from "lucide-react";
import { components as catalog, alternatives } from "@/lib/flowcad-data";
import { bomLines, bomTotalNow, useDesign } from "@/lib/design-store";
import { StatusBadge, MeterBar } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function DetailsPanel() {
  const d = useDesign();
  const part = d.parts.find((p) => p.ref === d.selected);

  if (!part) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <MousePointerSquareDashed className="size-4 text-teal" />
          <span className="label-mono">Design summary</span>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          No component selected. Click a symbol in the Schematic, a footprint in the PCB Layout, or
          a block in the architecture view to inspect its specifications and AI selection reasoning.
        </p>
        <dl className="divide-y divide-border rounded-md border border-border">
          {[
            ["Project", "IRRIGATION_CTRL rev B"],
            ["Board", `${d.board.w.toFixed(1)} × ${d.board.h.toFixed(1)} mm`],
            ["Components", String(d.parts.length)],
            ["Nets", String(d.nets.length)],
            ["BOM total", `$${bomTotalNow(d).toFixed(2)}`],
            ["Confidence", `${d.confidence}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between px-3 py-1.5">
              <dt className="text-[12px] text-muted-foreground">{k}</dt>
              <dd className="font-mono text-[12px]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const cat = catalog.find((c) => c.ref === part.ref || c.name === part.name);
  const specs: Array<[string, string]> = cat?.specs ?? [
    ["Package", part.pkg],
    ["Value", part.value],
    ["Qty", String(part.qty)],
  ];
  const reasoning =
    cat?.reasoning ??
    `${part.name} was added to satisfy the requested function. Placed on the top layer at ${(part.px / 9).toFixed(1)} / ${(part.py / 9).toFixed(1)} mm from the board origin and connected to the nearest available MCU net.`;
  const bad = d.drcNote?.includes(part.ref);

  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-teal" />
          <span className="font-mono text-[13px] text-foreground">{part.ref}</span>
          <StatusBadge status={bad ? "WARNING" : "PASS"} className="ml-auto" />
        </div>
        <h3 className="mt-2 font-mono text-[15px] font-medium text-teal">{part.name}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {cat?.desc ?? part.value} · {part.pkg}
        </p>
        {bad && (
          <p className="mt-2 rounded-md border border-warn/30 bg-warn/8 p-2 font-mono text-[11px] text-warn">
            ⚠ {d.drcNote}
          </p>
        )}
      </div>

      <div>
        <p className="label-mono mb-2">Specifications</p>
        <dl className="divide-y divide-border rounded-md border border-border">
          {specs.map(([k, v]) => (
            <div key={k} className="flex justify-between px-3 py-1.5">
              <dt className="text-[12px] text-muted-foreground">{k}</dt>
              <dd className="font-mono text-[12px] text-foreground">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between px-3 py-1.5">
            <dt className="text-[12px] text-muted-foreground">Position</dt>
            <dd className="font-mono text-[12px] text-foreground">
              {(part.px / 9).toFixed(2)} / {(part.py / 9).toFixed(2)} mm
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="label-mono mb-2 flex items-center gap-1.5">
          <Sparkles className="size-3 text-teal" /> AI Reasoning
        </p>
        <p className="rounded-md border border-teal/25 bg-teal/6 p-3 text-[12px] leading-relaxed text-foreground/85">
          {reasoning}
        </p>
      </div>

      <div className="space-y-2">
        <p className="label-mono">Sourcing</p>
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <span className="font-mono text-[12px] text-muted-foreground">Unit / Qty</span>
          <span className="font-mono text-[12px]">
            ${part.unit.toFixed(2)} × {part.qty}
          </span>
        </div>
        <Button variant="secondary" size="sm" className="w-full font-mono text-[11px]" asChild>
          <a
            href={`https://datasheets.flowcad.dev/${cat?.datasheet ?? `${part.ref.toLowerCase()}_datasheet.pdf`}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" />
            {cat?.datasheet ?? `${part.ref.toLowerCase()}_datasheet.pdf`}
          </a>
        </Button>
      </div>
    </div>
  );
}

export function VerificationPanel() {
  const d = useDesign();
  const warnings = d.checks.filter((c) => c.status !== "PASS").length;
  return (
    <div className="space-y-5 p-4">
      <div className="rounded-lg border border-teal/30 bg-teal/6 p-4">
        <p className="label-mono flex items-center gap-2">
          Design Confidence
          {d.verifying && <Loader2 className="size-3 animate-spin text-teal" />}
        </p>
        <div className="mt-1 flex items-end gap-2">
          <span className="font-mono text-3xl font-semibold text-teal">{d.confidence}%</span>
          <span className="pb-1.5 text-[11px] text-muted-foreground">
            {d.verifying
              ? "Verifying…"
              : `${warnings} warning${warnings === 1 ? "" : "s"} to review`}
          </span>
        </div>
        <MeterBar value={d.confidence} tone="teal" className="mt-3" />
      </div>

      <div className={cn("space-y-4 transition-opacity", d.verifying && "opacity-50")}>
        {d.checks.map((c) => (
          <div key={c.name}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium">{c.name}</span>
              <StatusBadge status={d.verifying ? "RUNNING" : c.status} />
            </div>
            <MeterBar
              value={c.score}
              tone={c.status === "PASS" ? "pass" : c.status === "WARNING" ? "warn" : "fail"}
              className="mt-2"
            />
            <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{c.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BomPanel() {
  const d = useDesign();
  const lines = bomLines(d);
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="label-mono">Bill of Materials</p>
        <span className="font-mono text-[11px] text-teal">{lines.length} lines</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left">
          <thead className="bg-secondary/60">
            <tr className="label-mono">
              <th className="px-2.5 py-2 font-normal">Part</th>
              <th className="px-1 py-2 text-right font-normal">Qty</th>
              <th className="px-1 py-2 font-normal">Pkg</th>
              <th className="px-2.5 py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((c) => (
              <tr
                key={c.ref}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-secondary/40",
                  d.selected === c.ref && "bg-teal/10",
                )}
              >
                <td className="px-2.5 py-2">
                  <div className="font-mono text-[11px] text-foreground">{c.name}</div>
                  <div className="font-mono text-[9px] text-muted-foreground">{c.ref}</div>
                </td>
                <td className="px-1 py-2 text-right font-mono text-[11px]">{c.qty}</td>
                <td className="px-1 py-2 font-mono text-[10px] text-muted-foreground">{c.pkg}</td>
                <td className="px-2.5 py-2 text-right font-mono text-[11px] text-teal">
                  ${c.total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-panel-raised px-3 py-2.5">
        <span className="label-mono">Board total (qty 1)</span>
        <span className="font-mono text-[14px] text-teal">${bomTotalNow(d).toFixed(2)}</span>
      </div>
    </div>
  );
}

export function AlternativesPanel() {
  const [picked, setPicked] = useState("A");
  return (
    <div className="space-y-3 p-4">
      <p className="label-mono">Candidate designs</p>
      {alternatives.map((a) => (
        <div
          key={a.id}
          className={cn(
            "rounded-lg border p-3 transition-colors",
            picked === a.id
              ? "border-teal/60 bg-teal/8"
              : "border-border bg-panel hover:bg-secondary/40",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px]">{a.title}</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase text-muted-foreground">
              {a.tag}
            </span>
            {a.recommended && (
              <span className="ml-auto font-mono text-[9px] tracking-wider text-teal uppercase">
                recommended
              </span>
            )}
          </div>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              ["Cost", a.cost],
              ["Power", a.power],
              ["Size", a.size],
              ["Parts", String(a.parts)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border/60 pb-1">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className="font-mono text-[11px]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{a.notes}</p>
          <Button
            size="sm"
            variant={picked === a.id ? "default" : "secondary"}
            className="mt-3 w-full text-[11px]"
            onClick={() => setPicked(a.id)}
          >
            {picked === a.id ? "Selected design" : "Select this design"}
          </Button>
        </div>
      ))}
    </div>
  );
}
