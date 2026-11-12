"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Compass, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoonLogo } from "@/components/chat/moon-logo";
import { formatElapsed } from "@/lib/identity";
import { triggerHaptic } from "@/lib/sound-effects";
import { springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface PartingRitualCardProps {
  peerCallsign: string;
  sessionCreatedAt?: string;
  messageCount: number;
  onNext: () => void;
  onLeave: () => void;
  onReconnect?: () => void;
  outboundReconnect?: boolean;
  inboundReconnect?: boolean;
  sessionKind?: "stranger" | "friend";
  busy?: boolean;
}

export function PartingRitualCard({
  peerCallsign,
  sessionCreatedAt,
  messageCount,
  onNext,
  onLeave,
  onReconnect,
  outboundReconnect,
  inboundReconnect,
  sessionKind = "stranger",
  busy = false,
}: PartingRitualCardProps) {
  const [elapsedMs] = useState(() =>
    sessionCreatedAt
      ? Math.max(0, Date.now() - new Date(sessionCreatedAt).getTime())
      : 0,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSmooth}
      className="mx-auto my-3 w-full max-w-sm sm:max-w-md rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-[#0e1428]/90 via-[#0a0f20]/95 to-[#070b18]/98 p-4 sm:p-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-2xl select-none"
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-950/70 border border-indigo-400/25 shadow-sm">
          <MoonLogo className="h-3.5 w-3.5 text-indigo-200" glow />
        </div>
        <span className="text-xs font-mono uppercase tracking-wider text-indigo-300/80 font-semibold">
          Parting Under The Stars
        </span>
      </div>

      <h3 className="text-sm sm:text-base font-semibold text-zinc-100 tracking-tight">
        Your conversation with <span className="font-mono text-indigo-200">{peerCallsign}</span> has ended.
      </h3>

      <div className="mt-2.5 flex items-center justify-center gap-2 text-[11px] font-mono text-zinc-400">
        <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 tabular-nums">
          {formatElapsed(elapsedMs)} together
        </span>
        <span>•</span>
        <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 tabular-nums">
          {messageCount} {messageCount === 1 ? "thought" : "thoughts"} shared
        </span>
      </div>

      <p className="mt-2.5 text-xs text-zinc-400/90 leading-relaxed font-normal">
        {inboundReconnect
          ? `${peerCallsign} wants to reconnect with you!`
          : outboundReconnect
            ? "Reconnect signal sent into the cosmos. Waiting for peer..."
            : "The night continues. Ready to meet another thoughtful stranger?"}
      </p>

      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
        {sessionKind === "stranger" && onReconnect && (
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                triggerHaptic("medium");
                onReconnect();
              }}
              disabled={outboundReconnect || busy}
              className={cn(
                "h-9 w-full sm:w-auto px-4 rounded-full text-xs font-medium cursor-pointer touch-manipulation transition-colors",
                inboundReconnect
                  ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-emerald-400 font-semibold shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse"
                  : "border-indigo-400/25 bg-[#12182c] hover:bg-[#19223e] text-indigo-200",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              <span>
                {inboundReconnect
                  ? "Accept Reconnect"
                  : outboundReconnect
                    ? "Requested..."
                    : "Reconnect"}
              </span>
            </Button>
          </motion.div>
        )}

        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              triggerHaptic("medium");
              onNext();
            }}
            disabled={busy}
            className="h-9 w-full sm:w-auto px-5 rounded-full text-xs font-semibold bg-[#3b5bfd] hover:bg-[#4967ff] text-white border border-blue-400/30 shadow-[0_0_20px_rgba(59,91,253,0.35)] cursor-pointer touch-manipulation flex items-center justify-center gap-1.5 active:scale-[0.97]"
          >
            <span>Find Next Stranger</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </motion.div>

        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="w-full sm:w-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              triggerHaptic("light");
              onLeave();
            }}
            disabled={busy}
            className="h-9 w-full sm:w-auto px-3.5 rounded-full text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] cursor-pointer touch-manipulation active:scale-[0.96]"
          >
            <Compass className="h-3.5 w-3.5 mr-1" />
            <span>Return to Sanctuary</span>
          </Button>
        </motion.div>
      </div>

      <span className="block mt-3 text-[10px] font-mono text-zinc-500">
        press Enter ↵ to find someone new
      </span>
    </motion.div>
  );
}
