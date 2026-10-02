"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Ban, DoorOpen, HeartHandshake, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrivacyShield } from "@/components/luna/privacy-shield";
import { FloatingReactionsOverlay, type FloatingItem } from "@/components/luna/floating-reactions";
import { Transcript } from "@/components/luna/transcript";
import { ScrollBottomPill } from "@/components/luna/scroll-bottom-pill";
import { Composer } from "@/components/luna/composer";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/luna/types";

export function LineView({
  sessionKind,
  peerCallsign,
  createdAt,
  interests,
  messages,
  draft,
  onDraft,
  onSend,
  onTyping,
  sending,
  closed,
  peerTyping,
  canQsl,
  qslState,
  inbound,
  onQsl,
  onAcceptInbound,
  onDeclineInbound,
  onLeave,
  onNext,
  onBlock,
  busy,
  onReaction,
  floatingReactions,
  onReactionFinished,
  onEditMessage,
  onDeleteMessage,
  onActivity,
}: {
  sessionKind: "stranger" | "friend";
  peerCallsign: string;
  createdAt?: string;
  interests: string[];
  messages: ChatMessage[];
  draft: string;
  onDraft: (next: string) => void;
  onSend: () => void;
  onTyping: (isTyping: boolean) => void;
  sending: boolean;
  closed: boolean;
  peerTyping?: boolean;
  canQsl: boolean;
  qslState: string | null;
  inbound: { id: string; status: string } | null;
  onQsl: () => void;
  onAcceptInbound: () => void;
  onDeclineInbound: () => void;
  onLeave: () => void;
  onNext: () => void;
  onBlock: () => void;
  busy: boolean;
  onReaction: (emoji: string) => void;
  floatingReactions: FloatingItem[];
  onReactionFinished: (id: string) => void;
  onEditMessage: (messageId: string, newBody: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onActivity?: () => void;
}) {
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState(() => {
    if (closed || !createdAt) return 0;
    const diff = Date.now() - new Date(createdAt).getTime();
    return diff < 10000 ? Math.max(0, 10 - Math.floor(diff / 1000)) : 0;
  });

  useEffect(() => {
    if (closed || !createdAt) return;
    const timer = window.setInterval(() => {
      const diff = Date.now() - new Date(createdAt).getTime();
      const rem = diff < 10000 ? Math.max(0, 10 - Math.floor(diff / 1000)) : 0;
      setLockRemainingSeconds(rem);
      if (rem <= 0) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [createdAt, closed]);

  const [resonance, setResonance] = useState(() => {
    if (!createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() >= 300000;
  });

  useEffect(() => {
    if (!createdAt || resonance) return;
    const diff = Date.now() - new Date(createdAt).getTime();
    const wait = Math.max(0, 300000 - diff);
    const timer = window.setTimeout(() => setResonance(true), wait);
    return () => window.clearTimeout(timer);
  }, [createdAt, resonance]);

  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  function handleTranscriptScroll() {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceToBottom > 160);
  }

  function handleScrollToBottom() {
    const el = transcriptScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowScrollBottom(false);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 sm:gap-3 border-b border-white/10 bg-zinc-950/40 px-3 py-1.5 sm:px-6 sm:py-2 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] sm:text-xs text-zinc-500 font-mono">
            {sessionKind === "friend" ? "Direct Line" : "Open Orbit"}
          </span>

          {resonance && (
            <Badge
              variant="secondary"
              className="hidden md:inline-flex items-center gap-1 text-[10px] text-purple-300 bg-purple-950/40 border-purple-500/30 py-0 px-1.5"
            >
              <Sparkles className="h-2.5 w-2.5 text-purple-400" />
              <span>Resonance</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {canQsl ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onQsl}
              disabled={busy}
              className="h-7 sm:h-7.5 px-2 sm:px-2.5 gap-1 sm:gap-1.5 text-xs bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-white/10 cursor-pointer"
              title="Add contact"
            >
              <HeartHandshake className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Add contact</span>
              <span className="sm:hidden text-[11px]">Add</span>
            </Button>
          ) : qslState === "pending" ? (
            <Badge variant="secondary" className="text-[10px] sm:text-[11px] py-0.5 px-1.5 sm:px-2">
              <span className="hidden sm:inline">Invite sent</span>
              <span className="sm:hidden">Sent</span>
            </Badge>
          ) : qslState === "accepted" ? (
            <Badge variant="success" className="text-[10px] sm:text-[11px] py-0.5 px-1.5 sm:px-2">
              ✓
            </Badge>
          ) : null}

          {sessionKind === "stranger" && (
            <Button
              type="button"
              size="sm"
              variant={closed ? "default" : "secondary"}
              onClick={onNext}
              disabled={busy || lockRemainingSeconds > 0}
              className={cn(
                "h-7 sm:h-7.5 px-2 sm:px-2.5 gap-1 sm:gap-1.5 text-xs cursor-pointer transition-all",
                closed
                  ? "bg-white text-zinc-950 hover:bg-zinc-200 font-medium shadow-[0_0_15px_rgba(255,255,255,0.18)]"
                  : "text-zinc-100 hover:bg-zinc-800 disabled:opacity-50",
              )}
              title={
                lockRemainingSeconds > 0
                  ? `Unlocks in ${lockRemainingSeconds}s`
                  : closed
                    ? "Search for someone"
                    : "Leave and find next stranger"
              }
            >
              {lockRemainingSeconds > 0 ? (
                <span className="font-mono text-[10px] sm:text-[11px] text-zinc-400">
                  Lock {lockRemainingSeconds}s
                </span>
              ) : (
                <>
                  <span className="text-[11px] sm:text-xs font-medium">
                    {closed ? "Next (Search)" : "Next"}
                  </span>
                  <ArrowRight className="h-3 w-3" />
                </>
              )}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onLeave}
            disabled={busy}
            className="h-7 sm:h-7.5 px-2 sm:px-2.5 gap-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 cursor-pointer"
            title="Leave this chat"
          >
            <DoorOpen className="h-3.5 w-3.5" />
            <span className="text-[11px] sm:text-xs">Leave</span>
          </Button>

          {sessionKind === "stranger" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onBlock}
              disabled={busy}
              className="h-7 sm:h-7.5 px-1.5 sm:px-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-950/30 cursor-pointer flex items-center gap-1"
              title="Block and leave"
            >
              <Ban className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Block</span>
            </Button>
          )}
        </div>
      </div>

      {inbound?.status === "pending" && (
        <div className="sticky top-0 z-20 backdrop-blur-md bg-zinc-950/95 border-b border-white/10 px-3 py-1.5 sm:px-6 sm:py-2 flex items-center justify-between gap-2 sm:gap-3 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <HeartHandshake className="h-4 w-4 text-zinc-300 shrink-0" />
            <p className="text-xs text-zinc-200 truncate">
              <span className="font-semibold text-zinc-100">{peerCallsign}</span> wants to connect.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={onAcceptInbound}
              disabled={busy}
              className="h-6.5 sm:h-7 px-2.5 sm:px-3 text-[11px] sm:text-xs bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-medium"
            >
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDeclineInbound}
              disabled={busy}
              className="h-6.5 sm:h-7 px-2 sm:px-3 text-[11px] sm:text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80"
            >
              Decline
            </Button>
          </div>
        </div>
      )}

      <div
        ref={transcriptScrollRef}
        onScroll={handleTranscriptScroll}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <PrivacyShield />
        <FloatingReactionsOverlay items={floatingReactions} onFinished={onReactionFinished} />
        <Transcript
          messages={messages}
          peerCallsign={peerCallsign}
          interests={interests}
          peerTyping={peerTyping}
          closed={closed}
          onNext={onNext}
          onLeave={onLeave}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
        />
        <ScrollBottomPill visible={showScrollBottom} onClick={handleScrollToBottom} />
      </div>

      {peerTyping && (
        <div className="flex items-center gap-1.5 px-4 sm:px-6 py-1 bg-zinc-950/80 border-t border-white/5 text-[11px] font-mono text-zinc-400 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" />
          <span>{peerCallsign} is typing…</span>
        </div>
      )}

      <Composer
        value={draft}
        onChange={onDraft}
        onSend={onSend}
        onTyping={onTyping}
        onReaction={onReaction}
        onActivity={onActivity}
        disabled={closed || sending}
        placeholder={
          closed ? "This chat has ended. Click Next to search for someone." : "Say something…"
        }
        autoFocus
      />
    </section>
  );
}
