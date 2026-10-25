"use client";

import { MAX_LINE_CHARS } from "@/lib/luna/constants";
import { ArrowRight, ArrowUp, Reply, Sparkles, X } from "lucide-react";
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/luna/sound";
import { cn } from "@/lib/utils";

const CELESTIAL_REACTIONS = ["✨", "🌙", "💫", "🤍", "🔥", "🫂"];

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Composer({
  value,
  onChange,
  onSend,
  onTyping,
  onReaction,
  disabled,
  placeholder,
  autoFocus,
  onActivity,
  replyingTo,
  onCancelReply,
  onNext,
  sessionKind,
  onReconnect,
  outboundReconnect,
  inboundReconnect,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onTyping?: (isTyping: boolean) => void;
  onReaction?: (emoji: string) => void;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onActivity?: () => void;
  replyingTo?: { id: string; fromCallsign: string; body: string } | null;
  onCancelReply?: () => void;
  onNext?: () => void;
  sessionKind?: "stranger" | "friend";
  onReconnect?: () => void;
  outboundReconnect?: boolean;
  inboundReconnect?: boolean;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTypingTimer() {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearTypingTimer();
    };
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(200, Math.max(40, el.scrollHeight));
    el.style.height = `${newHeight}px`;
  }, []);

  useIsomorphicLayoutEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  useEffect(() => {
    if (autoFocus && !disabled && textareaRef.current) {
      // Defer focus slightly to ensure layout / animation mounting has completed
      const timer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (disabled) return;
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        const isEditable =
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.getAttribute("contenteditable") === "true");
        if (!isEditable && textareaRef.current) {
          textareaRef.current.focus();
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [disabled]);

  function doSubmit() {
    if (!disabled && value.trim()) {
      clearTypingTimer();
      onTyping?.(false);
      onSend();
      if (textareaRef.current) {
        textareaRef.current.style.height = "40px";
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    doSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      if (showReactions) {
        event.preventDefault();
        event.stopPropagation();
        setShowReactions(false);
        return;
      }
      if (replyingTo) {
        event.preventDefault();
        event.stopPropagation();
        onCancelReply?.();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      if (event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();
      doSubmit();
    }
  }

  function handleChange(text: string) {
    onActivity?.();
    const next = text.slice(0, MAX_LINE_CHARS);
    onChange(next);
    clearTypingTimer();
    if (next.trim().length > 0) {
      onTyping?.(true);
      typingTimerRef.current = setTimeout(() => {
        onTyping?.(false);
      }, 2000);
    } else {
      onTyping?.(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="relative border-t border-white/10 bg-zinc-950/70 py-2.5 sm:py-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 backdrop-blur-md pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      {showReactions && (
        <>
          <div
            className="fixed inset-0 z-30 bg-transparent"
            onClick={() => setShowReactions(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-full right-14 sm:right-24 mb-2.5 flex items-center gap-1 p-1.5 rounded-full border border-white/15 bg-zinc-950/95 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.12)] z-40 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-150">
          <div className="flex items-center gap-1 px-1">
            {CELESTIAL_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={disabled}
                onClick={() => {
                  triggerHaptic("light");
                  onReaction?.(emoji);
                  setShowReactions(false);
                }}
                className="flex h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-full text-base hover:bg-zinc-800/90 active:scale-90 transition-all cursor-pointer hover:scale-110 touch-manipulation"
                title={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setShowReactions(false);
            }}
            className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5 touch-manipulation"
            title="Close reactions"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        </>
      )}

      {replyingTo && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            document
              .getElementById("msg-" + replyingTo.id)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              document
                .getElementById("msg-" + replyingTo.id)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
          aria-label={`Jump to message from ${replyingTo.fromCallsign}`}
          className="flex items-center justify-between gap-2 px-3 py-1.5 mb-2 rounded-xl bg-zinc-900/90 border border-white/10 text-xs text-zinc-300 animate-fade-up cursor-pointer hover:bg-zinc-850/90 transition-colors select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="h-3.5 w-3.5 text-zinc-200 shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-zinc-100">{replyingTo.fromCallsign}</span>
              <span className="text-zinc-500 mx-1.5">•</span>
              <span className="text-zinc-400">{replyingTo.body.replace(/\n/g, " ").slice(0, 50)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancelReply?.();
            }}
            aria-label="Cancel reply"
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-1 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 touch-manipulation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <label className="sr-only" htmlFor="chat-message-input">
        Chat message
      </label>

      {disabled && onNext ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <span className="text-xs text-zinc-400">
            {inboundReconnect
              ? "Stranger wants to reconnect!"
              : outboundReconnect
                ? "Reconnect requested..."
                : "This chat has ended."}
          </span>
          <div className="flex items-center gap-2">
            {sessionKind === "stranger" && onReconnect && (
              <Button
                type="button"
                onClick={onReconnect}
                disabled={outboundReconnect}
                className={cn(
                  "h-10 min-h-[40px] px-4 text-xs font-semibold cursor-pointer gap-2 rounded-full touch-manipulation active:scale-[0.97]",
                  inboundReconnect
                    ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
                    : outboundReconnect
                      ? "bg-zinc-850 text-zinc-400 border border-white/10 cursor-not-allowed"
                      : "border border-white/15 bg-zinc-900 hover:bg-zinc-800 text-zinc-200",
                )}
              >
                <span>
                  {inboundReconnect
                    ? "Accept Reconnect"
                    : outboundReconnect
                      ? "Reconnect Requested..."
                      : "Reconnect"}
                </span>
              </Button>
            )}
            <Button
              type="button"
              onClick={onNext}
              className="h-10 min-h-[40px] px-5 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] rounded-full touch-manipulation"
            >
              <span>Find Next Stranger</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              id="chat-message-input"
              rows={1}
              value={value}
              onChange={(event) => handleChange(event.target.value)}
              onInput={resizeTextarea}
              onKeyDown={onKeyDown}
              disabled={disabled}
              maxLength={MAX_LINE_CHARS}
              placeholder={placeholder}
              autoFocus={autoFocus}
              autoComplete="off"
              autoCorrect="off"
              onFocus={() => {
                onActivity?.();
                if (typeof window !== "undefined") {
                  setTimeout(() => {
                    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }, 180);
                }
              }}
              onClick={() => {
                onActivity?.();
              }}
              onBlur={() => {
                clearTypingTimer();
                onTyping?.(false);
              }}
              className="min-h-[40px] max-h-[200px] h-10 w-full resize-none rounded-full border border-white/10 bg-zinc-900/70 pl-4 pr-12 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all focus:border-white/25 focus:ring-1 focus:ring-white/20 focus:outline-none disabled:opacity-40 leading-6 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
            {value.length > 0 && (
              <span
                className={cn(
                  "absolute right-3.5 bottom-2.5 text-[10px] font-mono pointer-events-none px-1 rounded transition-colors select-none",
                  value.length >= MAX_LINE_CHARS
                    ? "bg-rose-950/80 text-rose-400 font-bold"
                    : value.length > 250
                      ? "bg-amber-950/80 text-amber-400"
                      : "bg-zinc-800/80 text-zinc-400",
                )}
              >
                {value.length}/{MAX_LINE_CHARS}
              </span>
            )}
          </div>

          {onReaction && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowReactions((prev) => !prev)}
              disabled={disabled}
              aria-label="Celestial reactions"
              title="Celestial reactions"
              className={cn(
                "h-10 w-10 min-h-[40px] min-w-[40px] p-0 rounded-full border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 hover:border-white/20 shrink-0 cursor-pointer transition-all duration-150 ease-coloros active:scale-95 touch-manipulation flex items-center justify-center shadow-sm",
                showReactions && "text-zinc-100 bg-zinc-800 border-white/30 ring-1 ring-white/20",
              )}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          )}

          <Button
            type="submit"
            disabled={disabled || !value.trim()}
            size="sm"
            aria-label="Send message"
            title="Send message (Enter, Shift+Enter for new line)"
            className="h-10 min-h-[40px] px-3.5 sm:px-4 w-10 sm:w-auto min-w-[40px] shrink-0 bg-white text-zinc-950 hover:bg-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-white/5 border border-transparent shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-95 transition-all duration-150 ease-coloros rounded-full font-semibold cursor-pointer touch-manipulation flex items-center justify-center gap-1.5"
          >
            <ArrowUp className="h-4 w-4 stroke-[2.5]" />
            <span className="hidden sm:inline text-xs font-semibold">Send</span>
          </Button>
        </div>
      )}
    </form>
  );
}
