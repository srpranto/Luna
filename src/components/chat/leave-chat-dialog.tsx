"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DoorOpen, Compass, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/sound-effects";
import { MIDNIGHT_FAREWELLS } from "@/lib/constants";
import { springTactile } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface LeaveChatDialogProps {
  isOpen: boolean;
  type: "chat" | "queue";
  onConfirm: (farewell?: string) => void;
  onCancel: () => void;
}

export function LeaveChatDialog({
  isOpen,
  type,
  onConfirm,
  onCancel,
}: LeaveChatDialogProps) {
  const [selectedFarewell, setSelectedFarewell] = useState<string | null>(null);

  const handleCancel = useCallback(() => {
    setSelectedFarewell(null);
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback((farewell?: string) => {
    setSelectedFarewell(null);
    onConfirm(farewell);
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

  const isChat = type === "chat";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-modal-title"
          aria-describedby="exit-modal-desc"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              triggerHaptic("tap");
              handleCancel();
            }
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={springTactile}
            className="w-full max-w-sm rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-white/[0.08] bg-[#0c101a]/95 p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.08)] text-left backdrop-blur-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6"
          >
            <div className="w-10 h-1 bg-zinc-700/60 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-zinc-900 shadow-inner">
                  {isChat ? (
                    <DoorOpen className="h-4 w-4 text-zinc-100" />
                  ) : (
                    <Compass className="h-4 w-4 text-zinc-100 animate-spin [animation-duration:8s]" />
                  )}
                </div>
                <h2 id="exit-modal-title" className="text-sm font-semibold tracking-tight text-zinc-100">
                  {isChat ? "Leave conversation?" : "Cancel search?"}
                </h2>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  handleCancel();
                }}
                aria-label="Close dialog"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <p id="exit-modal-desc" className="mt-3 text-xs text-zinc-400 leading-relaxed">
              {isChat
                ? "Your encrypted session with this stranger will end immediately and the temporary conversation transcript will be permanently discarded."
                : "You will stop searching and be removed from the midnight matchmaking queue."}
            </p>

            {isChat && (
              <div className="mt-4 space-y-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
                  Leave a parting thought? (Optional)
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {MIDNIGHT_FAREWELLS.map((farewell) => {
                    const isSelected = selectedFarewell === farewell;
                    return (
                      <motion.button
                        key={farewell}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          setSelectedFarewell(isSelected ? null : farewell);
                        }}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-xl border text-xs text-left transition-colors cursor-pointer touch-manipulation",
                          isSelected
                            ? "border-sky-400/50 bg-sky-950/40 text-sky-200 ring-1 ring-sky-400/30 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                            : "border-white/10 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100",
                        )}
                      >
                        <span>{farewell}</span>
                        {isSelected && <Sparkles className="h-3.5 w-3.5 text-sky-300 shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5 flex-wrap">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                <Button
                  autoFocus
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    triggerHaptic("tap");
                    handleCancel();
                  }}
                  className="h-9 px-3.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl cursor-pointer touch-manipulation transition-colors"
                >
                  {isChat ? "Stay" : "Keep Searching"}
                </Button>
              </motion.div>

              {isChat && selectedFarewell ? (
                <>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        triggerHaptic("disconnect");
                        handleConfirm();
                      }}
                      className="h-9 px-3 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-xl cursor-pointer touch-manipulation transition-colors"
                    >
                      Leave Silently
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        triggerHaptic("disconnect");
                        handleConfirm(selectedFarewell);
                      }}
                      className="h-9 px-4 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-zinc-950 rounded-xl shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-colors cursor-pointer touch-manipulation"
                    >
                      Say Goodbye & Leave
                    </Button>
                  </motion.div>
                </>
              ) : (
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      triggerHaptic("disconnect");
                      handleConfirm();
                    }}
                    className="h-9 px-4 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-colors cursor-pointer touch-manipulation"
                  >
                    {isChat ? "Leave Chat" : "Leave Queue"}
                  </Button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
