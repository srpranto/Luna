"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { RotateCcw, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarFieldCanvas } from "@/components/chat/star-field-canvas";
import { StrangerAvatar } from "@/components/chat/stranger-avatar";
import { MoonLogo } from "@/components/chat/moon-logo";
import { formatElapsed } from "@/lib/identity";
import { triggerHaptic } from "@/lib/sound-effects";
import { springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";

const MIDNIGHT_CONTEMPLATIONS = [
  "Traversing the midnight cosmos… Connecting you as soon as someone arrives.",
  "The quietest conversations often find us when we least expect them.",
  "Searching nocturnal frequencies under the stars…",
  "Patience in the dark — waiting for another night owl to arrive.",
  "Honest conversations take a quiet moment to align.",
];

export function SearchingScreen({
  enteredAt,
  interests,
  onStop,
  onAddPopular,
  onRestartSearch,
  onBroadenSearch,
  busy,
}: {
  enteredAt: string | null;
  interests: string[];
  onStop: () => void;
  onAddPopular: () => void;
  onRestartSearch?: () => void;
  onBroadenSearch?: () => void;
  busy: boolean;
}) {
  const localStartRef = useRef<number | null>(null);
  const [waitMs, setWaitMs] = useState(0);

  useEffect(() => {
    if (localStartRef.current === null) {
      localStartRef.current = Date.now();
    }

    const calcElapsed = () => {
      const now = Date.now();
      const serverStart = enteredAt ? new Date(enteredAt).getTime() : NaN;
      const start = localStartRef.current ?? now;
      const effectiveStart =
        Number.isFinite(serverStart) && serverStart <= now
          ? Math.min(serverStart, start)
          : start;
      return Math.max(0, now - effectiveStart);
    };

    setWaitMs(calcElapsed());
    const timer = window.setInterval(() => {
      setWaitMs(calcElapsed());
    }, 250);

    return () => window.clearInterval(timer);
  }, [enteredAt]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onStop();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onStop]);

  const isTimeout = waitMs >= 120000;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 text-center overflow-hidden">
      <StarFieldCanvas
        speed={isTimeout ? 1.0 : waitMs > 15000 ? 3.5 : 2.2}
        className="absolute inset-0 pointer-events-none opacity-80"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSmooth}
        className="relative z-10 flex items-center justify-center w-44 h-44 sm:w-64 sm:h-64 my-3 sm:my-5"
      >
        <motion.div
          animate={isTimeout ? { opacity: 0.25 } : { scale: [1, 1.38, 1], opacity: [0.4, 0.08, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full border border-[#6382ff]/30 bg-[#6382ff]/[0.02]"
        />
        <motion.div
          animate={isTimeout ? { opacity: 0.15 } : { scale: [1, 1.6, 1], opacity: [0.25, 0.03, 0.25] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute inset-0 rounded-full border border-white/[0.08] bg-white/[0.01]"
        />
        <motion.div
          animate={isTimeout ? {} : { scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="relative flex h-20 w-20 sm:h-28 sm:w-28 items-center justify-center rounded-full border border-white/[0.18] bg-[#0c101a]/95 shadow-[0_0_60px_rgba(99,130,255,0.25),inset_0_1px_0_0_rgba(255,255,255,0.2)] backdrop-blur-xl overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          <MoonLogo className={cn("h-8 w-8 sm:h-10 sm:w-10 text-zinc-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.7)]", isTimeout ? "opacity-80" : "animate-pulse")} glow />
        </motion.div>
      </motion.div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm sm:max-w-md px-4 text-center">
        <p className="animate-fade-up stagger-1 text-base sm:text-lg font-medium text-zinc-100 tracking-tight">
          {isTimeout ? "No strangers online right now" : "Listening across the midnight void..."}
        </p>

        <div className="animate-fade-up stagger-2 mt-2.5 inline-flex items-center gap-2 rounded-full bg-[#0d101a]/90 border border-white/[0.1] px-3.5 py-1 text-xs font-mono text-zinc-300 shadow-inner tabular-nums backdrop-blur-md">
          <span className={cn("h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]", isTimeout ? "opacity-60" : "animate-ping")} />
          <span>{isTimeout ? "02:00 • 2 min reached" : formatElapsed(waitMs)}</span>
        </div>

        <p className="animate-fade-up stagger-3 mt-2 text-xs text-zinc-400">
          {isTimeout
            ? (interests.length > 0
                ? `Searched for 2 minutes with #${interests.join(", #")}. Nobody with matching topics is online at this quiet hour.`
                : "Searched for 2 minutes. The midnight cosmos is still quiet right now.")
            : (waitMs < 5000 && interests.length > 0
                ? `Focusing telescope on #${interests.join(", #")}...`
                : waitMs < 15000 && interests.length > 0
                  ? "Expanding search horizon across all late-night stations..."
                  : "Traversing the cosmos for matching night owls...")}
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

        {!isTimeout && waitMs >= 5000 && interests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-[10px] sm:text-[11px] font-mono text-cyan-300 shadow-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Horizon broadened to all night owls</span>
          </motion.div>
        )}

        {!isTimeout && waitMs >= 8000 && waitMs < 60000 && (
          <div className="animate-fade-up stagger-4 mt-3.5 max-w-xs sm:max-w-sm rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs text-zinc-400 text-center leading-relaxed backdrop-blur-sm">
            <span>{MIDNIGHT_CONTEMPLATIONS[Math.floor(waitMs / 10000) % MIDNIGHT_CONTEMPLATIONS.length]}</span>
          </div>
        )}

        {isTimeout ? (
          <div className="mt-6 sm:mt-8 flex flex-col items-center gap-2.5 w-full sm:w-auto">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
              <Button
                type="button"
                onClick={() => {
                  triggerHaptic("medium");
                  localStartRef.current = Date.now();
                  setWaitMs(0);
                  onRestartSearch?.();
                }}
                disabled={busy}
                aria-label="Keep Searching"
                className="h-10 px-7 w-full sm:w-auto rounded-full font-semibold text-xs sm:text-sm bg-white text-zinc-950 hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-colors cursor-pointer flex items-center justify-center gap-2 touch-manipulation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Keep Searching (2 min)</span>
              </Button>
            </motion.div>

            {interests.length > 0 && onBroadenSearch && (
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    triggerHaptic("light");
                    localStartRef.current = Date.now();
                    setWaitMs(0);
                    onBroadenSearch();
                  }}
                  disabled={busy}
                  aria-label="Search All Strangers"
                  className="h-9 px-5 w-full sm:w-auto rounded-full text-xs border-white/15 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 transition-colors cursor-pointer flex items-center justify-center gap-2 touch-manipulation"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Search All Strangers (Broaden)</span>
                </Button>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  triggerHaptic("light");
                  onStop();
                }}
                disabled={busy}
                aria-label="Change topics and leave queue"
                className="h-8 px-4 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 cursor-pointer"
              >
                <span>Change Topics / Return</span>
              </Button>
            </motion.div>
          </div>
        ) : (
          <div className="mt-6 sm:mt-8 flex flex-col items-center gap-2 w-full sm:w-auto">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  triggerHaptic("light");
                  onStop();
                }}
                disabled={busy}
                aria-label="Leave the queue"
                className="h-10 px-7 w-full sm:w-auto rounded-full border-white/[0.12] text-zinc-300 hover:text-white bg-[#0d101a]/90 hover:bg-[#131726] shadow-sm backdrop-blur-md text-xs sm:text-sm cursor-pointer touch-manipulation transition-all"
              >
                Leave the queue
              </Button>
            </motion.div>
            <span className="hidden sm:inline-block text-[11px] font-mono text-zinc-500">
              press Esc to cancel
            </span>
          </div>
        )}
      </div>

      {!isTimeout && waitMs >= 60000 && (
        <StrangerAvatar
          onAddPopular={onAddPopular}
          onChangeInterests={onStop}
        />
      )}
    </section>
  );
}
