"use client";

import { ArrowDown } from "lucide-react";

export function ScrollBottomPill({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-950/90 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-xl backdrop-blur-xl hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
      >
        <ArrowDown className="h-3.5 w-3.5 text-indigo-400 animate-bounce" />
        <span>Jump to latest</span>
      </button>
    </div>
  );
}
