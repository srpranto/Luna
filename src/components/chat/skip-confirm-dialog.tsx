"use client";

import { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FastForward, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/sound-effects";
import { modalBackdropVariants, modalContainerVariants } from "@/lib/motion";

export interface SkipConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SkipConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
}: SkipConfirmDialogProps) {
  const handleCancel = useCallback(() => {
    triggerHaptic("tap");
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    triggerHaptic("medium");
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={modalBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-dialog-title"
          aria-describedby="skip-dialog-desc"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancel();
            }
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            variants={modalContainerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border-t sm:border border-white/15 bg-zinc-950 p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-left backdrop-blur-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6"
          >
            {/* Mobile swipe grab handle */}
            <div className="w-10 h-1 bg-zinc-700/60 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 shadow-inner">
                  <FastForward className="h-4 w-4" />
                </div>
                <h2
                  id="skip-dialog-title"
                  className="text-sm font-semibold tracking-tight text-zinc-100"
                >
                  Skip conversation?
                </h2>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={handleCancel}
                aria-label="Close skip confirmation"
                className="rounded-full p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <p
              id="skip-dialog-desc"
              className="mt-3 text-xs leading-relaxed text-zinc-400"
            >
              You are chatting with someone right now. Swiping will leave this stranger and immediately search for the next person.
            </p>

            <div className="mt-5 flex gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="flex-1 rounded-xl border-white/10 bg-zinc-900/60 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 text-xs h-9 cursor-pointer active:scale-[0.97] transition-all"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1 text-zinc-400" />
                Keep Chatting
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-semibold text-xs h-9 shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer active:scale-[0.97] transition-all"
              >
                <FastForward className="h-3.5 w-3.5 mr-1" />
                Skip to Next
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
