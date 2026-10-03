"use client";

import { MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InterestGrid } from "@/components/luna/interest-grid";

export function BootView({
  interests,
  onInterests,
  onCall,
  busy,
}: {
  interests: string[];
  onInterests: (next: string[]) => void;
  onCall: () => void;
  busy: boolean;
}) {

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="flex flex-col items-center text-center select-none mb-1">
        <div className="animate-fade-up inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-white/10 bg-zinc-900/70 backdrop-blur-md mb-2 sm:mb-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 tracking-wide">
            anonymous
          </span>
        </div>

        <h1 className="animate-fade-up stagger-1 text-3xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-100 to-zinc-400">
          Luna
        </h1>

        <p className="animate-fade-up stagger-2 mt-1.5 sm:mt-2 max-w-sm text-xs sm:text-sm text-zinc-400 leading-relaxed px-2">
          Late-night conversations with strangers. No account needed.
        </p>
      </div>

      <div className="animate-fade-up stagger-3 mt-4 sm:mt-6 w-full max-w-md rounded-xl sm:rounded-2xl border border-white/10 bg-zinc-950/70 p-3.5 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <InterestGrid value={interests} onChange={onInterests} />
      </div>

      <div className="animate-fade-up stagger-4 mt-5 sm:mt-6 flex flex-col items-center gap-2 w-full max-w-xs sm:max-w-none">
        <Button
          type="button"
          size="lg"
          onClick={onCall}
          disabled={busy}
          aria-label="Start Text Chat"
          className="h-11 sm:h-12 w-full sm:w-auto px-8 sm:px-10 rounded-full font-semibold text-sm sm:text-base bg-white text-zinc-950 hover:bg-zinc-200 shadow-[0_0_30px_rgba(255,255,255,0.25)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Start Text Chat</span>
        </Button>
        <span className="hidden sm:inline-block text-[11px] font-mono text-zinc-400">
          press Enter ↵
        </span>
      </div>

      <div className="animate-fade-up stagger-5 mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-[11px] sm:text-xs text-zinc-400 text-center">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
          <span>Private & ephemeral • Disappears when you leave</span>
        </div>
      </div>
    </section>
  );
}
