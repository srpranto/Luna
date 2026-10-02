"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarfieldCanvas } from "@/components/luna/starfield-canvas";
import { MatchChathead } from "@/components/luna/match-chathead";
import { LunaMoon } from "@/components/luna/luna-moon";
import { formatElapsed } from "@/lib/luna/identity";

export function ListeningView({
  enteredAt,
  interests,
  onStop,
  onAddPopular,
  busy,
}: {
  enteredAt: string | null;
  interests: string[];
  onStop: () => void;
  onAddPopular: () => void;
  busy: boolean;
}) {
  const [waitMs, setWaitMs] = useState(() => {
    return enteredAt ? Math.max(0, Date.now() - new Date(enteredAt).getTime()) : 0;
  });

  useEffect(() => {
    if (!enteredAt) return;
    const timer = window.setInterval(() => {
      setWaitMs(Math.max(0, Date.now() - new Date(enteredAt).getTime()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enteredAt]);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 text-center overflow-hidden">
      <StarfieldCanvas
        speed={waitMs > 15000 ? 3.5 : 2.2}
        className="absolute inset-0 pointer-events-none opacity-80"
      />

      <div className="animate-fade-up relative z-10 flex items-center justify-center w-40 h-40 sm:w-60 sm:h-60 my-2 sm:my-4">
        <div className="absolute inset-0 rounded-full border border-indigo-500/20 bg-indigo-500/5 radar-ring" />
        <div className="absolute inset-0 rounded-full border border-white/10 bg-zinc-900/10 radar-ring-delayed" />
        <div className="relative flex h-20 w-20 sm:h-28 sm:w-28 items-center justify-center rounded-full border border-indigo-400/30 bg-zinc-950/90 shadow-[0_0_50px_rgba(99,102,241,0.25),inset_0_1px_0_0_rgba(255,255,255,0.2)] backdrop-blur-md overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/15 to-transparent pointer-events-none" />
          <LunaMoon className="h-8 w-8 sm:h-10 sm:w-10 text-zinc-100 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.7)]" glow />
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm sm:max-w-md px-4 text-center">
        <p className="animate-fade-up stagger-1 text-base sm:text-lg font-medium text-zinc-100 tracking-tight">
          Finding someone to chat with…
        </p>

        <div className="animate-fade-up stagger-2 mt-2.5 inline-flex items-center gap-2 rounded-full bg-zinc-900/95 border border-white/15 px-3 py-1 text-xs font-mono text-zinc-200 shadow-inner">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>{formatElapsed(waitMs)}</span>
        </div>

        <p className="animate-fade-up stagger-3 mt-2 text-xs text-zinc-400">
          Traversing deep space to find a quiet mind
        </p>

        {interests.length > 0 && (
          <div className="animate-fade-up stagger-4 mt-3 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 max-w-xs sm:max-w-md">
            {interests.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="font-mono text-[10px] sm:text-xs border border-white/10 bg-zinc-900/80"
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {waitMs >= 8000 && waitMs < 60000 && (
          <div className="animate-fade-up stagger-4 mt-3.5 max-w-xs sm:max-w-sm rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs text-zinc-400 text-center leading-relaxed backdrop-blur-sm">
            <span>Still looking for a match. Try changing, adding, or removing topics.</span>
          </div>
        )}

        <div className="animate-fade-up stagger-5 mt-6 sm:mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={onStop}
            disabled={busy}
            className="h-9 sm:h-10 px-5 w-full sm:w-auto border-zinc-800 text-zinc-300 hover:text-white bg-zinc-950/80 backdrop-blur-sm text-xs sm:text-sm"
          >
            Leave the queue
          </Button>
        </div>
      </div>

      {waitMs >= 60000 && (
        <MatchChathead
          onAddPopular={onAddPopular}
          onChangeInterests={onStop}
        />
      )}
    </section>
  );
}
