"use client";

import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Compass, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/sound-effects";
import { MIDNIGHT_FAREWELLS } from "@/lib/constants";
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
          handleCancel();
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
              handleCancel();
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

        {isChat && (
          <div className="mt-4 space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
              Leave a parting thought? (Optional)
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {MIDNIGHT_FAREWELLS.map((farewell) => {
                const isSelected = selectedFarewell === farewell;
                return (
                  <button
                    key={farewell}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      setSelectedFarewell(isSelected ? null : farewell);
                    }}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xl border text-xs text-left transition-all cursor-pointer touch-manipulation active:scale-[0.98]",
                      isSelected
                        ? "border-sky-400/50 bg-sky-950/40 text-sky-200 ring-1 ring-sky-400/30 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                        : "border-white/10 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100",
                    )}
                  >
                    <span>{farewell}</span>
                    {isSelected && <Sparkles className="h-3.5 w-3.5 text-sky-300 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5 flex-wrap">
          <Button
            autoFocus
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              triggerHaptic("tap");
              handleCancel();
            }}
            className="h-9 px-3.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl cursor-pointer touch-manipulation active:scale-[0.96] transition-all"
          >
            {isChat ? "Stay" : "Keep Searching"}
          </Button>

          {isChat && selectedFarewell ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  triggerHaptic("disconnect");
                  handleConfirm();
                }}
                className="h-9 px-3 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-xl cursor-pointer touch-manipulation active:scale-[0.96] transition-all"
              >
                Leave Silently
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  triggerHaptic("disconnect");
                  handleConfirm(selectedFarewell);
                }}
                className="h-9 px-4 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-zinc-950 rounded-xl shadow-[0_0_20px_rgba(14,165,233,0.3)] active:scale-[0.96] transition-all cursor-pointer touch-manipulation"
              >
                Say Goodbye & Leave
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                triggerHaptic("disconnect");
                handleConfirm();
              }}
              className="h-9 px-4 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-[0.96] transition-all cursor-pointer touch-manipulation"
            >
              {isChat ? "Leave Chat" : "Leave Queue"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
