import { Check, Loader2, Circle } from "lucide-react";
import { stages } from "@/lib/flowcad-data";
import { cn } from "@/lib/utils";

export function PipelineStepper({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="label-mono">Pipeline</p>
        <p className="mt-1 font-mono text-[11px] text-teal">6 / 9 stages complete</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {stages.map((s, i) => {
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
                    s.status === "active" && "border-progress/60 bg-progress/15 text-progress",
                    s.status === "pending" && "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {s.status === "done" ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : s.status === "active" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Circle className="size-2 fill-current" />
                  )}
                </span>
                {i < stages.length - 1 && (
                  <span
                    className={cn(
                      "mt-1 w-px flex-1",
                      s.status === "done" ? "bg-pass/40" : "bg-border",
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
