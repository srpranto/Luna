"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  subscribeToToastNotifications,
  type ToastNotification,
} from "@/lib/notifications";
import { Sparkles, MessageSquare, HeartHandshake, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/sound-effects";
import { springTactile } from "@/lib/motion";

export function NotificationToastHost() {
  const [activeToast, setActiveToast] = useState<ToastNotification | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToToastNotifications((toast) => {
      // Friend requests are directly presented via the interactive Accept/Decline card in ChatScreen;
      // also don't pop in-app toast for messages when the window is focused.
      if (toast.type === "friend" || (!document.hidden && document.hasFocus() && toast.type === "message")) {
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

  const Icon =
    activeToast?.type === "match"
      ? Sparkles
      : activeToast?.type === "friend"
        ? HeartHandshake
        : activeToast?.type === "message"
          ? MessageSquare
          : Bell;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={springTactile}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            role="alert"
            onClick={() => {
              activeToast.onAction?.();
              setActiveToast(null);
            }}
            className={cn(
              "w-full max-w-sm pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-3xl border border-white/20 bg-zinc-950/95 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.15)] cursor-pointer select-none",
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
                triggerHaptic("light");
                setActiveToast(null);
              }}
              aria-label="Dismiss notification"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-all active:scale-[0.96]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
