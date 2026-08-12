import { Check, Loader2, Circle, AlertTriangle } from "lucide-react";
import { stages as fallbackStages } from "@/lib/flowcad-data";
import { useDesign } from "@/lib/design-store";
import { cn } from "@/lib/utils";

export function PipelineStepper({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const design = useDesign();

  // Dynamically use design.gen.stages if active or populated; otherwise fallback to static definitions
  const activeStages = design.gen.active
    ? design.gen.stages.map((s) => ({
        id: s.id,
        name: s.label,
        short: s.id.slice(0, 4).toUpperCase(),
        status: s.status,
        detail: s.status === "active" ? s.running : s.snippet || "Completed",
      }))
    : fallbackStages;

  const completedCount = activeStages.filter((s) => s.status === "done" || s.status === "warning").length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="label-mono">Pipeline</p>
        <p className="mt-1 font-mono text-[11px] text-teal">
          {completedCount} / {activeStages.length} stages complete
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {activeStages.map((s, i) => {
          const isCurrent = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "group relative flex w-full gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors",
                isCurrent ? "bg-accent" : "hover:bg-secondary/60",
              )}
            >
              <div className="relative flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    s.status === "done" && "border-pass/50 bg-pass/15 text-pass",
                    s.status === "warning" && "border-warn/50 bg-warn/15 text-warn",
                    s.status === "active" && "border-progress/60 bg-progress/15 text-progress",
                    s.status === "pending" && "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {s.status === "done" ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : s.status === "warning" ? (
                    <AlertTriangle className="size-3 text-warn" />
                  ) : s.status === "active" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Circle className="size-2 fill-current" />
                  )}
                </span>
                {i < activeStages.length - 1 && (
                  <span
                    className={cn(
                      "mt-1 w-px flex-1",
                      s.status === "done" || s.status === "warning" ? "bg-pass/40" : "bg-border",
                    )}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px] font-medium",
                      isCurrent ? "text-foreground" : "text-foreground/80",
                    )}
                  >
                    {s.name}
                  </span>
                  <span className="font-mono text-[9px] tracking-widest text-muted-foreground">
                    {s.short}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {s.detail}
                </p>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
