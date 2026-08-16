import React from "react";
import { Cpu, CircuitBoard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CanvasEmptyProps {
  label?: string;
  hint?: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CanvasEmpty({
  label,
  hint,
  title,
  description,
  icon,
  action,
  className,
}: CanvasEmptyProps) {
  const displayTitle = title || (label ? `${label} Not Generated` : "No Design Loaded");
  const displayHint =
    hint ||
    description ||
    "No design generated yet — enter a prompt in the chat dock to get started.";

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background p-6 select-none",
        className,
      )}
    >
      {/* Background CAD grid */}
      <div className="cad-grid absolute inset-0 opacity-40 pointer-events-none" />

      {/* Decorative center glow */}
      <div className="absolute h-64 w-64 rounded-full bg-teal/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        {/* Icon wrapper */}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-border/80 bg-panel/90 text-teal shadow-lg shadow-black/20 backdrop-blur-sm">
          {icon || <CircuitBoard className="h-7 w-7 stroke-[1.5]" />}
        </div>

        {/* Optional category tag */}
        {label && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-0.5 font-mono text-[10px] tracking-wider uppercase text-teal">
            <Sparkles className="h-3 w-3" />
            {label} STAGE
          </div>
        )}

        {/* Title */}
        <h3 className="font-mono text-base font-medium tracking-tight text-foreground">
          {displayTitle}
        </h3>

        {/* Description / Hint */}
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{displayHint}</p>

        {/* Optional Action Button / CTA */}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
