"use client";

import { motion } from "framer-motion";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopicSelector } from "@/components/chat/topic-selector";
import { triggerHaptic } from "@/lib/sound-effects";
import { springSmooth } from "@/lib/motion";
import type { TopicStat } from "@/lib/types";

export function StartScreen({
  interests,
  onInterests,
  onCall,
  busy,
  onlineCount,
  activeQueueTopics,
  activeTopicStats,
}: {
  interests: string[];
  onInterests: (next: string[]) => void;
  onCall: () => void;
  busy: boolean;
  onlineCount?: number;
  activeQueueTopics?: string[];
  activeTopicStats?: TopicStat[];
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 pb-24 sm:pb-10 overflow-y-auto">
      <div className="flex flex-col items-center text-center select-none mb-1">
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-white/[0.08] bg-[#0c101a]/80 backdrop-blur-md mb-3 sm:mb-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </span>
          <span className="text-[11px] font-mono text-zinc-300 tracking-wide uppercase">
            {onlineCount && onlineCount > 0 ? `anonymous • ${onlineCount} online` : "anonymous stranger sanctuary"}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="text-[clamp(2.5rem,6vw,4rem)] font-extrabold tracking-tight text-white drop-shadow-[0_2px_24px_rgba(255,255,255,0.15)] text-balance"
        >
          Luna
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2 max-w-sm text-xs sm:text-sm text-zinc-400 leading-relaxed px-2 font-normal text-pretty"
        >
          A quiet sanctuary for honest conversations under the moon. No login, zero logs, end-to-end encrypted.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 sm:mt-5 w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0c101a]/70 p-4 sm:p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
      >
        <TopicSelector
          value={interests}
          onChange={onInterests}
          onSubmit={onCall}
          activeQueueTopics={activeQueueTopics}
          activeTopicStats={activeTopicStats}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 sm:mt-5 flex flex-col items-center gap-1.5 w-full max-w-xs sm:max-w-none"
      >
        <motion.div
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={springSmooth}
          className="w-full sm:w-auto"
        >
          <Button
            type="button"
            size="lg"
            onClick={() => {
              triggerHaptic("medium");
              onCall();
            }}
            disabled={busy}
            aria-label="Start Text Chat"
            className="h-11 sm:h-12 w-full sm:w-auto px-9 sm:px-11 rounded-full font-semibold text-sm sm:text-base bg-[#f4f3ec] text-[#08090d] hover:bg-white shadow-[0_0_30px_rgba(244,243,236,0.22),0_2px_10px_rgba(0,0,0,0.4)] hover:shadow-[0_0_40px_rgba(255,255,255,0.32)] transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2.5 touch-manipulation"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Start Text Chat</span>
          </Button>
        </motion.div>
        <span className="hidden sm:inline-block text-[10px] font-mono text-zinc-500">
          press Enter ↵
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.28 }}
        className="mt-4 sm:mt-5 flex items-center justify-center gap-2 text-[11px] sm:text-xs text-zinc-400 text-center"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
        <span>End-to-end encrypted • Disappears when you leave</span>
      </motion.div>
    </section>
  );
}
