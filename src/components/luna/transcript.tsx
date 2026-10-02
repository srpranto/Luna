"use client";

import React, { useEffect, useRef } from "react";
import { formatClock, formatRemaining } from "@/lib/luna/identity";
import type { ChatMessage } from "@/lib/luna/types";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, ArrowRight } from "lucide-react";
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
                ? "bg-zinc-200 text-zinc-900"
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
      return (
        <blockquote
          key={lineIdx}
          className={cn(
            "border-l-2 pl-2 my-1 italic text-xs",
            isMine ? "border-zinc-400 text-zinc-700" : "border-zinc-500 text-zinc-400",
          )}
        >
          {parts}
        </blockquote>
      );
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
  flutter,
  drifting,
  reconnectRemainingSeconds,
  closed,
  onNext,
  onLeave,
}: {
  messages: ChatMessage[];
  now: Date | null;
  peerCallsign?: string;
  interests?: string[];
  peerTyping?: boolean;
  flutter?: boolean;
  drifting?: boolean;
  reconnectRemainingSeconds?: number;
  closed?: boolean;
  onNext?: () => void;
  onLeave?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, peerTyping]);

  const stamp = now ? now.getTime() : 0;

  return (
    <div className="flex flex-1 flex-col justify-end p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="animate-fade-up mx-auto my-1 w-full max-w-xs sm:max-w-sm rounded-lg border border-white/5 bg-zinc-950/50 p-2 sm:p-2.5 text-center backdrop-blur-md">
        <p className="text-[10px] sm:text-[11px] text-zinc-500">
          Messages disappear when either of you leaves.
        </p>
        {interests.length > 0 && (
          <div className="animate-fade-up stagger-1 mt-1.5 flex flex-wrap items-center justify-center gap-1">
            {interests.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-zinc-900 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="animate-fade-up stagger-2 mx-auto my-0.5 flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Connected with {peerCallsign ?? "Stranger"} • Say hello</span>
      </div>

      {drifting ? (
        <div className="animate-fade-up rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs text-center py-2.5 px-4 mx-auto font-mono flex items-center justify-center gap-2.5 shadow-lg backdrop-blur-md max-w-sm">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span>
            Signal drifting into the void… waiting for reconnect ({reconnectRemainingSeconds ?? 30}
            s)
          </span>
        </div>
      ) : flutter ? (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center py-1.5 px-3 mx-auto font-mono">
          Connection is flickering…
        </div>
      ) : null}

      <div className="flex flex-col space-y-2.5 sm:space-y-3 pt-1">
        {messages.map((msg) => {
          const isMine = msg.mine;
          const isSystem = msg.system;
          const remaining = stamp > 0 ? formatRemaining(msg.expiresAt, stamp) : null;

          if (isSystem) {
            return (
              <div key={msg.id} className="animate-fade-up flex justify-center my-1.5">
                <span className="rounded-full bg-zinc-900/60 border border-white/10 px-2.5 py-0.5 text-[11px] sm:text-xs text-zinc-400 shadow-sm">
                  {msg.body}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col group transition-opacity duration-150",
                isMine ? "items-end animate-bubble-mine" : "items-start animate-bubble-peer",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-1.5 px-1 pb-1 text-[10px] sm:text-[11px] text-zinc-500 font-mono",
                  isMine ? "flex-row-reverse" : "flex-row",
                )}
              >
                <span className={cn("font-medium", isMine ? "text-zinc-300" : "text-zinc-400")}>
                  {isMine ? "You" : peerCallsign ? peerCallsign : "Stranger"}
                </span>
                <span>•</span>
                <span>{formatClock(new Date(msg.createdAt))}</span>
                {remaining && (
                  <span className="text-[10px] text-zinc-500 hidden group-hover:inline">
                    (fades in {remaining})
                  </span>
                )}
              </div>

              <div
                className={cn(
                  "relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm leading-relaxed break-words shadow-sm",
                  isMine
                    ? "bg-zinc-100 text-zinc-950 rounded-tr-xs font-normal"
                    : "bg-zinc-900/90 border border-white/10 text-zinc-100 rounded-tl-xs",
                )}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {renderFormattedBody(msg.body, isMine)}
                </div>
                {isMine && (
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-600">
                    {msg.copied ? (
                      <CheckCheck className="h-3 w-3" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {peerTyping && (
          <div className="animate-message-glide flex flex-col items-start space-y-1">
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
              The stranger has left the chat
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
