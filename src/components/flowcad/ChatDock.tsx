import { useState, useRef, useEffect } from "react";
import { ArrowUp, Terminal } from "lucide-react";
import { chatHistory, suggestions, type ChatEntry } from "@/lib/flowcad-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const replies = [
  "✅ Change applied. Re-placing affected components and re-running verification...",
  "✅ Netlist updated. 41 nets revalidated · ERC clean · DRC re-queued.",
  "✅ Constraint accepted. Auto-router restarted — 94% → 97% completion.",
];

export function ChatDock() {
  const [entries, setEntries] = useState<ChatEntry[]>(chatHistory);
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setEntries((e) => [...e, { role: "user", text: t, time }]);
    setValue("");
    setTimeout(() => {
      setEntries((e) => [
        ...e,
        { role: "system", text: replies[e.length % replies.length]!, time },
      ]);
    }, 550);
  };

  return (
    <div className="flex h-full flex-col border-t border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Terminal className="size-3.5 text-teal" />
        <span className="label-mono">Conversational editor</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {entries.filter((e) => e.role === "user").length} commands
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {entries.map((e, i) => (
          <div key={i} className={cn("flex", e.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[70%] text-[12px] leading-relaxed",
                e.role === "user"
                  ? "rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                  : "text-foreground/85",
              )}
            >
              {e.role === "system" && (
                <span className="label-mono mr-2 text-teal">flowcad</span>
              )}
              {e.text}
              <span
                className={cn(
                  "ml-2 font-mono text-[9px]",
                  e.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {e.time}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-teal/50 hover:text-teal"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          send(value);
        }}
        className="flex items-center gap-2 border-t border-border px-4 py-3"
      >
        <span className="font-mono text-[12px] text-teal">›</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Make the board 20% smaller…"
          className="flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" className="size-7 rounded-md p-0">
          <ArrowUp className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
