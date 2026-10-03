"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatClock, formatRemaining } from "@/lib/luna/identity";
import type { ChatMessage } from "@/lib/luna/types";
import { cn } from "@/lib/utils";
import { ArrowRight, Pencil, Trash2, Reply, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

function renderFormattedBody(body: string, isMine: boolean) {
  const lines = body.split("\n");

  return lines.map((line, lineIdx) => {
    const isQuote = line.startsWith("> ");
    const content = isQuote ? line.slice(2) : line;

    const parts: (string | React.ReactNode)[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
        parts.push(
          <strong key={match.index} className="font-semibold text-inherit">
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
        parts.push(
          <em key={match.index} className="italic text-inherit">
            {token.slice(1, -1)}
          </em>,
        );
      } else if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
        parts.push(
          <code
            key={match.index}
            className={cn(
              "px-1.5 py-0.5 rounded text-[11px] font-mono",
              isMine
                ? "bg-zinc-200 text-zinc-900 border border-zinc-300"
                : "bg-zinc-800 text-zinc-200 border border-white/10",
            )}
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else {
        parts.push(token);
      }
      lastIndex = match.index + token.length;
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    if (isQuote) {
      const colonIdx = content.indexOf(": ");
      if (colonIdx > 0 && colonIdx < 32) {
        const quoteAuthor = content.slice(0, colonIdx);
        const quoteSnippet = content.slice(colonIdx + 2);
        return (
          <div
            key={lineIdx}
            className={cn(
              "rounded-lg border-l-4 px-2.5 py-1.5 mb-2 text-xs select-none",
              isMine
                ? "border-zinc-500 bg-zinc-200/80 text-zinc-800"
                : "border-sky-500 bg-white/5 text-zinc-300",
            )}
          >
            <div
              className={cn(
                "text-[10px] font-semibold tracking-wide uppercase font-mono",
                isMine ? "text-zinc-700" : "text-sky-400",
              )}
            >
              {quoteAuthor}
            </div>
            <div className="line-clamp-2 italic text-[11px] opacity-90 mt-0.5">{quoteSnippet}</div>
          </div>
        );
      }

      return (
        <blockquote
          key={lineIdx}
          className={cn(
            "border-l-2 pl-2 my-1 italic text-xs",
            isMine ? "border-zinc-400 text-zinc-700" : "border-zinc-600 text-zinc-400",
          )}
        >
          {parts}
        </blockquote>
      );
    }

    if (lines.length === 1) {
      return <React.Fragment key={lineIdx}>{parts.length > 0 ? parts : " "}</React.Fragment>;
    }

    return (
      <span key={lineIdx} className="block min-h-[1.2em]">
        {parts.length > 0 ? parts : " "}
      </span>
    );
  });
}

export function Transcript({
  messages,
  now,
  peerCallsign,
  interests = [],
  peerTyping,
  closed,
  onNext,
  onLeave,
  onEditMessage,
  onDeleteMessage,
  onReply,
}: {
  messages: ChatMessage[];
  now?: Date | null;
  peerCallsign?: string;
  interests?: string[];
  peerTyping?: boolean;
  closed?: boolean;
  onNext?: () => void;
  onLeave?: () => void;
  onEditMessage?: (messageId: string, newBody: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReply?: (target: { id: string; fromCallsign: string; body: string }) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showInterests, setShowInterests] = useState(true);

  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent, msgId: string) {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setSwipingId(msgId);
    setSwipeOffset(0);
  }

  function handleTouchMove(e: React.TouchEvent, msgId: string) {
    if (!touchStartRef.current || swipingId !== msgId) return;
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0) {
      const clamped = Math.max(-60, deltaX);
      setSwipeOffset(clamped);
    }
  }

  function handleTouchEnd(msg: ChatMessage) {
    if (swipeOffset <= -35 && onReply && !closed) {
      onReply({
        id: msg.id,
        fromCallsign: msg.fromCallsign,
        body: msg.body,
      });
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(20);
        } catch {}
      }
    }
    setSwipingId(null);
    setSwipeOffset(0);
    touchStartRef.current = null;
  }

  function handleTouchCancel() {
    setSwipingId(null);
    setSwipeOffset(0);
    touchStartRef.current = null;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowInterests(false);
    }, 20000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, peerTyping]);

  const [mountStamp] = useState(() => (now ? now.getTime() : Date.now()));
  const stamp = now ? now.getTime() : mountStamp;
  const lastMineMsgId = [...messages].reverse().find((m) => m.mine && !m.system)?.id;

  function handleStartEditing(id: string, currentText: string) {
    setEditingId(id);
    setEditDraft(currentText);
  }

  function handleCancelEditing() {
    setEditingId(null);
    setEditDraft("");
  }

  async function handleSubmitEdit(id: string) {
    if (!editDraft.trim() || savingEdit || !onEditMessage) return;
    setSavingEdit(true);
    try {
      await onEditMessage(id, editDraft.trim());
      setEditingId(null);
      setEditDraft("");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-end p-3 sm:p-6 space-y-3 sm:space-y-4 select-none">
      <div className="animate-fade-up mx-auto my-1 w-full max-w-xs sm:max-w-sm rounded-xl border border-white/5 bg-zinc-950/60 p-2 sm:p-2.5 text-center backdrop-blur-md shadow-sm transition-all duration-500">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 font-mono">
          <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="font-semibold text-zinc-300">End-to-End Encrypted</span>
          {!showInterests && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">Expires in 24h</span>
            </>
          )}
        </div>
        {showInterests && (
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-zinc-500 transition-opacity">
            Chat is private and automatically expires after 24 hours.
          </p>
        )}
        {showInterests && interests.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5 flex flex-col items-center gap-1.5 transition-all">
            <span className="text-[11px] text-zinc-400 font-medium">
              You both like
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {interests.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-zinc-900 border border-white/10 px-2.5 py-0.5 text-[10px] font-mono text-zinc-300 shadow-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col space-y-2 sm:space-y-2.5 pt-1">
        {messages.map((msg, idx) => {
          const isMine = msg.mine;
          const isSystem = msg.system;
          const remaining = stamp > 0 ? formatRemaining(msg.expiresAt, stamp) : null;
          const showPeerHeader =
            !isMine &&
            !isSystem &&
            (idx === 0 || messages[idx - 1]?.mine || messages[idx - 1]?.system);

          if (isSystem) {
            return (
              <div key={msg.id} className="animate-fade-up flex justify-center my-1.5">
                <span className="rounded-full bg-zinc-900/60 border border-white/10 px-2.5 py-0.5 text-[11px] sm:text-xs text-zinc-400 shadow-sm">
                  {msg.body}
                </span>
              </div>
            );
          }

          const isSwipingThis = swipingId === msg.id;
          const currentOffset = isSwipingThis ? swipeOffset : 0;

          return (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col group transition-opacity duration-150",
                isMine ? "items-end animate-bubble-mine" : "items-start animate-bubble-peer",
              )}
            >
              {showPeerHeader && (
                <span className="text-[10px] font-mono font-medium text-zinc-400 px-1 pb-0.5 select-none">
                  {peerCallsign ?? "Stranger"}
                </span>
              )}

              <div
                className={cn(
                  "flex items-center gap-1.5 max-w-full",
                  isMine ? "justify-end" : "justify-start flex-row-reverse",
                )}
              >
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {onReply && !closed && (
                    <button
                      type="button"
                      onClick={() => onReply({ id: msg.id, fromCallsign: msg.fromCallsign, body: msg.body })}
                      aria-label="Reply to message"
                      title="Reply"
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Reply className="h-3 w-3" />
                    </button>
                  )}

                  {isMine && !closed && editingId !== msg.id && onEditMessage && (
                    <button
                      type="button"
                      onClick={() => handleStartEditing(msg.id, msg.body)}
                      aria-label="Edit message"
                      title="Edit message"
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}

                  {isMine && !closed && editingId !== msg.id && onDeleteMessage && (
                    <button
                      type="button"
                      onClick={() => void onDeleteMessage(msg.id)}
                      aria-label="Delete message"
                      title="Delete message"
                      className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {editingId === msg.id ? (
                  <div className="flex flex-col gap-2 min-w-[220px] sm:min-w-[300px] p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-xl backdrop-blur-xl">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                        <Pencil className="h-2.5 w-2.5" />
                        <span>Edit Message</span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">Esc to cancel</span>
                    </div>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSubmitEdit(msg.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancelEditing();
                        }
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/90 p-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 font-sans resize-none transition-all"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEditing}
                        disabled={savingEdit}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmitEdit(msg.id)}
                        disabled={savingEdit || !editDraft.trim()}
                        className="rounded-lg bg-zinc-100 hover:bg-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-950 shadow-sm disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative inline-flex items-center max-w-[85%] sm:max-w-[70%]">
                    <div
                      onTouchStart={(e) => handleTouchStart(e, msg.id)}
                      onTouchMove={(e) => handleTouchMove(e, msg.id)}
                      onTouchEnd={() => handleTouchEnd(msg)}
                      onTouchCancel={handleTouchCancel}
                      style={{
                        transform: currentOffset !== 0 ? `translateX(${currentOffset}px)` : undefined,
                        transition: isSwipingThis ? "none" : "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
                      }}
                      className={cn(
                        "relative inline-block w-fit rounded-2xl px-3.5 py-2 text-xs sm:text-sm leading-relaxed break-words shadow-sm touch-pan-y",
                        isMine
                          ? "bg-zinc-100 text-zinc-950 rounded-br-xs font-normal"
                          : "bg-zinc-900 border border-white/10 text-zinc-100 rounded-bl-xs",
                      )}
                      title={formatClock(new Date(msg.createdAt))}
                    >
                      <div className="inline">{renderFormattedBody(msg.body, isMine)}</div>
                      <span className="inline-flex items-center gap-1 float-right mt-1.5 ml-2.5 text-[10px] font-mono select-none">
                        <span className="hidden group-hover:inline text-[10px] text-zinc-500 transition-opacity">
                          {formatClock(new Date(msg.createdAt))}
                        </span>
                        {msg.editedAt && (
                          <span className="text-[9px] italic text-zinc-500">
                            edited
                          </span>
                        )}
                        {remaining && (
                          <span className="text-[9px] hidden group-hover:inline text-zinc-500">
                            ({remaining})
                          </span>
                        )}
                      </span>
                    </div>

                    {isSwipingThis && currentOffset < -5 && (
                      <div
                        className="flex items-center justify-center shrink-0 pl-1.5 text-sky-400 transition-opacity"
                        style={{
                          opacity: Math.min(1, Math.abs(currentOffset) / 35),
                          transform: `scale(${Math.min(1, Math.abs(currentOffset) / 35)})`,
                        }}
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 border border-white/10 text-sky-400 shadow-md">
                          <Reply className="h-3 w-3" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {msg.id === lastMineMsgId && !closed && (msg.seenAt || msg.copied) && (
                <div className="flex items-center justify-end px-1 pt-0.5 text-[10px] font-mono select-none animate-fade-up">
                  <span className={cn("text-[10px]", msg.seenAt ? "text-sky-400 font-medium" : "text-zinc-400")}>
                    {msg.seenAt ? "Seen" : "Delivered"}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {peerTyping && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col items-start space-y-1">
            <span className="text-[10px] sm:text-[11px] text-zinc-500 px-1 font-mono">
              {peerCallsign ?? "Stranger"} is typing…
            </span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-xs bg-zinc-900/90 border border-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" />
            </div>
          </div>
        )}

        {closed && (
          <div className="animate-fade-up mx-auto my-3 w-full max-w-sm rounded-xl border border-white/10 bg-zinc-950/90 p-4 text-center shadow-xl backdrop-blur-md space-y-3">
            <p className="text-xs sm:text-sm font-medium text-zinc-300">
              User is no longer available right now
            </p>
            <p className="text-[11px] text-zinc-500">
              The stranger disconnected or left the conversation.
            </p>
            <div className="flex items-center justify-center gap-2 pt-0.5">
              {onNext && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onNext}
                  className="h-8 px-4 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer gap-1.5 shadow-[0_0_15px_rgba(255,255,255,0.18)]"
                >
                  <span>Search for someone</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {onLeave && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onLeave}
                  className="h-8 px-3 text-xs border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
                >
                  Leave
                </Button>
              )}
            </div>
          </div>
        )}

        <div ref={endRef} id="transcript-end" />
      </div>
    </div>
  );
}
