"use client";

import { useState, useEffect } from "react";
import { History, X, Trash2, ChevronRight, ArrowLeft, Clock, MessageSquare } from "lucide-react";
import type { HistorySession } from "@/lib/luna/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatClock } from "@/lib/luna/identity";
import { triggerHaptic } from "@/lib/luna/sound";
import { cn } from "@/lib/utils";

function formatRelativeTime(savedAt: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

function formatHoursRemaining(savedAt: number): string {
  const ttlMs = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - savedAt;
  const remainingMs = Math.max(0, ttlMs - elapsed);
  const hours = Math.ceil(remainingMs / (1000 * 60 * 60));
  return `${hours}h left`;
}

export function HistoryModal({
  isOpen,
  onClose,
  sessions,
  onDeleteSession,
  onClearAll,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessions: HistorySession[];
  onDeleteSession: (sessionId: string) => void;
  onClearAll: () => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) setSelectedSessionId(null);
  }

  useEffect(() => {
    if (!isOpen) return;

    const handlePopState = () => {
      if (selectedSessionId) {
        setSelectedSessionId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (selectedSessionId) {
          setSelectedSessionId(null);
          if (typeof window !== "undefined" && window.history.state?.modal === "history_session") {
            window.history.back();
          }
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, selectedSessionId, onClose]);

  if (!isOpen) return null;

  const activeSession = sessions.find((s) => s.sessionId === selectedSessionId) ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl border-t sm:border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden animate-sheet-up sm:animate-none pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0">
        <div className="w-10 h-1 bg-zinc-700/60 rounded-full mx-auto my-2.5 sm:hidden" />
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4 bg-zinc-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeSession ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  triggerHaptic("light");
                  setSelectedSessionId(null);
                  if (typeof window !== "undefined" && window.history.state?.modal === "history_session") {
                    window.history.back();
                  }
                }}
                className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 touch-manipulation cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 shrink-0">
                <History className="h-4 w-4 text-zinc-300" />
              </div>
            )}
            <div className="min-w-0">
              <h2 id="history-modal-title" className="text-sm sm:text-base font-semibold text-zinc-100 truncate">
                {activeSession ? activeSession.peerCallsign : "24-Hour Chat History"}
              </h2>
              <p className="text-[11px] text-zinc-500 font-mono tabular-nums">
                {activeSession
                  ? `${activeSession.messageCount} messages • ${formatHoursRemaining(activeSession.savedAt)}`
                  : "Encrypted device history • Automatically deletes after 24h"}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0 touch-manipulation cursor-pointer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-3">
          {activeSession ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-3 text-center">
                <p className="text-xs font-mono text-zinc-400">
                  Conversation with {activeSession.peerCallsign}
                </p>
                {activeSession.interests.length > 0 && (
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {activeSession.interests.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-zinc-850 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 border border-white/5"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1">
                {activeSession.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex flex-col text-xs", msg.mine ? "items-end" : "items-start")}
                  >
                    <div className="flex items-center gap-1 pb-1 text-[10px] text-zinc-500 font-mono">
                      <span>{msg.mine ? "You" : activeSession.peerCallsign}</span>
                      <span>•</span>
                      <span>{formatClock(new Date(msg.createdAt))}</span>
                    </div>
                    <div
                      className={cn(
                        "rounded-xl px-3 py-2 max-w-[85%] break-words",
                        msg.mine
                          ? "bg-zinc-100 text-zinc-950 font-normal"
                          : "bg-zinc-900 border border-white/10 text-zinc-100",
                      )}
                    >
                      {msg.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
              <MessageSquare className="h-8 w-8 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-400">No chat history</p>
              <p className="text-xs text-zinc-600 max-w-xs">
                Conversations will appear here and automatically erase 24 hours after they finish.
              </p>
            </div>
          ) : (
            sessions.map((item) => (
              <div
                key={item.sessionId}
                className="group relative flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-3.5 transition-all hover:bg-zinc-900 hover:border-white/20 active:scale-[0.99] touch-manipulation"
              >
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setSelectedSessionId(item.sessionId);
                    if (typeof window !== "undefined") {
                      window.history.pushState({ luna: true, modal: "history_session" }, "");
                    }
                  }}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold font-mono text-zinc-100 truncate">
                      {item.peerCallsign}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-mono py-0 px-1.5 bg-zinc-800"
                    >
                      {item.messageCount} msgs
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-1 truncate font-sans">
                    {item.preview || "No message preview"}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    <span>{formatRelativeTime(item.savedAt)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-zinc-300 tabular-nums">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{formatHoursRemaining(item.savedAt)}</span>
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      triggerHaptic("light");
                      onDeleteSession(item.sessionId);
                    }}
                    className="h-8 w-8 text-zinc-500 hover:text-rose-300 hover:bg-rose-950/20 cursor-pointer touch-manipulation active:scale-95"
                    title="Delete this history entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      triggerHaptic("selection");
                      setSelectedSessionId(item.sessionId);
                    }}
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer touch-manipulation active:scale-95"
                    title="Open transcript"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 sm:px-6 sm:py-3.5 bg-zinc-900/30">
          {sessions.length > 0 && !activeSession ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                triggerHaptic("light");
                onClearAll();
              }}
              className="text-xs text-zinc-500 hover:text-red-400 hover:bg-red-950/20 cursor-pointer h-8 px-2.5 touch-manipulation active:scale-[0.98]"
            >
              Clear all history
            </Button>
          ) : (
            <div />
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            className="text-xs border-zinc-800 text-zinc-300 hover:text-white cursor-pointer h-8 px-3.5 touch-manipulation active:scale-[0.98]"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
