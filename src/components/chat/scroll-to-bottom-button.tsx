"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { TypingWaveform } from "@/components/chat/typing-waveform";
import { springTactile } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  unreadCount?: number;
  peerTyping?: boolean;
  peerCallsign?: string;
}

export function ScrollToBottomButton({
  visible,
  onClick,
  unreadCount = 0,
  peerTyping = false,
  peerCallsign,
}: ScrollToBottomButtonProps) {
  const hasUnread = unreadCount > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={springTactile}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30"
        >
          <button
            type="button"
            onClick={onClick}
            aria-label={
              hasUnread
                ? `${unreadCount} new ${unreadCount === 1 ? "message" : "messages"}, scroll to bottom`
                : peerTyping
                  ? `${peerCallsign || "Stranger"} is typing, scroll to bottom`
                  : "Jump to latest messages"
            }
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-xl backdrop-blur-xl transition-colors cursor-pointer touch-manipulation select-none",
              hasUnread
                ? "border-sky-400/40 bg-zinc-950/95 text-sky-200 shadow-[0_8px_24px_rgba(14,165,233,0.25)] hover:bg-zinc-900 ring-1 ring-sky-400/20"
                : peerTyping
                  ? "border-emerald-500/40 bg-zinc-950/95 text-emerald-200 shadow-[0_8px_24px_rgba(16,185,129,0.2)] hover:bg-zinc-900 ring-1 ring-emerald-500/20"
                  : "border-white/15 bg-zinc-950/90 text-zinc-200 hover:bg-zinc-900 shadow-md",
            )}
          >
            {hasUnread ? (
              <>
                <span className="flex h-2 w-2 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                </span>
                <span className="font-semibold tabular-nums text-white">
                  {unreadCount} new {unreadCount === 1 ? "message" : "messages"}
                </span>
                <ArrowDown className="h-3.5 w-3.5 text-sky-300 transition-transform duration-200 group-hover:translate-y-0.5" />
              </>
            ) : peerTyping ? (
              <>
                <TypingWaveform variant="inline" className="shrink-0" />
                <span className="text-zinc-200 font-mono text-[11px] truncate max-w-[140px]">
                  {peerCallsign || "Stranger"} is typing…
                </span>
                <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
              </>
            ) : (
              <>
                <ArrowDown className="h-3.5 w-3.5 text-zinc-100 transition-transform duration-200 group-hover:translate-y-0.5" />
                <span>Jump to latest</span>
              </>
            )}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
