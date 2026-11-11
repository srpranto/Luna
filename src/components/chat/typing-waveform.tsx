"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TypingWaveformProps {
  /** "inline" fits status headers and mobile island capsules; "bubble" renders in message transcript */
  variant?: "inline" | "bubble";
  callsign?: string;
  className?: string;
}

export function TypingWaveform({
  variant = "inline",
  callsign = "Stranger",
  className,
}: TypingWaveformProps) {
  if (variant === "inline") {
    return (
      <div className={cn("inline-flex items-center gap-1.5", className)}>
        <span className="text-[10px] font-mono text-emerald-400 font-medium tracking-tight leading-none">
          typing
        </span>
        <div className="flex items-center gap-0.75">
          {[0, 0.15, 0.3].map((delay, idx) => (
            <motion.span
              key={idx}
              animate={{
                y: [0, -3, 0],
                opacity: [0.35, 1, 0.35],
                scale: [0.8, 1.15, 0.8],
              }}
              transition={{
                duration: 0.75,
                repeat: Infinity,
                ease: "easeInOut",
                delay,
              }}
              className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-start space-y-1.5 my-1.5", className)}>
      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-zinc-400 px-1 font-mono">
        <span className="font-semibold text-zinc-200">{callsign}</span>
        <span className="text-zinc-500">is writing</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-xs bg-[#0e121d]/90 border border-white/10 px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md">
        {[0, 0.15, 0.3].map((delay, idx) => (
          <motion.span
            key={idx}
            animate={{
              y: [0, -4, 0],
              opacity: [0.35, 1, 0.35],
              scale: [0.8, 1.15, 0.8],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }}
            className="h-2 w-2 rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.65)]"
          />
        ))}
      </div>
    </div>
  );
}
