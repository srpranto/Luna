"use client";

import { MAX_LINE_CHARS } from "@/lib/constants";
import { ArrowRight, ArrowUp, Reply, Smile, X } from "lucide-react";
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
import { triggerHaptic } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "@/components/chat/emoji-picker";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function MessageInput({
  value,
  onChange,
  onSend,
  onTyping,
  onReaction: _onReaction,
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
    if (!el.value) {
      el.style.height = "40px";
      return;
    }
    el.style.height = "auto";
    const newHeight = Math.min(200, Math.max(40, el.scrollHeight));
    el.style.height = `${newHeight}px`;
  }, []);

  useIsomorphicLayoutEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      const el = textareaRef.current;
      el.focus({ preventScroll: true });
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
      const t = setTimeout(() => {
        el.focus({ preventScroll: true });
        const end = document.getElementById("transcript-end");
        end?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [replyingTo]);

  useEffect(() => {
    if (autoFocus && !disabled && textareaRef.current) {
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
        // Mobile keyboard preservation: keep focus active so the soft keyboard does not drop!
        textareaRef.current.focus({ preventScroll: true });
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    doSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      if (showEmojiPicker) {
        event.preventDefault();
        event.stopPropagation();
        setShowEmojiPicker(false);
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

  function handleSelectEmoji(emoji: string) {
    onActivity?.();
    const el = textareaRef.current;
    if (!el) {
      const next = (value + emoji).slice(0, MAX_LINE_CHARS);
      onChange(next);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + emoji + value.slice(end)).slice(0, MAX_LINE_CHARS);
    onChange(next);
    const newPos = Math.min(start + emoji.length, next.length);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus({ preventScroll: true });
        textareaRef.current.setSelectionRange(newPos, newPos);
        resizeTextarea();
      }
    }, 0);
  }

  return (
    <form
      onSubmit={submit}
      className="relative border-t border-white/10 bg-zinc-950/70 py-2.5 sm:py-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 backdrop-blur-md pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      {showEmojiPicker && (
        <EmojiPicker
          onSelectEmoji={handleSelectEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
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
          {/* Google Keyboard (Gboard) Emojis Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onPointerDown={(e) => {
              // Crucial for mobile keyboard: prevent default on pointerdown to keep textarea focused!
              e.preventDefault();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              triggerHaptic("light");
              setShowEmojiPicker((prev) => !prev);
            }}
            disabled={disabled}
            aria-label="Google Keyboard emojis"
            title="Google Keyboard emojis"
            className={cn(
              "h-10 w-10 min-h-[40px] min-w-[40px] p-0 rounded-full border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 hover:border-white/20 shrink-0 cursor-pointer transition-all duration-150 ease-coloros active:scale-95 touch-manipulation flex items-center justify-center shadow-sm",
              showEmojiPicker && "text-zinc-100 bg-zinc-800 border-white/30 ring-1 ring-white/20",
            )}
          >
            <Smile className="h-4 w-4" />
          </Button>

          {/* Textarea container with mathematical 40px subpixel base height */}
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
                  if (window.scrollY !== 0) window.scrollTo(0, 0);
                  const end = document.getElementById("transcript-end");
                  end?.scrollIntoView({ behavior: "smooth", block: "end" });
                }
              }}
              onClick={() => {
                onActivity?.();
              }}
              onBlur={() => {
                clearTypingTimer();
                onTyping?.(false);
              }}
              className="min-h-[40px] max-h-[200px] h-10 w-full resize-none rounded-full border border-white/10 bg-zinc-900/70 pl-4 pr-12 py-[9px] text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all focus:border-white/25 focus:ring-1 focus:ring-white/20 focus:outline-none disabled:opacity-40 leading-5 overflow-y-auto box-border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
            {value.length > 0 && (
              <span
                className={cn(
                  "absolute right-3.5 bottom-2.5 text-[10px] font-mono pointer-events-none px-1 rounded transition-colors select-none tabular-nums",
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

          {/* Send Button: perfect 40x40 circle on mobile, pill on desktop, with touch prevention */}
          <Button
            type="submit"
            onPointerDown={(e) => {
              // Crucial: prevent touch/pointer event from stealing focus and closing the mobile virtual keyboard!
              e.preventDefault();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
            }}
            disabled={disabled || !value.trim()}
            size="sm"
            aria-label="Send message"
            title="Send message (Enter, Shift+Enter for new line)"
            className="h-10 min-h-[40px] p-0 sm:px-4 w-10 sm:w-auto min-w-[40px] shrink-0 bg-white text-zinc-950 hover:bg-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-white/5 border border-transparent shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-95 transition-all duration-150 ease-coloros rounded-full font-semibold cursor-pointer touch-manipulation flex items-center justify-center gap-1.5"
          >
            <ArrowUp className="h-4 w-4 stroke-[2.5]" />
            <span className="hidden sm:inline text-xs font-semibold">Send</span>
          </Button>
        </div>
      )}
    </form>
  );
}
