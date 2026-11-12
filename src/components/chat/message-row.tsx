"use client";

import { memo, type MouseEvent, type TouchEvent, type RefObject } from "react";
import { motion } from "framer-motion";
import { Pencil, Trash2, Reply } from "lucide-react";
import { formatClock } from "@/lib/identity";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/sound-effects";
import { springBubble } from "@/lib/motion";
import { LinkPreviewCard } from "@/components/chat/link-preview-card";
import { DeliveryCheckmark } from "@/components/chat/delivery-checkmark";
import { MessageBody, extractFirstUrl } from "@/components/chat/markdown-renderer";

export interface MessageRowProps {
  msg: ChatMessage;
  isConsecutive: boolean;
  showPeerHeader: boolean;
  peerCallsign?: string;
  isMine: boolean;
  isSystem: boolean;
  remaining: string | null;
  closed?: boolean;
  isEditing: boolean;
  editDraft: string;
  savingEdit: boolean;
  isSwiping: boolean;
  swipeOffset: number;
  linkPreviewsEnabled: boolean;
  editTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onStartEditing: (id: string, text: string) => void;
  onCancelEditing: () => void;
  onSubmitEdit: (id: string) => void;
  onEditDraftChange: (text: string) => void;
  onTouchStart: (e: TouchEvent, msg: ChatMessage) => void;
  onTouchMove: (e: TouchEvent, msg: ChatMessage) => void;
  onTouchEnd: (e: TouchEvent, msg: ChatMessage) => void;
  onTouchCancel: () => void;
  onContextMenu: (e: MouseEvent, msg: ChatMessage) => void;
  onClick: (e: MouseEvent, msg: ChatMessage) => void;
  onReply?: (target: { id: string; fromCallsign: string; body: string }) => void;
  onEditMessage?: (id: string, newBody: string) => Promise<void>;
  onDeleteMessage?: (id: string) => Promise<void>;
  onRetryMessage?: (id: string) => void;
}

