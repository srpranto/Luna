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

const CELESTIAL_REACTIONS = ["🌙", "✨"];

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

  function doSubmit() {
    if (!disabled && value.trim()) {
      triggerHaptic("medium");
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
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-xs text-zinc-400">
            This chat has ended.
          </span>
          <Button
            type="button"
            onClick={onNext}
            className="h-10 min-h-[44px] sm:min-h-[40px] px-5 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] rounded-xl touch-manipulation"
          >
            <span>Find Next Stranger</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
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
              }}
              onClick={() => {
                onActivity?.();
              }}
              onBlur={() => {
                clearTypingTimer();
                onTyping?.(false);
              }}
              className="min-h-[40px] max-h-[200px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 pl-3.5 pr-14 py-2.5 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-400 shadow-inner transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:outline-none disabled:opacity-40 leading-relaxed overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
            {value.length > 0 && (
              <span
                className={cn(
                  "absolute right-2.5 bottom-2 text-[10px] font-mono pointer-events-none px-1 rounded transition-colors select-none",
                  value.length >= MAX_LINE_CHARS
                    ? "bg-rose-950/80 text-rose-400 font-bold"
                    : value.length > 250
                      ? "bg-amber-950/80 text-amber-400"
                      : "bg-zinc-900/80 text-zinc-400",
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
              size="sm"
              onClick={() => setShowReactions((prev) => !prev)}
              disabled={disabled}
              aria-label="Celestial reactions"
              title="Celestial reactions"
              className={cn(
                "h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] p-0 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 shrink-0 cursor-pointer transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) active:scale-[0.94] touch-manipulation",
                showReactions && "text-zinc-100 bg-zinc-800 ring-1 ring-white/20",
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
            className="h-10 min-h-[44px] sm:min-h-[40px] px-3.5 min-w-[44px] sm:min-w-0 shrink-0 bg-zinc-100 text-zinc-950 hover:bg-white shadow-[0_0_15px_rgba(255,255,255,0.15)] active:scale-[0.94] transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) rounded-xl font-medium cursor-pointer touch-manipulation"
          >
            <ArrowUp className="h-4 w-4" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
      )}
    </form>
  );
}
