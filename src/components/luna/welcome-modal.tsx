"use client";

import { useState, useEffect } from "react";
import { Moon, ArrowRight, ShieldCheck, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISITED_KEY = "luna.has_visited";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasVisited = localStorage.getItem(VISITED_KEY);
    if (!hasVisited) {
      const timer = setTimeout(() => setOpen(true), 0);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleProceed() {
    if (typeof window !== "undefined") {
      localStorage.setItem(VISITED_KEY, "true");
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950/95 p-5 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-center backdrop-blur-2xl">
        <div className="animate-fade-up mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border border-white/15 bg-zinc-900/90 shadow-[0_0_35px_rgba(255,255,255,0.1),inset_0_1px_0_0_rgba(255,255,255,0.15)] mb-4 sm:mb-5">
          <Moon className="h-7 w-7 sm:h-8 sm:w-8 text-zinc-100 animate-pulse" />
        </div>

        <div className="animate-fade-up stagger-1 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1 text-xs font-mono text-zinc-300 mb-3">
          <Sparkles className="h-3 w-3 text-indigo-400" />
          <span>Welcome to Luna</span>
        </div>

        <h2 className="animate-fade-up stagger-2 text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
          Late-night conversations with strangers.
        </h2>

        <p className="animate-fade-up stagger-3 mt-3 text-sm text-zinc-400 leading-relaxed">
          No account needed. Pick a topic, sit down, and speak freely. Walk away whenever
          you&apos;re ready.
        </p>

        <div className="animate-fade-up stagger-4 mt-5 rounded-xl border border-white/5 bg-zinc-900/40 p-3.5 text-xs text-zinc-400 space-y-2 text-left">
          <div className="flex items-center gap-2 text-zinc-300">
            <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>End-to-end encrypted in your browser</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span>Messages disappear permanently when either leaves</span>
          </div>
        </div>

        <div className="animate-fade-up stagger-5 mt-6">
          <Button
            type="button"
            size="lg"
            onClick={handleProceed}
            className="w-full h-11 text-sm font-semibold bg-zinc-100 text-zinc-950 hover:bg-zinc-200 shadow-md transition-all active:scale-[0.98]"
          >
            <span>Proceed to Luna</span>
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
