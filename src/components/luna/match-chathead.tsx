"use client";

import { useState } from "react";
import { Sparkles, X, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LunaMoon } from "@/components/luna/luna-moon";

export function MatchChathead({
  onAddPopular,
  onChangeInterests,
  onDismiss,
}: {
  onAddPopular: () => void;
  onChangeInterests: () => void;
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-4 duration-300">
      {open && (
        <div className="relative w-[calc(100vw-2rem)] max-w-xs sm:max-w-sm sm:w-88 rounded-2xl border border-white/15 bg-zinc-950/95 p-3.5 sm:p-4 shadow-[0_12px_40px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.1)] backdrop-blur-xl animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>Deep Space Matchmaker</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDismiss?.();
              }}
              className="text-zinc-400 hover:text-zinc-100 p-1 rounded-md transition-colors"
              title="Minimize"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            Floating alone in deep space? No strangers are active on your exact topics right now.
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Broaden your search with popular midnight topics to connect faster.
          </p>

          <div className="mt-3.5 flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAddPopular();
                setOpen(false);
              }}
              className="w-full h-8 text-xs font-medium bg-zinc-100 text-zinc-950 hover:bg-zinc-200 shadow-sm"
            >
              <Compass className="h-3.5 w-3.5 mr-1.5 text-zinc-950" />
              <span>Add Popular Midnight Topics</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onChangeInterests();
                  setOpen(false);
                }}
                className="flex-1 h-7 text-[11px] border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-900"
              >
                Change Topics
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="h-7 px-2.5 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                Keep Waiting
              </Button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-white/20 bg-zinc-900/90 shadow-[0_8px_25px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.15)] backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
        title="Matchmaking suggestions"
      >
        <LunaMoon className="h-5 w-5 text-zinc-100 group-hover:text-white transition-colors" />

        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-zinc-950 animate-pulse">
          !
        </span>
      </button>
    </div>
  );
}
