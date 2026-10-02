"use client";

import { useState } from "react";
import { History, X, Trash2, ChevronRight, ArrowLeft, Clock, MessageSquare } from "lucide-react";
import type { HistorySession } from "@/lib/luna/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatClock } from "@/lib/luna/identity";
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

  if (!isOpen) return null;

  const activeSession = sessions.find((s) => s.sessionId === selectedSessionId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-up">
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4 bg-zinc-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeSession ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedSessionId(null)}
                className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 shrink-0">
                <History className="h-4 w-4 text-zinc-300" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-zinc-100 truncate">
                {activeSession ? activeSession.peerCallsign : "24-Hour Chat History"}
              </h2>
              <p className="text-[11px] text-zinc-500 font-mono">
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
            onClick={onClose}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0"
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
                className="group relative flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-3.5 transition-all hover:bg-zinc-900 hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(item.sessionId)}
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
                    <span className="flex items-center gap-1 text-amber-400/90">
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
                    onClick={() => onDeleteSession(item.sessionId)}
                    className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 cursor-pointer"
                    title="Delete this history entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedSessionId(item.sessionId)}
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
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
              onClick={onClearAll}
              className="text-xs text-zinc-500 hover:text-red-400 hover:bg-red-950/20 cursor-pointer h-8 px-2.5"
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
            onClick={onClose}
            className="text-xs border-zinc-800 text-zinc-300 hover:text-white cursor-pointer h-8 px-3.5"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
