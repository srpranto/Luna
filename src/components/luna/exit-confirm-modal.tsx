"use client";

import { useEffect } from "react";
import { DoorOpen, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/luna/sound";

interface ExitConfirmModalProps {
  isOpen: boolean;
  type: "chat" | "queue";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExitConfirmModal({
  isOpen,
  type,
  onConfirm,
  onCancel,
}: ExitConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isChat = type === "chat";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      aria-describedby="exit-modal-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          triggerHaptic("tap");
          onCancel();
        }
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border-t sm:border border-white/15 bg-zinc-950 p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-left backdrop-blur-2xl animate-sheet-up sm:animate-scale-in pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6"
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
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              onCancel();
            }}
            aria-label="Close dialog"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p id="exit-modal-desc" className="mt-3 text-xs text-zinc-400 leading-relaxed">
          {isChat
            ? "Your encrypted session with this stranger will end immediately and the temporary conversation transcript will be permanently discarded."
            : "You will stop searching and be removed from the midnight matchmaking queue."}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button
            autoFocus
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              triggerHaptic("tap");
              onCancel();
            }}
            className="h-9 px-4 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl cursor-pointer touch-manipulation"
          >
            {isChat ? "Stay in Chat" : "Keep Searching"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              triggerHaptic("disconnect");
              onConfirm();
            }}
            className="h-9 px-4 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-[0.96] transition-all cursor-pointer touch-manipulation"
          >
            {isChat ? "Leave Chat" : "Leave Queue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
