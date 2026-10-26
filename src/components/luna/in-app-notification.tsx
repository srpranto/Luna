"use client";

import { useEffect, useState } from "react";
import {
  subscribeToLunaToasts,
  type LunaToastNotification,
} from "@/lib/luna/notifications";
import { Sparkles, MessageSquare, HeartHandshake, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/luna/sound";

export function InAppNotificationHost() {
  const [activeToast, setActiveToast] = useState<LunaToastNotification | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLunaToasts((toast) => {
      // Don't pop in-app toast if user is already actively chatting inside the focused window unless it's a friend request
      if (!document.hidden && document.hasFocus() && toast.type === "message") {
        return;
      }
      setActiveToast(toast);
      triggerHaptic("light");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [activeToast]);

  if (!activeToast) return null;

  const Icon =
    activeToast.type === "match"
      ? Sparkles
      : activeToast.type === "friend"
        ? HeartHandshake
        : activeToast.type === "message"
          ? MessageSquare
          : Bell;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-sm pointer-events-auto animate-water-drop">
      <div
        role="alert"
        onClick={() => {
          activeToast.onAction?.();
          setActiveToast(null);
        }}
        className={cn(
          "flex items-center justify-between gap-3 p-3 rounded-2xl border border-white/20 bg-zinc-950/95 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.15)] cursor-pointer transition-transform active:scale-[0.98]",
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-white/15 text-cyan-300">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              {activeToast.title}
            </p>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              {activeToast.message}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveToast(null);
          }}
          aria-label="Dismiss notification"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
