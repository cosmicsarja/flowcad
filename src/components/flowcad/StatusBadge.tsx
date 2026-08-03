import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: "PASS" | "WARNING" | "FAIL" | "RUNNING";
  className?: string;
}) {
  const tone =
    status === "PASS"
      ? "border-pass/40 bg-pass/12 text-pass"
      : status === "WARNING"
        ? "border-warn/40 bg-warn/12 text-warn"
        : status === "FAIL"
          ? "border-fail/40 bg-fail/12 text-fail"
          : "border-progress/40 bg-progress/12 text-progress";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest uppercase",
        tone,
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          status === "RUNNING" && "pulse-dot",
        )}
      />
      {status}
    </span>
  );
}

export function MeterBar({
  value,
  tone = "pass",
  className,
}: {
  value: number;
  tone?: "pass" | "warn" | "fail" | "progress" | "teal";
  className?: string;
}) {
  const color = {
    pass: "bg-pass",
    warn: "bg-warn",
    fail: "bg-fail",
    progress: "bg-progress",
    teal: "bg-teal",
  }[tone];

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
