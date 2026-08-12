import { useRef, useEffect, useState } from "react";
import { ArrowUp, Terminal, Loader2 } from "lucide-react";
import { suggestions } from "@/lib/flowcad-data";
import { runCommand, useDesign } from "@/lib/design-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useParams } from "@tanstack/react-router";

export function ChatDock() {
  const d = useDesign();
  const { id: projectId } = useParams({ strict: false });
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [d.chat, d.verifying]);

  const send = (text: string) => {
    if (!text.trim()) return;
    runCommand(text, projectId as string);
    setValue("");
  };

  return (
    <div className="flex h-full flex-col border-t border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Terminal className="size-3.5 text-teal" />
        <span className="label-mono">Conversational editor</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {d.chat.filter((e) => e.role === "user").length} commands
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {d.chat.map((e, i) => (
          <div key={i} className={cn("flex", e.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[70%] text-[12px] leading-relaxed",
                e.role === "user"
                  ? "rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                  : "text-foreground/85",
              )}
            >
              {e.role === "system" && <span className="label-mono mr-2 text-teal">flowcad</span>}
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
        {d.verifying && (
          <div className="flex items-center gap-2 font-mono text-[11px] text-teal">
            <Loader2 className="size-3 animate-spin" /> Verifying… running DRC / ERC / thermal
          </div>
        )}
      </div>

      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            "Make the board 20% smaller",
            "Move U1 to the center",
            "Replace U2 with TPS62203",
            "Add a status LED",
            ...suggestions.slice(2),
          ].map((s) => (
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
          placeholder="Make the board 20% smaller · move J1 to the left · add a buzzer…"
          className="flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" className="size-7 rounded-md p-0">
          <ArrowUp className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
