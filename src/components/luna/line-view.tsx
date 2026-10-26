"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Ban,
  DoorOpen,
  Flag,
  HeartHandshake,
  Sparkles,
  X,
  AlertTriangle,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Settings,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrivacyShield } from "@/components/luna/privacy-shield";
import { Transcript } from "@/components/luna/transcript";
import { ScrollBottomPill } from "@/components/luna/scroll-bottom-pill";
import { Composer } from "@/components/luna/composer";
import { triggerHaptic } from "@/lib/luna/sound";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/luna/types";
import { SessionElapsedBadge } from "@/components/luna/status-header";

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
  onReport,
  onRetryMessage,
  busy,
  onReaction: _onReaction,
  floatingReactions: _floatingReactions,
  onReactionFinished: _onReactionFinished,
  onEditMessage,
  onDeleteMessage,
  onActivity,
  replyingTo,
  onReply,
  onCancelReply,
  onReconnect,
  outboundReconnect,
  inboundReconnect,
  peerPresence,
  soundEnabled = true,
  onToggleSound,
  hasHistory = false,
  onToggleHistory,
  onToggleSettings,
  onToggleLog,
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
  onReport?: (reason: string) => void;
  onRetryMessage?: (messageId: string) => void;
  busy: boolean;
  onReaction?: (emoji: string) => void;
  floatingReactions?: any[];
  onReactionFinished?: (id: string) => void;
  onEditMessage: (messageId: string, newBody: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onActivity?: () => void;
  replyingTo?: { id: string; fromCallsign: string; body: string } | null;
  onReply?: (target: { id: string; fromCallsign: string; body: string }) => void;
  onCancelReply?: () => void;
  onReconnect?: () => void;
  outboundReconnect?: boolean;
  inboundReconnect?: boolean;
  peerPresence?: "active" | "away" | "disconnected";
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  hasHistory?: boolean;
  onToggleHistory?: () => void;
  onToggleSettings?: () => void;
  onToggleLog?: () => void;
}) {
  const [locked, setLocked] = useState(() => {
    if (closed || !createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() < 600;
  });

  const [actionSheetOpen, setActionSheetOpen] = useState(false);

  useEffect(() => {
    if (!actionSheetOpen) return;
    if (typeof window !== "undefined") {
      window.history.pushState({ luna: true, view: "chat", sheet: "actions" }, "");
    }
    const handlePopState = () => {
      setActionSheetOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setActionSheetOpen(false);
        if (typeof window !== "undefined" && window.history.state?.sheet === "actions") {
          window.history.back();
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionSheetOpen]);

  const closeActionSheet = (popHistory: boolean | unknown = true) => {
    setActionSheetOpen(false);
    const shouldPop = typeof popHistory === "boolean" ? popHistory : true;
    if (shouldPop && typeof window !== "undefined" && window.history.state?.sheet === "actions") {
      window.history.back();
    }
  };

  useEffect(() => {
    if (closed && typeof window !== "undefined" && window.history.state?.sheet === "actions") {
      window.history.back();
    }
  }, [closed]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.history.state?.sheet === "actions") {
        window.history.back();
      }
    };
  }, []);

  useEffect(() => {
    if (closed || !createdAt || !locked) return;
    const diff = Date.now() - new Date(createdAt).getTime();
    const delay = Math.max(0, 600 - diff);
    const timer = window.setTimeout(() => setLocked(false), delay);
    return () => window.clearTimeout(timer);
  }, [createdAt, closed, locked]);

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
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("Spam or unwanted advertising");
  const [confirmNext, setConfirmNext] = useState(false);
  const confirmNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmNextTimerRef.current) clearTimeout(confirmNextTimerRef.current);
    };
  }, []);

  function handleNextClick() {
    triggerHaptic("medium");
    if (!closed && messages.length > 0) {
      if (confirmNext) {
        if (confirmNextTimerRef.current) clearTimeout(confirmNextTimerRef.current);
        setConfirmNext(false);
        onNext();
      } else {
        setConfirmNext(true);
        if (confirmNextTimerRef.current) clearTimeout(confirmNextTimerRef.current);
        confirmNextTimerRef.current = setTimeout(() => {
          setConfirmNext(false);
        }, 2500);
      }
    } else {
      onNext();
    }
  }

  useEffect(() => {
    if (!showReportModal) return;
    if (typeof window !== "undefined") {
      window.history.pushState({ luna: true, view: "chat", modal: "report" }, "");
    }
    const handlePopState = () => {
      setShowReportModal(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setShowReportModal(false);
        if (typeof window !== "undefined" && window.history.state?.modal === "report") {
          window.history.back();
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showReportModal]);

  const closeReportModal = () => {
    setShowReportModal(false);
    if (typeof window !== "undefined" && window.history.state?.modal === "report") {
      window.history.back();
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleViewportChange = () => {
      const el = transcriptScrollRef.current;
      if (!el) return;
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < 220) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", handleViewportChange);
    vv.addEventListener("scroll", handleViewportChange);
    return () => {
      vv.removeEventListener("resize", handleViewportChange);
      vv.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  function handleTranscriptScroll() {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceToBottom > 160);
  }

  function handleScrollToBottom() {
    triggerHaptic("light");
    const el = transcriptScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowScrollBottom(false);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* 1. Mobile Phone Unified Dynamic Island Capsule Header */}
      <div className="sm:hidden flex items-center justify-between gap-1.5 mx-2 mt-2 px-3 py-2 rounded-2xl border border-white/[0.12] bg-zinc-900/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.12)] shrink-0 z-30">
        {/* Left: Full Callsign + Active/Away Status in Stranger's Location */}
        <div className="flex items-center gap-2 min-w-0 max-w-[150px]">
          <div className="min-w-0 flex flex-col">
            <span className="text-xs sm:text-sm font-semibold font-mono text-zinc-100 truncate block">
              {peerCallsign}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  peerPresence === "away"
                    ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                    : peerPresence === "disconnected"
                      ? "bg-zinc-600"
                      : "bg-emerald-400 shadow-[0_0_8px_rgba(5,223,114,0.8)] animate-pulse",
                )}
              />
              {peerTyping ? (
                <span className="text-[10px] font-mono text-emerald-400 animate-pulse block leading-none">
                  typing...
                </span>
              ) : peerPresence === "away" ? (
                <span className="text-[10px] font-mono text-amber-400/90 block leading-none">
                  away
                </span>
              ) : (
                <span className="text-[10px] font-mono text-emerald-400/90 block leading-none">
                  active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Centered Elapsed Timer */}
        <div className="flex items-center justify-center min-w-0 flex-1 px-1 gap-1">
          <SessionElapsedBadge createdAt={createdAt} />
          {interests && interests.length > 0 && (
            <span className="hidden xs:inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-950/30 px-1.5 py-0.5 text-[9px] text-emerald-300 font-mono shrink-0 truncate max-w-[80px]">
              #{interests[0].startsWith("#") ? interests[0].slice(1) : interests[0]}
            </span>
          )}
        </div>

        {/* Right: Next + Leave + 3 Dots (•••) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {sessionKind === "stranger" && (
            <Button
              type="button"
              size="sm"
              variant={closed ? "default" : "secondary"}
              onClick={handleNextClick}
              disabled={busy || locked}
              aria-label={closed ? "Search for someone" : confirmNext ? "Confirm next stranger" : "Leave and find next stranger"}
              className={cn(
                "h-7.5 px-2.5 gap-1 text-xs cursor-pointer rounded-full transition-all touch-manipulation active:scale-95 shadow-sm",
                closed
                  ? "bg-white text-zinc-950 hover:bg-zinc-200 font-medium shadow-[0_0_12px_rgba(255,255,255,0.2)]"
                  : confirmNext
                    ? "bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                    : "bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700",
              )}
            >
              <span className="text-xs font-medium">
                {closed ? "Search" : confirmNext ? "Sure?" : "Next"}
              </span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              triggerHaptic("light");
              onLeave();
            }}
            disabled={busy}
            aria-label="Leave chat"
            title="Leave chat"
            className="h-7.5 px-2.5 gap-1 text-xs cursor-pointer rounded-full border border-white/10 bg-zinc-900/60 text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 touch-manipulation font-medium shadow-sm"
          >
            <DoorOpen className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-xs">Leave</span>
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              triggerHaptic("light");
              setActionSheetOpen(true);
            }}
            aria-label="More actions"
            title="More actions"
            className="h-7.5 w-7.5 rounded-full border border-white/10 bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 touch-manipulation cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 2. Desktop Top Bar (Hidden on Mobile) */}
      <div className="hidden sm:flex items-center justify-between gap-2 sm:gap-3 border-b border-white/[0.08] bg-zinc-950/40 px-3 py-1.5 sm:px-6 sm:py-2 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] sm:text-xs text-zinc-500 font-mono">
            {sessionKind === "friend" ? "Direct Line" : "Open Orbit"}
          </span>

          {interests && interests.length > 0 && (
            <Badge
              variant="secondary"
              className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/30 border-emerald-500/20 py-0.5 px-2 font-mono"
            >
              <span>#{interests[0].startsWith("#") ? interests[0].slice(1) : interests[0]}</span>
              {interests.length > 1 && (
                <span className="text-zinc-500 text-[9px]">+{interests.length - 1}</span>
              )}
            </Badge>
          )}

          {resonance && (
            <Badge
              variant="secondary"
              className="hidden md:inline-flex items-center gap-1 text-[10px] text-zinc-200 bg-white/5 border-white/15 py-0 px-1.5"
            >
              <Sparkles className="h-2.5 w-2.5 text-zinc-300" />
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
              onClick={() => {
                triggerHaptic("medium");
                onQsl();
              }}
              disabled={busy}
              aria-label="Add contact"
              className="h-7 sm:h-7.5 px-2 sm:px-2.5 gap-1 sm:gap-1.5 text-xs bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-white/10 cursor-pointer touch-manipulation active:scale-95"
              title="Add contact"
            >
              <HeartHandshake className="h-3.5 w-3.5 text-zinc-100" />
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
              Connected
            </Badge>
          ) : null}

          {sessionKind === "stranger" && (
            <Button
              type="button"
              size="sm"
              variant={closed ? "default" : "secondary"}
              onClick={handleNextClick}
              disabled={busy || locked}
              aria-label={closed ? "Search for someone" : confirmNext ? "Confirm next stranger" : "Leave and find next stranger"}
              className={cn(
                "h-7 sm:h-7.5 px-2 sm:px-2.5 gap-1 sm:gap-1.5 text-xs cursor-pointer transition-all touch-manipulation active:scale-95",
                closed
                  ? "bg-white text-zinc-950 hover:bg-zinc-200 font-medium shadow-[0_0_15px_rgba(255,255,255,0.18)]"
                  : confirmNext
                    ? "bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                    : "text-zinc-100 hover:bg-zinc-800 disabled:opacity-50",
              )}
              title={
                closed
                  ? "Search for someone"
                  : confirmNext
                    ? "Click again to confirm"
                    : "Leave and find next stranger"
              }
            >
              <span className="text-[11px] sm:text-xs font-medium">
                {closed ? "Next (Search)" : confirmNext ? "Sure?" : "Next"}
              </span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              triggerHaptic("light");
              onLeave();
            }}
            disabled={busy}
            aria-label="Leave this chat"
            className="h-7 sm:h-7.5 px-2 sm:px-2.5 gap-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 cursor-pointer touch-manipulation active:scale-95"
            title="Leave this chat"
          >
            <DoorOpen className="h-3.5 w-3.5" />
            <span className="text-[11px] sm:text-xs">Leave</span>
          </Button>

          {sessionKind === "stranger" && (
            <>
              {onReport && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    triggerHaptic("selection");
                    setShowReportModal(true);
                  }}
                  disabled={busy}
                  aria-label="Report user"
                  className="h-7 sm:h-7.5 px-1.5 sm:px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer flex items-center gap-1 touch-manipulation active:scale-95"
                  title="Report user"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Report</span>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  triggerHaptic("heavy");
                  onBlock();
                }}
                disabled={busy}
                aria-label="Block and leave"
                className="h-7 sm:h-7.5 px-1.5 sm:px-2 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-950/30 cursor-pointer flex items-center gap-1 touch-manipulation active:scale-95"
                title="Block and leave"
              >
                <Ban className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Block</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {inbound?.status === "pending" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md animate-water-drop pointer-events-auto">
          <div className="rounded-3xl border border-white/20 bg-zinc-950/95 p-3 sm:p-4 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.15)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-sky-600/20 border border-cyan-400/30 text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.25)]">
                <HeartHandshake className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-cyan-400">Friend Request</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-[10px] text-zinc-400 font-mono">AirDrop</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-zinc-100 truncate mt-0.5">
                  {peerCallsign} wants to be friends
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  triggerHaptic("medium");
                  onAcceptInbound();
                }}
                disabled={busy}
                className="h-8 px-3.5 text-xs bg-white text-zinc-950 hover:bg-zinc-200 font-semibold rounded-full shadow-[0_0_15px_rgba(255,255,255,0.25)] touch-manipulation cursor-pointer active:scale-95 transition-transform"
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  triggerHaptic("light");
                  onDeclineInbound();
                }}
                disabled={busy}
                className="h-8 px-3 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 rounded-full touch-manipulation cursor-pointer active:scale-95 transition-transform"
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={transcriptScrollRef}
        onScroll={handleTranscriptScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain [transform:translateZ(0)] [will-change:scroll-position]"
      >
        <PrivacyShield />
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
          onReply={onReply}
          onRetryMessage={onRetryMessage}
          sessionKind={sessionKind}
          onReconnect={onReconnect}
          outboundReconnect={outboundReconnect}
          inboundReconnect={inboundReconnect}
        />
        <ScrollBottomPill visible={showScrollBottom} onClick={handleScrollToBottom} />
      </div>

      {showReportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReportModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-medium">
                <AlertTriangle className="h-4 w-4" />
                <span id="report-modal-title" className="text-sm font-semibold text-zinc-100">
                  Report Stranger
                </span>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                aria-label="Close dialog"
                className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Help keep Luna safe. Submitting a report records the violation category and permanently blocks this user. Message content is not collected or retained.
            </p>

            <div className="space-y-2">
              {[
                "Spam or unwanted advertising",
                "Harassment or offensive behavior",
                "Inappropriate or harmful content",
                "Other safety concern",
              ].map((reason) => (
                <label
                  key={reason}
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors",
                    reportReason === reason
                      ? "border-rose-500/50 bg-rose-500/10 text-zinc-100"
                      : "border-white/5 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-900",
                  )}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason}
                    checked={reportReason === reason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="accent-rose-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeReportModal}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  triggerHaptic("heavy");
                  closeReportModal();
                  onReport?.(reportReason);
                }}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
              >
                Submit Report & Block
              </Button>
            </div>
          </div>
        </div>
      )}

      {actionSheetOpen && !closed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat Actions"
          onClick={closeActionSheet}
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/65 backdrop-blur-sm animate-fade-up sm:hidden"
        >
          <div
            className="w-full rounded-t-3xl border-t border-white/[0.14] bg-zinc-950/95 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl animate-sheet-up space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-white/20 mb-1" />

            <div className="flex items-center justify-between px-1 pb-2 border-b border-white/10">
              <span className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-wider">
                Chat Controls
              </span>
              <button
                type="button"
                onClick={closeActionSheet}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {canQsl ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("medium");
                    closeActionSheet();
                    onQsl();
                  }}
                  disabled={busy}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <HeartHandshake className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-zinc-100 font-semibold">Add to Contacts</div>
                    <div className="text-[10px] text-zinc-400">Save stranger for direct line reconnection</div>
                  </div>
                </button>
              ) : qslState === "pending" ? (
                <div className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/40 border border-white/5 text-xs text-zinc-400">
                  <HeartHandshake className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>Contact invite sent (waiting for peer)</span>
                </div>
              ) : null}

              {onToggleSound && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    onToggleSound();
                  }}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-sky-400 shrink-0" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-zinc-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="text-zinc-100 font-semibold">
                      {soundEnabled ? "Sound Effects: ON" : "Sound Effects: OFF"}
                    </div>
                    <div className="text-[10px] text-zinc-400">Toggle chime, pop tones and micro-audio</div>
                  </div>
                </button>
              )}

              {hasHistory && onToggleHistory && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    closeActionSheet(false);
                    onToggleHistory();
                  }}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <History className="h-4 w-4 text-zinc-300 shrink-0" />
                  <div className="flex-1">
                    <div className="text-zinc-100 font-semibold">24h Chat History</div>
                    <div className="text-[10px] text-zinc-400">Review recent encrypted conversations</div>
                  </div>
                </button>
              )}

              {onToggleSettings && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    closeActionSheet(false);
                    onToggleSettings();
                  }}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <Settings className="h-4 w-4 text-zinc-300 shrink-0" />
                  <div className="flex-1">
                    <div className="text-zinc-100 font-semibold">Settings</div>
                    <div className="text-[10px] text-zinc-400">Preferences and cryptographic key info</div>
                  </div>
                </button>
              )}

              {onToggleLog && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    closeActionSheet(false);
                    onToggleLog();
                  }}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <HeartHandshake className="h-4 w-4 text-zinc-300 shrink-0" />
                  <div className="flex-1">
                    <div className="text-zinc-100 font-semibold">Connections Log</div>
                    <div className="text-[10px] text-zinc-400">Friends, station info and inbound lines</div>
                  </div>
                </button>
              )}

              {onReport && sessionKind === "stranger" && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    closeActionSheet(false);
                    setShowReportModal(true);
                  }}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <Flag className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-zinc-100 font-semibold">Report Stranger</div>
                    <div className="text-[10px] text-zinc-400">Report spam, abuse, or safety violations</div>
                  </div>
                </button>
              )}

              {sessionKind === "stranger" && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("heavy");
                    closeActionSheet();
                    onBlock();
                  }}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-rose-950/30 border border-rose-500/20 text-xs font-medium text-rose-300 hover:bg-rose-950/50 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <Ban className="h-4 w-4 text-rose-400 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold">Block Stranger</div>
                    <div className="text-[10px] text-rose-400/80">Block this stranger from matching</div>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  closeActionSheet();
                  onLeave();
                }}
                className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs font-medium text-zinc-300 hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer text-left"
              >
                <DoorOpen className="h-4 w-4 text-zinc-400 shrink-0" />
                <div className="flex-1">
                  <div className="text-zinc-200 font-semibold">Leave Chat</div>
                  <div className="text-[10px] text-zinc-500">End session and return to desk</div>
                </div>
              </button>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={closeActionSheet}
              className="w-full h-10 text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Composer
        value={draft}
        onChange={onDraft}
        onSend={onSend}
        onTyping={onTyping}
        onReaction={_onReaction}
        onActivity={onActivity}
        disabled={closed}
        placeholder={
          closed ? "This chat has ended. Click Next to search for someone." : "Say something..."
        }
        autoFocus
        replyingTo={replyingTo}
        onCancelReply={onCancelReply}
        onNext={onNext}
        sessionKind={sessionKind}
        onReconnect={onReconnect}
        outboundReconnect={outboundReconnect}
        inboundReconnect={inboundReconnect}
      />
    </section>
  );
}
