"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { formatRemaining } from "@/lib/identity";
import type { ChatMessage } from "@/lib/types";
import { Pencil, Trash2, Reply, Lock, Sparkles, Copy } from "lucide-react";
import { triggerHaptic } from "@/lib/sound-effects";
import { TypingWaveform } from "@/components/chat/typing-waveform";
import { PartingRitualCard } from "@/components/chat/parting-ritual-card";
import { MIDNIGHT_FAREWELLS } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import { MessageRow } from "@/components/chat/message-row";

export function MessageList({
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
  onRetryMessage,
  sessionKind,
  sessionCreatedAt,
  onReconnect,
  outboundReconnect,
  inboundReconnect,
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
  onRetryMessage?: (messageId: string) => void;
  sessionKind?: "stranger" | "friend";
  sessionCreatedAt?: string;
  onReconnect?: () => void;
  outboundReconnect?: boolean;
  inboundReconnect?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [linkPreviewsEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("luna_link_previews_enabled") !== "false";
    }
    return true;
  });

  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Mobile Tap-and-Hold (Long Press) Action Menu State
  const [actionMenuMsg, setActionMenuMsg] = useState<ChatMessage | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);

  const lastNonSystemMsg = [...messages].reverse().find((m) => !m.system);
  const isFarewell = Boolean(
    lastNonSystemMsg &&
    (MIDNIGHT_FAREWELLS as readonly string[]).includes(lastNonSystemMsg.body),
  );

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!actionMenuMsg) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setActionMenuMsg(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionMenuMsg]);

  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      const len = editTextareaRef.current.value.length;
      editTextareaRef.current.setSelectionRange(len, len);
    }
  }, [editingId]);

  const handleStartEditing = useCallback((id: string, currentText: string) => {
    setEditingId(id);
    setEditDraft(currentText);
  }, []);

  const handleCancelEditing = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const handleSubmitEdit = useCallback(async (id: string) => {
    if (!editDraft.trim() || savingEdit || !onEditMessage) return;
    setSavingEdit(true);
    try {
      await onEditMessage(id, editDraft.trim());
      setEditingId(null);
      setEditDraft("");
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, savingEdit, onEditMessage]);

  const handleTouchStart = useCallback((e: TouchEvent, msg: ChatMessage) => {
    if (editingId === msg.id) return;
    const touch = e.touches[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: e.timeStamp,
    };
    isLongPressTriggeredRef.current = false;
    setSwipingId(msg.id);
    setSwipeOffset(0);

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    // 400ms long press threshold calibrated for Android and iOS
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      triggerHaptic("medium");
      setActionMenuMsg(msg);
      setSwipingId(null);
      setSwipeOffset(0);
    }, 400);
  }, [editingId]);

  const handleTouchMove = useCallback((e: TouchEvent, msg: ChatMessage) => {
    if (!touchStartRef.current || swipingId !== msg.id) return;
    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Abort long press if intentional movement (> 15px scroll or swipe)
    if (Math.abs(deltaY) > 15 || Math.abs(deltaX) > 15) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    if (isLongPressTriggeredRef.current) return;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0 && onReply && !closed) {
        // Right to left swipe -> reveals Reply
        const clamped = Math.max(-65, deltaX);
        setSwipeOffset(clamped);
      } else if (deltaX > 0 && msg.mine && onEditMessage && !closed) {
        // Left to right swipe -> reveals Edit message
        const clamped = Math.min(65, deltaX);
        setSwipeOffset(clamped);
      }
    }
  }, [swipingId, onReply, closed, onEditMessage]);

  const handleTouchEnd = useCallback((e: TouchEvent, msg: ChatMessage) => {
    const start = touchStartRef.current;
    const currentOffset = swipingId === msg.id ? swipeOffset : 0;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      setSwipingId(null);
      setSwipeOffset(0);
      touchStartRef.current = null;
      lastTouchTimeRef.current = e.timeStamp;
      return;
    }

    // 1. Right to left swipe release (threshold <= -35px) -> Reply + Auto-open keyboard
    if (currentOffset <= -35 && onReply && !closed) {
      triggerHaptic("medium");
      onReply({
        id: msg.id,
        fromCallsign: msg.fromCallsign,
        body: msg.body,
      });
      document.getElementById("chat-message-input")?.focus();
    }
    // 2. Left to right swipe release (threshold >= 35px) -> Edit message
    else if (currentOffset >= 35 && msg.mine && onEditMessage && !closed) {
      triggerHaptic("medium");
      handleStartEditing(msg.id, msg.body);
    }
    // 3. Tap ("top") detection: short duration with minimal displacement opens action menu
    else if (start && e.timeStamp - start.time < 350 && Math.abs(currentOffset) < 10) {
      triggerHaptic("selection");
      setActionMenuMsg(msg);
      lastTouchTimeRef.current = e.timeStamp;
    }

    setSwipingId(null);
    setSwipeOffset(0);
    touchStartRef.current = null;
  }, [swipingId, swipeOffset, onReply, closed, onEditMessage, handleStartEditing]);

  const handleTouchCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressTriggeredRef.current = false;
    setSwipingId(null);
    setSwipeOffset(0);
    touchStartRef.current = null;
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent, msg: ChatMessage) => {
    e.preventDefault();
    triggerHaptic("medium");
    setActionMenuMsg(msg);
  }, []);

  const handleClick = useCallback((e: MouseEvent, msg: ChatMessage) => {
    // Prevent ghost click on mobile right after touch release
    if (e.timeStamp - lastTouchTimeRef.current < 500) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, textarea, input, pre, code")) return;
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;
    triggerHaptic("selection");
    setActionMenuMsg(msg);
  }, []);

  useEffect(() => {
    const container = endRef.current?.closest(".overflow-y-auto") as HTMLElement | null;
    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.mine;
    if (container) {
      if (isMine) {
        container.scrollTop = container.scrollHeight;
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
        const t = setTimeout(() => {
          container.scrollTop = container.scrollHeight;
          endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 60);
        return () => clearTimeout(t);
      } else {
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceToBottom < 300) {
          endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      }
    } else {
      endRef.current?.scrollIntoView({ behavior: isMine ? "auto" : "smooth", block: "end" });
    }
  }, [messages, peerTyping]);

  const [mountStamp] = useState(() => (now ? now.getTime() : Date.now()));
  const stamp = now ? now.getTime() : mountStamp;

  return (
    <div className="flex flex-1 flex-col justify-end p-3 sm:p-6 space-y-3 sm:space-y-4 select-none">
      <div className="animate-fade-up mx-auto my-1.5 w-full max-w-xs sm:max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-3.5 sm:p-4 text-center backdrop-blur-xl shadow-lg transition-all select-none">
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-400">
          <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="font-semibold text-zinc-200">End-to-End Encrypted</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-500">Ephemeral (24h)</span>
        </div>

        {interests && interests.length > 0 ? (
          <div className="mt-2 text-xs sm:text-[13px] text-zinc-200 leading-relaxed font-normal">
            <span>You&apos;re chatting with a stranger. You both like </span>
            <span className="inline-flex flex-wrap items-center justify-center gap-1 align-baseline my-0.5">
              {interests.map((tag) => {
                const cleanTag = tag.trim().startsWith("#") ? tag.trim().slice(1) : tag.trim();
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 shadow-sm"
                  >
                    #{cleanTag}
                  </span>
                );
              })}
            </span>
            <span>. Say hello!</span>
          </div>
        ) : (
          <p className="mt-1.5 text-xs sm:text-[13px] text-zinc-200 font-normal">
            You&apos;re chatting with a stranger. Say hello!
          </p>
        )}
      </div>

      <div className="flex flex-col pt-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const isMine = Boolean(msg.mine);
            const isSystem = Boolean(msg.system);
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const isSameSender = Boolean(prevMsg && prevMsg.mine === isMine && !prevMsg.system);
            const timeDiff = prevMsg
              ? Math.abs(new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime())
              : 0;
            const isConsecutive = isSameSender && timeDiff < 120000;
            const remaining = stamp > 0 ? formatRemaining(msg.expiresAt, stamp) : null;
            const showPeerHeader =
              !isMine &&
              !isSystem &&
              (!isSameSender || !isConsecutive);

            return (
              <MessageRow
                key={msg.id}
                msg={msg}
                isConsecutive={isConsecutive}
                showPeerHeader={showPeerHeader}
                peerCallsign={peerCallsign}
                isMine={isMine}
                isSystem={isSystem}
                remaining={remaining}
                closed={closed}
                isEditing={editingId === msg.id}
                editDraft={editingId === msg.id ? editDraft : ""}
                savingEdit={savingEdit}
                isSwiping={swipingId === msg.id}
                swipeOffset={swipingId === msg.id ? swipeOffset : 0}
                linkPreviewsEnabled={linkPreviewsEnabled}
                editTextareaRef={editTextareaRef}
                onStartEditing={handleStartEditing}
                onCancelEditing={handleCancelEditing}
                onSubmitEdit={handleSubmitEdit}
                onEditDraftChange={setEditDraft}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                onContextMenu={handleContextMenu}
                onClick={handleClick}
                onReply={onReply}
                onEditMessage={onEditMessage}
                onDeleteMessage={onDeleteMessage}
                onRetryMessage={onRetryMessage}
              />
            );
          })}
        </AnimatePresence>

        <AnimatePresence>
          {peerTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <TypingWaveform variant="bubble" callsign={peerCallsign ?? "Stranger"} />
            </motion.div>
          )}
        </AnimatePresence>

        {closed && isFarewell && lastNonSystemMsg && (
          <div className="animate-fade-up mx-auto my-3 w-full max-w-sm rounded-2xl border border-sky-400/25 bg-gradient-to-b from-sky-950/40 via-zinc-950/80 to-zinc-950 p-4 text-center shadow-[0_8px_32px_rgba(14,165,233,0.12)] backdrop-blur-xl">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 mb-2">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-sky-400 font-medium block">
              Parting Thought • {lastNonSystemMsg.mine ? "You" : peerCallsign || "Stranger"}
            </span>
            <p className="mt-1.5 text-xs sm:text-sm font-medium text-zinc-100 italic">
              &ldquo;{lastNonSystemMsg.body}&rdquo;
            </p>
          </div>
        )}

        {closed && (
          <PartingRitualCard
            peerCallsign={peerCallsign || "Stranger"}
            sessionCreatedAt={sessionCreatedAt}
            messageCount={messages.filter((m) => !m.system).length}
            onNext={onNext || (() => {})}
            onLeave={onLeave || (() => {})}
            onReconnect={onReconnect}
            outboundReconnect={outboundReconnect}
            inboundReconnect={inboundReconnect}
            sessionKind={sessionKind}
          />
        )}

        <div role="status" aria-live="polite" className="sr-only">
          {messages.length > 0 && messages[messages.length - 1]?.mine
            ? `Message status: ${messages[messages.length - 1]?.status ?? (messages[messages.length - 1]?.seenAt ? "seen" : "sent")}`
            : ""}
        </div>

        <div ref={endRef} id="transcript-end" className="h-2 shrink-0" />
      </div>

      {actionMenuMsg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Message actions"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setActionMenuMsg(null)}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" />

          {/* Action Sheet Container */}
          <div
            className="relative w-full sm:max-w-xs bg-zinc-900/95 border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl p-4 sm:p-3 shadow-2xl backdrop-blur-2xl flex flex-col gap-2 z-10 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle for touch users */}
            <div className="mx-auto w-10 h-1 rounded-full bg-zinc-700/60 sm:hidden -mt-1 mb-1" />

            {/* Message preview snippet */}
            <div className="px-2 py-1 text-xs text-zinc-400 font-sans border-b border-white/5 pb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold block mb-0.5">
                {actionMenuMsg.mine ? "Your message" : actionMenuMsg.fromCallsign}
              </span>
              <span className="line-clamp-2 text-zinc-200 font-normal select-none break-words">
                {actionMenuMsg.body}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-1 pt-0.5">
              {actionMenuMsg.mine && !closed && onEditMessage && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    const targetMsg = actionMenuMsg;
                    setActionMenuMsg(null);
                    handleStartEditing(targetMsg.id, targetMsg.body);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-100 hover:bg-white/10 active:bg-white/15 transition-transform duration-100 flex items-center gap-3 cursor-pointer touch-manipulation select-none active:scale-[0.96]"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                    <Pencil className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span>Edit message</span>
                    <span className="text-[10px] text-zinc-400 font-normal">Change text or correct typos</span>
                  </div>
                </button>
              )}

              {actionMenuMsg.mine && !closed && onDeleteMessage && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("medium");
                    const targetId = actionMenuMsg.id;
                    setActionMenuMsg(null);
                    void onDeleteMessage(targetId);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 transition-transform duration-100 flex items-center gap-3 cursor-pointer touch-manipulation select-none active:scale-[0.96]"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span>Delete message</span>
                    <span className="text-[10px] text-rose-400/70 font-normal">Permanently remove for both users</span>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  triggerHaptic("light");
                  try {
                    await navigator.clipboard.writeText(actionMenuMsg.body);
                  } catch {}
                  setActionMenuMsg(null);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/10 active:bg-white/15 transition-all flex items-center gap-3 cursor-pointer touch-manipulation select-none active:scale-[0.98]"
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 shrink-0">
                  <Copy className="h-4 w-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span>Copy text</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Copy message to clipboard</span>
                </div>
              </button>

              {onReply && !closed && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    const target = actionMenuMsg;
                    setActionMenuMsg(null);
                    onReply({
                      id: target.id,
                      fromCallsign: target.fromCallsign,
                      body: target.body,
                    });
                    document.getElementById("chat-message-input")?.focus();
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/10 active:bg-white/15 transition-all flex items-center gap-3 cursor-pointer touch-manipulation select-none active:scale-[0.98]"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 shrink-0">
                    <Reply className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span>Reply to message</span>
                    <span className="text-[10px] text-zinc-500 font-normal">Quote in your response</span>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActionMenuMsg(null)}
                className="w-full min-h-[40px] mt-1 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/5 active:bg-white/10 transition-colors text-center cursor-pointer touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
