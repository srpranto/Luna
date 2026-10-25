"use client";

import {
  useEffect,
  useRef,
  useState,
  Fragment,
  type ReactNode,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { formatClock, formatRemaining } from "@/lib/luna/identity";
import type { ChatMessage } from "@/lib/luna/types";
import { cn } from "@/lib/utils";
import { ArrowRight, Pencil, Trash2, Reply, Lock, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/luna/sound";
import { LinkPreviewCard } from "@/components/luna/link-preview-card";

const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/i;

function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, "");
  const match = withoutInlineCode.match(URL_REGEX);
  return match ? match[0] : null;
}

function renderTextWithLinks(text: string, isMine: boolean): (string | ReactNode)[] {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  const parts: (string | ReactNode)[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic("selection");
        }}
        className={cn(
          "underline underline-offset-4 break-all font-medium transition-colors",
          isMine
            ? "text-zinc-950 underline-offset-4 decoration-zinc-950/40 hover:decoration-zinc-950 font-semibold"
            : "text-zinc-100 underline-offset-4 decoration-white/40 hover:decoration-white font-medium",
        )}
      >
        {url}
      </a>,
    );
    lastIdx = match.index + url.length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length > 0 ? parts : [text];
}

function CodeBlock({
  code,
  language,
  isMine,
}: {
  code: string;
  language?: string;
  isMine?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      triggerHaptic("light");
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={cn(
        "my-2 rounded-xl overflow-hidden border font-mono text-xs select-text shadow-sm text-left bg-zinc-950 text-zinc-100",
        isMine ? "border-zinc-800" : "border-white/10",
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-white/10 text-[10px] text-zinc-400">
        <span className="font-semibold uppercase tracking-wider">{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-zinc-100" />
              <span className="text-zinc-100 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] sm:text-xs leading-relaxed font-mono">
        <code>{code.replace(/\r?\n$/, "")}</code>
      </pre>
    </div>
  );
}

interface ContentBlock {
  type: "code" | "text";
  language?: string;
  code?: string;
  text?: string;
}

function splitIntoBlocks(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      let textChunk = body.slice(lastIndex, match.index);
      if (textChunk.endsWith("\n")) {
        textChunk = textChunk.replace(/\r?\n$/, "");
      }
      if (textChunk.length > 0) {
        blocks.push({
          type: "text",
          text: textChunk,
        });
      }
    }
    blocks.push({
      type: "code",
      language: match[1]?.trim() || "",
      code: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    let textChunk = body.slice(lastIndex);
    if (textChunk.startsWith("\n") || textChunk.startsWith("\r\n")) {
      textChunk = textChunk.replace(/^\r?\n/, "");
    }
    if (textChunk.length > 0) {
      blocks.push({
        type: "text",
        text: textChunk,
      });
    }
  }

  return blocks;
}

function renderFormattedBody(body: string, isMine: boolean) {
  const blocks = splitIntoBlocks(body);

  return blocks.map((block, blockIdx) => {
    if (block.type === "code") {
      return (
        <CodeBlock
          key={`code-${blockIdx}`}
          code={block.code ?? ""}
          language={block.language}
          isMine={isMine}
        />
      );
    }

    const lines = (block.text ?? "").split("\n");

    return lines.map((line, lineIdx) => {
      const isQuote = line.startsWith("> ");
      const content = isQuote ? line.slice(2) : line;

      const parts: (string | ReactNode)[] = [];
      const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          parts.push(...renderTextWithLinks(content.slice(lastIndex, match.index), isMine));
        }
        const token = match[0];
        if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
          parts.push(
            <strong key={`${blockIdx}-${lineIdx}-${match.index}`} className="font-semibold text-inherit">
              {token.slice(2, -2)}
            </strong>,
          );
        } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
          parts.push(
            <em key={`${blockIdx}-${lineIdx}-${match.index}`} className="italic text-inherit">
              {token.slice(1, -1)}
            </em>,
          );
        } else if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
          parts.push(
            <code
              key={`${blockIdx}-${lineIdx}-${match.index}`}
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
          parts.push(...renderTextWithLinks(token, isMine));
        }
        lastIndex = match.index + token.length;
      }

      if (lastIndex < content.length) {
        parts.push(...renderTextWithLinks(content.slice(lastIndex), isMine));
      }

      if (isQuote) {
        const colonIdx = content.indexOf(": ");
        if (colonIdx > 0 && colonIdx < 32) {
          const quoteAuthor = content.slice(0, colonIdx);
          const quoteSnippet = content.slice(colonIdx + 2);
          return (
            <div
              key={`${blockIdx}-${lineIdx}`}
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
            key={`${blockIdx}-${lineIdx}`}
            className={cn(
              "border-l-2 pl-2 my-1 italic text-xs",
              isMine ? "border-zinc-400 text-zinc-700" : "border-zinc-600 text-zinc-400",
            )}
          >
            {parts}
          </blockquote>
        );
      }

      if (lines.length === 1 && blocks.length === 1) {
        return <Fragment key={`${blockIdx}-${lineIdx}`}>{parts.length > 0 ? parts : " "}</Fragment>;
      }

      return (
        <span key={`${blockIdx}-${lineIdx}`} className="block min-h-[1.2em]">
          {parts.length > 0 ? parts : " "}
        </span>
      );
    });
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
  onRetryMessage,
  sessionKind,
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
  onReconnect?: () => void;
  outboundReconnect?: boolean;
  inboundReconnect?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showInterests, setShowInterests] = useState(true);
  const [linkPreviewsEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("luna_link_previews_enabled") !== "false";
    }
    return true;
  });

  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: TouchEvent, msgId: string) {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setSwipingId(msgId);
    setSwipeOffset(0);
  }

  function handleTouchMove(e: TouchEvent, msgId: string) {
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
      triggerHaptic("medium");
      onReply({
        id: msg.id,
        fromCallsign: msg.fromCallsign,
        body: msg.body,
      });
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
    const container = endRef.current?.closest(".overflow-y-auto") as HTMLElement | null;
    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.mine;
    if (container) {
      if (isMine) {
        container.scrollTop = container.scrollHeight;
      } else {
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceToBottom < 160) {
          endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      }
    } else {
      endRef.current?.scrollIntoView({ behavior: isMine ? "auto" : "smooth", block: "end" });
    }
  }, [messages, peerTyping]);

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
      <div className="animate-fade-up mx-auto my-1 w-full max-w-xs sm:max-w-sm rounded-xl border border-white/10 bg-zinc-950/75 p-2.5 sm:p-3 text-center backdrop-blur-md shadow-sm transition-all duration-500">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 font-mono">
          <Lock className="h-3 w-3 text-zinc-100 shrink-0" />
          <span className="font-semibold text-zinc-300">End-to-End Encrypted</span>
          {!showInterests && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">Expires in 24h</span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-200 font-medium">
          You are chatting with a stranger. Say hello!
        </p>
        {showInterests && (
          <p className="mt-0.5 text-[10px] text-zinc-500 transition-opacity">
            Private & ephemeral • Expires automatically after 24 hours
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

      <div className="flex flex-col pt-1">
        {messages.map((msg, idx) => {
          const isMine = msg.mine;
          const isSystem = msg.system;
          const isConsecutive =
            idx > 0 &&
            messages[idx - 1]?.mine === isMine &&
            !messages[idx - 1]?.system;
          const remaining = stamp > 0 ? formatRemaining(msg.expiresAt, stamp) : null;
          const showPeerHeader =
            !isMine &&
            !isSystem &&
            (idx === 0 || messages[idx - 1]?.mine || messages[idx - 1]?.system);

          if (isSystem) {
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className="animate-fade-up flex justify-center my-2"
              >
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
              id={`msg-${msg.id}`}
              className={cn(
                "flex flex-col group transition-opacity duration-150",
                isMine ? "items-end animate-bubble-mine" : "items-start animate-bubble-peer",
                isConsecutive ? "mt-1" : "mt-3",
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
                      onClick={() => {
                        triggerHaptic("light");
                        onReply({ id: msg.id, fromCallsign: msg.fromCallsign, body: msg.body });
                      }}
                      aria-label="Reply to message"
                      title="Reply"
                      className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation active:scale-90"
                    >
                      <Reply className="h-3 w-3" />
                    </button>
                  )}

                  {isMine && !closed && editingId !== msg.id && onEditMessage && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        handleStartEditing(msg.id, msg.body);
                      }}
                      aria-label="Edit message"
                      title="Edit message"
                      className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation active:scale-90"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}

                  {isMine && !closed && editingId !== msg.id && onDeleteMessage && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        void onDeleteMessage(msg.id);
                      }}
                      aria-label="Delete message"
                      title="Delete message"
                      className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer touch-manipulation active:scale-90"
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
                          e.stopPropagation();
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
                      {linkPreviewsEnabled && (() => {
                        const previewUrl = extractFirstUrl(msg.body);
                        if (!previewUrl) return null;
                        return <LinkPreviewCard url={previewUrl} isMine={isMine} />;
                      })()}
                      {msg.status === "failed" && isMine && (
                        <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-rose-500/20 text-[11px] text-rose-500 font-sans">
                          <span>Failed to send</span>
                          {onRetryMessage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic("medium");
                                onRetryMessage(msg.id);
                              }}
                              className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-medium transition-colors cursor-pointer"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      )}
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
                        {isMine && !isSystem && (
                          <span
                            className={cn(
                              "inline-flex items-center text-[10px] select-none transition-colors ml-0.5",
                              msg.status === "failed"
                                ? "text-rose-500 font-bold"
                                : msg.seenAt || msg.status === "seen"
                                  ? "text-zinc-950 font-bold"
                                  : msg.status === "sending"
                                    ? "text-zinc-500 font-normal opacity-70"
                                    : "text-zinc-500 font-medium",
                            )}
                            title={
                              msg.status === "failed"
                                ? "Failed to send"
                                : msg.seenAt || msg.status === "seen"
                                  ? `Seen ${msg.seenAt ? formatClock(new Date(msg.seenAt)) : ""}`
                                  : msg.status === "delivered"
                                    ? "Delivered"
                                    : msg.status === "sending"
                                      ? "Sending..."
                                      : "Sent"
                            }
                          >
                            {msg.status === "failed"
                              ? "!"
                              : (msg.seenAt || msg.status === "seen")
                                ? "✓✓"
                                : "✓"}
                          </span>
                        )}
                      </span>
                    </div>

                    {isSwipingThis && currentOffset < -5 && (
                      <div
                        className="flex items-center justify-center shrink-0 pl-1.5 text-zinc-100 transition-opacity"
                        style={{
                          opacity: Math.min(1, Math.abs(currentOffset) / 35),
                          transform: `scale(${Math.min(1, Math.abs(currentOffset) / 35)})`,
                        }}
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 border border-white/15 text-zinc-100 shadow-md">
                          <Reply className="h-3 w-3" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {msg.id === lastMineMsgId && !closed && (
                <div className="flex items-center justify-end px-1 pt-0.5 text-[10px] font-mono select-none animate-fade-up">
                  <span className={cn("text-[10px] flex items-center gap-1", msg.seenAt ? "text-zinc-100 font-medium" : "text-zinc-400")}>
                    <span>{msg.seenAt ? "Seen" : "Delivered"}</span>
                    <span className={cn("text-[11px] font-bold tracking-tighter", msg.seenAt ? "text-zinc-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" : "text-zinc-400")}>
                      {msg.seenAt ? "✓✓" : "✓"}
                    </span>
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
            <p className="text-xs sm:text-sm font-medium text-zinc-200">
              User is no longer available right now
            </p>
            <p className="text-[11px] text-zinc-400">
              {inboundReconnect
                ? "The stranger has requested to reconnect with you!"
                : outboundReconnect
                  ? "Waiting for stranger to accept reconnect..."
                  : "The stranger disconnected or left the conversation."}
            </p>
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {sessionKind === "stranger" && onReconnect && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      triggerHaptic("medium");
                      onReconnect();
                    }}
                    disabled={outboundReconnect}
                    className={cn(
                      "h-10 px-4 text-xs font-semibold cursor-pointer gap-1.5 touch-manipulation active:scale-[0.97]",
                      inboundReconnect
                        ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
                        : outboundReconnect
                          ? "bg-zinc-800 text-zinc-400 border border-white/10 cursor-not-allowed"
                          : "bg-white text-zinc-950 hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.2)]",
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
                {onNext && (
                  <Button
                    type="button"
                    size="sm"
                    variant={inboundReconnect ? "outline" : "default"}
                    onClick={() => {
                      triggerHaptic("medium");
                      onNext();
                    }}
                    className={cn(
                      "h-10 px-4 text-xs font-semibold cursor-pointer gap-1.5 touch-manipulation active:scale-[0.97]",
                      inboundReconnect
                        ? "border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                        : "bg-white text-zinc-950 hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.2)]",
                    )}
                  >
                    <span>Find Next Stranger</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onLeave && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      triggerHaptic("light");
                      onLeave();
                    }}
                    className="h-10 px-3.5 text-xs border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer touch-manipulation active:scale-[0.97]"
                  >
                    Leave
                  </Button>
                )}
              </div>
              <span className="text-[10px] font-mono text-zinc-500">press Enter ↵ to find someone new</span>
            </div>
          </div>
        )}

        <div role="status" aria-live="polite" className="sr-only">
          {messages.length > 0 && messages[messages.length - 1]?.mine
            ? `Message status: ${messages[messages.length - 1]?.status ?? (messages[messages.length - 1]?.seenAt ? "seen" : "sent")}`
            : ""}
        </div>

        <div ref={endRef} id="transcript-end" />
      </div>
    </div>
  );
}
