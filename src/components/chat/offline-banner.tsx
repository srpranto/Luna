"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, Wifi } from "lucide-react";
import { springTactile } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function OfflineBanner({ isOnline }: { isOnline: boolean }) {
  const [showReconnected, setShowReconnected] = useState(false);
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  const isVisible = !isOnline || showReconnected;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={springTactile}
          role="status"
          aria-live="polite"
          className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 select-none pointer-events-none"
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-xl border transition-colors",
              !isOnline
                ? "bg-zinc-950/95 border-rose-500/30 text-rose-300 shadow-rose-950/30"
                : "bg-zinc-950/95 border-white/20 text-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
            )}
          >
            {!isOnline ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
                <WifiOff className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span>No internet connection. Waiting for network...</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                </span>
                <Wifi className="h-3.5 w-3.5 text-zinc-100 shrink-0" />
                <span>Back online. Reconnected.</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
