"use client";

import { Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DynamicIslandProps {
  show: boolean;
  remainingSeconds: number;
  onStayConnected: () => void;
}

function formatCountdown(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function DynamicIsland({ show, remainingSeconds, onStayConnected }: DynamicIslandProps) {
  if (!show && remainingSeconds <= 0) return null;

  return (
    <div
      className={cn(
        "fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 max-w-[94vw] w-auto transition-all duration-300 ease-out select-none",
        show
          ? "opacity-100 translate-y-2 scale-100 pointer-events-auto"
          : "opacity-0 -translate-y-4 scale-95 pointer-events-none",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onStayConnected}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onStayConnected();
          }
        }}
        className="group flex items-center justify-center gap-2 sm:gap-2.5 rounded-full border border-amber-500/40 bg-zinc-950/95 px-3 sm:px-4 py-1.5 sm:py-2 min-h-[38px] shadow-[0_12px_40px_rgba(0,0,0,0.9),0_0_15px_rgba(245,158,11,0.2),inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-2xl cursor-pointer hover:border-amber-400 hover:scale-102 active:scale-95 touch-manipulation transition-all"
      >
        <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
          <span className="font-semibold text-amber-200">Away</span>
          <span className="text-zinc-500">•</span>
          <span className="flex items-center gap-1 font-mono text-zinc-300">
            <Clock className="h-3 w-3 text-amber-400/90 shrink-0" />
            <span>{formatCountdown(remainingSeconds)}</span>
          </span>
        </div>

        <div className="h-3.5 w-px bg-white/15 shrink-0" />

        <div className="flex items-center gap-1 text-[11px] sm:text-xs font-medium text-indigo-300 group-hover:text-indigo-200 transition-colors whitespace-nowrap">
          <Sparkles className="h-3 w-3 text-indigo-400 shrink-0" />
          <span>Tap to stay</span>
        </div>
      </div>
    </div>
  );
}
