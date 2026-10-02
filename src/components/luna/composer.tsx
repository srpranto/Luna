"use client";

import { MAX_LINE_CHARS } from "@/lib/luna/constants";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CELESTIAL_REACTIONS = ["🌙", "✨"];

export function Composer({
  value,
  onChange,
  onSend,
  onTyping,
  onReaction,
  disabled,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onTyping?: (isTyping: boolean) => void;
  onReaction?: (emoji: string) => void;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(130, Math.max(40, el.scrollHeight));
    el.style.height = `${newHeight}px`;
  }, [value]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && value.trim()) {
      onTyping?.(false);
      onSend();
      if (textareaRef.current) {
        textareaRef.current.style.height = "40px";
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) {
        onTyping?.(false);
        onSend();
        if (textareaRef.current) {
          textareaRef.current.style.height = "40px";
        }
      }
    }
  }

  function handleChange(text: string) {
    const next = text.slice(0, MAX_LINE_CHARS);
    onChange(next);
    if (next.trim().length > 0) {
      onTyping?.(true);
    } else {
      onTyping?.(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="relative border-t border-white/10 bg-zinc-950/70 px-3 py-2.5 sm:px-6 sm:py-3 backdrop-blur-md pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      {showReactions && (
        <div className="absolute bottom-full right-14 sm:right-24 mb-2.5 flex items-center gap-1 p-1.5 rounded-full border border-white/15 bg-zinc-950/95 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.12)] z-40 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-150">
          <div className="flex items-center gap-1 px-1">
            {CELESTIAL_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onReaction?.(emoji);
                  setShowReactions(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-zinc-800/90 active:scale-90 transition-all cursor-pointer hover:scale-110"
                title={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => setShowReactions(false)}
            className="h-6 w-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5"
            title="Close reactions"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <label className="sr-only" htmlFor="chat-message-input">
        Chat message
      </label>

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            id="chat-message-input"
            rows={1}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            maxLength={MAX_LINE_CHARS}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            className="min-h-[40px] max-h-[130px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 pl-3.5 pr-14 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none disabled:opacity-40 leading-relaxed overflow-y-auto"
          />
          {value.length > 0 && (
            <span className="absolute right-2.5 bottom-2 text-[10px] font-mono text-zinc-500 pointer-events-none bg-zinc-900/80 px-1 rounded">
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
            className={cn(
              "h-10 w-10 p-0 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 shrink-0 cursor-pointer transition-colors",
              showReactions && "text-indigo-400 bg-zinc-850 ring-1 ring-indigo-500/30",
            )}
            title="Celestial reactions"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        )}

        <Button
          type="submit"
          disabled={disabled || !value.trim()}
          size="sm"
          className="h-10 px-3.5 shrink-0 bg-zinc-100 text-zinc-950 hover:bg-zinc-200 rounded-xl font-medium cursor-pointer"
          title="Send message (Enter, Shift+Enter for new line)"
        >
          <ArrowUp className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </div>
    </form>
  );
}