export const MessageRow = memo(function MessageRow({
  msg,
  isConsecutive,
  showPeerHeader,
  peerCallsign,
  isMine,
  isSystem,
  remaining,
  closed,
  isEditing,
  editDraft,
  savingEdit,
  isSwiping,
  swipeOffset,
  linkPreviewsEnabled,
  editTextareaRef,
  onStartEditing,
  onCancelEditing,
  onSubmitEdit,
  onEditDraftChange,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onContextMenu,
  onClick,
  onReply,
  onEditMessage,
  onDeleteMessage,
  onRetryMessage,
}: MessageRowProps) {
  if (isSystem) {
    return (
      <motion.div
        id={`msg-${msg.id}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex justify-center my-2"
      >
        <span className="rounded-full bg-zinc-900/60 border border-white/10 px-2.5 py-0.5 text-[11px] sm:text-xs text-zinc-400 shadow-sm">
          {msg.body}
        </span>
      </motion.div>
    );
  }

  const currentOffset = isSwiping ? swipeOffset : 0;

  return (
    <motion.div
      id={`msg-${msg.id}`}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springBubble}
      className={cn(
        "flex flex-col group transition-opacity duration-150 contain-bubble",
        isMine ? "items-end" : "items-start",
        isConsecutive ? "mt-0.5 sm:mt-1" : "mt-2.5 sm:mt-3",
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
                document.getElementById("chat-message-input")?.focus();
              }}
              aria-label="Reply to message"
              title="Reply"
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation active:scale-90"
            >
              <Reply className="h-3 w-3" />
            </button>
          )}

          {isMine && !closed && !isEditing && onEditMessage && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onStartEditing(msg.id, msg.body);
              }}
              aria-label="Edit message"
              title="Edit message"
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation active:scale-90"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}

          {isMine && !closed && !isEditing && onDeleteMessage && (
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

        {isEditing ? (
          <div className="flex flex-col gap-2 min-w-[220px] sm:min-w-[300px] p-2.5 rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                <Pencil className="h-2.5 w-2.5" />
                <span>Edit Message</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Esc to cancel</span>
            </div>
            <textarea
              ref={editTextareaRef}
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmitEdit(msg.id);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancelEditing();
                }
              }}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/90 p-2 text-[16px] sm:text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 font-sans resize-none transition-all"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelEditing}
                disabled={savingEdit}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSubmitEdit(msg.id)}
                disabled={savingEdit || !editDraft.trim()}
                className="rounded-lg bg-zinc-100 hover:bg-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-950 shadow-sm disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>Save</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative inline-flex items-center max-w-[88%] sm:max-w-[76%] md:max-w-[68%] min-w-0">
            {/* Left-to-Right swipe indicator (reveals Edit message) */}
            {isSwiping && currentOffset > 5 && msg.mine && !closed && (
              <div
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-0 pointer-events-none flex items-center justify-center transition-opacity"
                style={{
                  opacity: Math.min(1, Math.max(0, (currentOffset - 5) / 25)),
                  transform: `translateY(-50%) scale(${Math.min(1, 0.7 + (currentOffset / 35) * 0.3)})`,
                }}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-950/90 border border-cyan-500/40 text-cyan-300 shadow-md">
                  <Pencil className="h-3 w-3" />
                </div>
              </div>
            )}

            {/* Right-to-Left swipe indicator (reveals Reply) */}
            {isSwiping && currentOffset < -5 && onReply && !closed && (
              <div
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-0 pointer-events-none flex items-center justify-center transition-opacity"
                style={{
                  opacity: Math.min(1, Math.max(0, (Math.abs(currentOffset) - 5) / 25)),
                  transform: `translateY(-50%) scale(${Math.min(1, 0.7 + (Math.abs(currentOffset) / 35) * 0.3)})`,
                }}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 border border-white/20 text-zinc-100 shadow-md">
                  <Reply className="h-3 w-3" />
                </div>
              </div>
            )}

            <div
              onTouchStart={(e) => onTouchStart(e, msg)}
              onTouchMove={(e) => onTouchMove(e, msg)}
              onTouchEnd={(e) => onTouchEnd(e, msg)}
              onTouchCancel={onTouchCancel}
              onContextMenu={(e) => onContextMenu(e, msg)}
              onClick={(e) => onClick(e, msg)}
              style={{
                transform: currentOffset !== 0 ? `translateX(${currentOffset}px)` : undefined,
                transition: isSwiping ? "none" : "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
              }}
              className={cn(
                "relative z-10 flex flex-col w-fit rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-[15px] sm:text-sm leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word] shadow-sm touch-pan-y min-w-[72px] select-text transition-all duration-150 cursor-pointer",
                isMine
                  ? cn(
                      "bg-[#f4f3ec] text-[#090b10] font-normal shadow-[0_2px_12px_-2px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.7)]",
                      isConsecutive ? "rounded-tr-md rounded-br-sm" : "rounded-tr-xs",
                    )
                  : cn(
                      "bg-[#0e121d]/90 border border-white/[0.09] text-[#f2f4f8] shadow-[0_2px_14px_-3px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm",
                      isConsecutive ? "rounded-tl-md rounded-bl-sm" : "rounded-tl-xs",
                    ),
              )}
              title={formatClock(new Date(msg.createdAt))}
            >
              <MessageBody body={msg.body} isMine={isMine} />
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
              <div
                className={cn(
                  "flex items-center gap-1.5 mt-1 pt-0.5 select-none text-[10px] font-mono leading-none",
                  isMine ? "justify-end text-zinc-500" : "justify-start text-zinc-500",
                )}
              >
                <span className="tabular-nums font-mono opacity-80 text-[10px]">
                  {formatClock(new Date(msg.createdAt))}
                </span>
                {msg.editedAt && (
                  <span className="text-[9px] italic opacity-70">
                    edited
                  </span>
                )}
                {remaining && (
                  <span className="text-[9px] hidden group-hover:inline opacity-70 font-mono tabular-nums">
                    ({remaining})
                  </span>
                )}
                {isMine && !isSystem && (
                  <DeliveryCheckmark
                    status={msg.status}
                    seenAt={msg.seenAt}
                    className="ml-0.5"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
});
MessageRow.displayName = "MessageRow";
