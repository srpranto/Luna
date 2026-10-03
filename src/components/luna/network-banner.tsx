"use client";

import React, { useEffect, useState, useRef } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export function NetworkBanner({ isOnline }: { isOnline: boolean }) {
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
  if (!isVisible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-out select-none pointer-events-none",
        isVisible ? "opacity-100 translate-y-1 scale-100" : "opacity-0 -translate-y-2 scale-95",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-xl border transition-colors",
          !isOnline
            ? "bg-zinc-950/95 border-rose-500/30 text-rose-300 shadow-rose-950/30"
            : "bg-zinc-950/95 border-emerald-500/30 text-emerald-300 shadow-emerald-950/30",
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
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Back online. Reconnected.</span>
          </>
        )}
      </div>
    </div>
  );
}
