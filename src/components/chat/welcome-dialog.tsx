"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ShieldCheck, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoonLogo } from "@/components/chat/moon-logo";
import { triggerHaptic } from "@/lib/sound-effects";
import { springTactile } from "@/lib/motion";

const VISITED_KEY = "luna.has_visited";

export function WelcomeDialog() {
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
    triggerHaptic("medium");
    if (typeof window !== "undefined") {
      localStorage.setItem(VISITED_KEY, "true");
    }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={springTactile}
            className="relative w-full max-w-md rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-white/[0.08] bg-[#0c101a]/95 p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.08)] text-center backdrop-blur-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8"
          >
            <div className="w-10 h-1 bg-zinc-700/60 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-[#101424] shadow-[0_0_35px_rgba(99,130,255,0.2),inset_0_1px_0_0_rgba(255,255,255,0.15)] mb-4 sm:mb-5">
              <MoonLogo className="h-7 w-7 sm:h-8 sm:w-8 text-zinc-100 animate-pulse" glow />
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#121626] px-3 py-1 text-xs font-mono text-zinc-300 mb-3">
              <Sparkles className="h-3 w-3 text-[#8aa2ff]" />
              <span>Welcome to Luna</span>
            </div>

            <h2
              id="welcome-modal-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100"
            >
              Late-night conversations with strangers.
            </h2>

            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              No account needed. Pick a topic, sit down, and speak freely. Walk away whenever
              you&apos;re ready.
            </p>

            <div className="mt-5 rounded-xl border border-white/[0.06] bg-[#090b14]/70 p-3.5 text-xs text-zinc-400 space-y-2 text-left">
              <div className="flex items-center gap-2 text-zinc-300">
                <Lock className="h-3.5 w-3.5 text-[#8aa2ff] shrink-0" />
                <span>End-to-end encrypted in your browser</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <ShieldCheck className="h-3.5 w-3.5 text-[#8aa2ff] shrink-0" />
                <span>Messages disappear permanently when either leaves</span>
              </div>
            </div>

            <div className="mt-6">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleProceed}
                  aria-label="Proceed to Luna"
                  className="w-full h-11 text-sm font-semibold bg-[#6382ff] hover:bg-[#7490ff] text-white shadow-[0_0_20px_rgba(99,130,255,0.35)] transition-colors cursor-pointer touch-manipulation"
                >
                  <span>Proceed to Luna</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
