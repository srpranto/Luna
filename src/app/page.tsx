"use client";

import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { LogPanel } from "@/components/luna/log-panel";
import { SettingsPanel } from "@/components/luna/settings-panel";
import { PaperShell } from "@/components/luna/paper-shell";
import { StatusHeader } from "@/components/luna/status-header";
import { HistoryModal } from "@/components/luna/history-modal";
import { VoidLetters } from "@/components/luna/void-letters";
import { WelcomeModal } from "@/components/luna/welcome-modal";
import { BootView } from "@/components/luna/boot-view";
import { ListeningView } from "@/components/luna/listening-view";
import { LineView } from "@/components/luna/line-view";
import { NetworkBanner } from "@/components/luna/network-banner";
import { useLunaPresence } from "@/hooks/luna/use-luna-presence";
import { useLunaMessages } from "@/hooks/luna/use-luna-messages";
import { useLunaStream } from "@/hooks/luna/use-luna-stream";
import { sanitizeInterests } from "@/lib/luna/constants";
import { deskName, getCachedCustomName, getOrCreateDeviceId } from "@/lib/luna/identity";
import {
  sweepExpiredCaches,
  exportDevicePublicKeyHex,
  establishSharedKey,
  loadChatHistory,
  deleteHistorySession,
  clearAllChatHistory,
  destroySessionKey,
} from "@/lib/luna/crypto";
import {
  getDesk,
  heartbeatQueue,
  joinQueue,
  leaveQueue,
  leaveSession,
  listMessages,
  offerQsl,
  openFriendLine,
  registerStation,
  reportTyping,
  respondQsl,
  updateCallsign,
} from "@/lib/luna/client";
import {
  isSoundEnabled,
  playMatchChime,
  playLeaveTone,
  setSoundEnabled,
} from "@/lib/luna/sound";
import type { DeskView, MessagesPack, SessionView, HistorySession } from "@/lib/luna/types";

const INTEREST_KEY = "luna.interests";
const BLOCKED_KEY = "luna.blocked";
const POPULAR_MIDNIGHT_TOPICS = ["quiet thoughts", "sleeplessness", "nostalgia", "music", "life questions"];

function readSavedInterests(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${INTEREST_KEY}.${deskName()}`);
    return raw ? sanitizeInterests(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function readBlockedStations(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveBlockedStation(peerId: string): void {
  if (typeof window === "undefined") return;
  const current = readBlockedStations();
  if (!current.includes(peerId)) {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify([...current, peerId]));
  }
}

function errorMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You're offline. Please check your internet connection.";
  }
  if (error instanceof Error && error.message) {
    const msg = error.message;
    if (
      msg.includes("Line not found") ||
      msg.includes("Chat session not found") ||
      msg.includes("conversation has ended") ||
      msg.includes("aborted")
    ) {
      return "";
    }
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
      return "No internet connection. Waiting for network...";
    }
    return msg;
  }
  return "";
}

const subscribeNetwork = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

let lastTypingReport = 0;

export default function Home() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [desk, setDesk] = useState<DeskView | null>(null);
  const [sessionView, setSessionView] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundActive, setSoundActive] = useState(true);
  const [wireCutPrimed, setWireCutPrimed] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [, setResyncTick] = useState(0);

  const isOnline = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  const prevOnlineRef = useRef(isOnline);

  const activeSessionRef = useRef<SessionView | null>(null);
  const leftSessionIdsRef = useRef<Set<string>>(new Set());
  const lastMatchChimeRef = useRef<string | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyError = useCallback((err: unknown) => {
    const msg = errorMessage(err);
    if (msg) setNote(msg);
  }, []);

  const triggerResync = useCallback(() => setResyncTick((n) => n + 1), []);

  const session = desk?.activeSession ?? null;
  const currentSession = sessionView && (!session || session.id === sessionView.id) ? sessionView : session;
  const listening = Boolean(desk?.queued) && !currentSession;

  useEffect(() => {
    activeSessionRef.current = currentSession;
  }, [currentSession]);

  const { isAway, setIsAway, resetIdle } = useLunaPresence({
    deviceId,
    currentSession,
    onResync: triggerResync,
  });

  const markSessionClosed = useCallback((sessionId: string | undefined) => {
    setSessionView((prev) => {
      const base = prev?.id === sessionId ? prev : activeSessionRef.current?.id === sessionId ? activeSessionRef.current : null;
      return base ? { ...base, closed: true, peerPresence: "disconnected", peerTyping: false } : prev;
    });
  }, []);

  const {
    messages,
    setMessages,
    replyingTo,
    setReplyingTo,
    floatingReactions,
    handleReactionFinished,
    handleSendMessage: runSendMessage,
    handleEditMessage: runEditMessage,
    handleDeleteMessage: runDeleteMessage,
    handleSendReaction: runSendReaction,
    decryptPack,
    mergeAndStoreMessages,
    clearUnread,
  } = useLunaMessages({
    deviceId,
    onActivity: resetIdle,
    onHistoryUpdated: setHistorySessions,
    onSessionEndedNotice: () => markSessionClosed(currentSession?.id),
  });

  // Re-fetch desk when returning online
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && deviceId) {
      void getDesk({ deviceId }).then(setDesk).catch(() => {});
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, deviceId]);

  // Window title notification reset
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) clearUnread();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [clearUnread]);

  // Initial device hydration & cache sweep
  useEffect(() => {
    const id = getOrCreateDeviceId();
    const saved = readSavedInterests();
    const initialSound = isSoundEnabled();

    const t = window.setTimeout(() => {
      setDeviceId(id);
      setInterests(saved);
      setSoundActive(initialSound);
      sweepExpiredCaches();
      setHistorySessions(loadChatHistory());
    }, 0);

    const sweepTimer = window.setInterval(sweepExpiredCaches, 3600000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(sweepTimer);
    };
  }, []);

  // Save interests changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${INTEREST_KEY}.${deskName()}`, JSON.stringify(interests));
    }
  }, [interests]);

  // Register station and sync custom name
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    exportDevicePublicKeyHex(deviceId)
      .then((pubKey) => registerStation({ deviceId, publicKey: pubKey ?? undefined }))
      .then(async (data) => {
        if (cancelled) return;
        const cachedName = getCachedCustomName();
        if (cachedName && cachedName !== data.station.callsign) {
          try {
            const updated = await updateCallsign({ deviceId, callsign: cachedName });
            if (!cancelled) {
              setDesk(updated);
              return;
            }
          } catch {}
        }
        setDesk(data);
      })
      .catch((err) => {
        if (!cancelled) notifyError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, notifyError]);

  // SSE Stream Event Handler
  const handleStreamEvent = useCallback(
    async (eventType: string, data: unknown) => {
      if (eventType === "message" || eventType === "message_edited") {
        const pack = data as MessagesPack;
        const packId = pack.session?.id;
        const isActive = packId && (packId === activeSessionRef.current?.id || (!activeSessionRef.current && !leftSessionIdsRef.current.has(packId) && !pack.session.closed));

        if (isActive && deviceId) {
          const displayMsgs = await decryptPack(pack, deviceId);
          if (!leftSessionIdsRef.current.has(packId)) {
            setSessionView(pack.session);
            mergeAndStoreMessages(pack.session.id, pack.session, displayMsgs, eventType === "message");
          }
        }
      } else if (eventType === "message_deleted") {
        const info = data as { sessionId: string; messageId: string };
        if (info.sessionId === activeSessionRef.current?.id) {
          setMessages((prev) => prev.filter((m) => m.id !== info.messageId));
        }
      } else if (eventType === "presence_update") {
        const info = data as { sessionId: string; peerId: string; isAway: boolean };
        setSessionView((prev) => (prev?.id === info.sessionId ? {
          ...prev,
          peerIsAway: info.isAway,
          peerPresence: prev.closed ? "disconnected" : info.isAway ? "away" : "active",
        } : prev));
      } else if (eventType === "typing") {
        const info = data as { sessionId?: string; isTyping: boolean };
        if (info.sessionId === activeSessionRef.current?.id) {
          setSessionView((prev) => (prev && prev.id === info.sessionId ? { ...prev, peerTyping: info.isTyping } : prev));
          if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
          if (info.isTyping) {
            peerTypingTimeoutRef.current = setTimeout(() => {
              setSessionView((prev) => (prev ? { ...prev, peerTyping: false } : prev));
            }, 3000);
          }
        }
      } else if (eventType === "session_started") {
        const info = data as { sessionId: string; desk?: DeskView };
        if (info.desk) setDesk(info.desk);
        else if (deviceId) getDesk({ deviceId }).then(setDesk).catch(() => {});

        if (info.sessionId && lastMatchChimeRef.current !== info.sessionId) {
          lastMatchChimeRef.current = info.sessionId;
          playMatchChime();
          if (typeof window !== "undefined" && "vibrate" in navigator) {
            try { navigator.vibrate([15, 60, 20]); } catch {}
          }
        }
      } else if (eventType === "session_ended") {
        const info = data as { sessionId: string; desk?: DeskView };
        if (info.sessionId === activeSessionRef.current?.id) {
          markSessionClosed(info.sessionId);
          if (info.desk) setDesk(info.desk);
          playLeaveTone();
        }
      } else if (eventType === "desk_update" || eventType === "friend_request") {
        const refreshed = data as DeskView;
        if (refreshed?.station) setDesk(refreshed);
      }
    },
    [deviceId, decryptPack, mergeAndStoreMessages, setMessages, markSessionClosed],
  );

  useLunaStream({
    deviceId,
    onEvent: handleStreamEvent,
    onDeskUpdate: setDesk,
    onResync: triggerResync,
  });

  // Fetch / Sync active session messages periodically or on resync
  useEffect(() => {
    if (!deviceId || !currentSession?.id) return;
    let cancelled = false;

    const syncSessionMessages = () => {
      listMessages({ deviceId, sessionId: currentSession.id })
        .then(async (pack) => {
          if (cancelled || leftSessionIdsRef.current.has(currentSession.id)) return;
          const displayMsgs = await decryptPack(pack, deviceId);
          if (cancelled) return;
          setSessionView(pack.session);
          mergeAndStoreMessages(currentSession.id, pack.session, displayMsgs, false);
        })
        .catch(() => {});
    };

    syncSessionMessages();
    const interval = window.setInterval(syncSessionMessages, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [deviceId, currentSession?.id, decryptPack, mergeAndStoreMessages]);

  // Session establishment sound and key negotiation
  useEffect(() => {
    if (currentSession?.id) {
      if (lastMatchChimeRef.current !== currentSession.id) {
        lastMatchChimeRef.current = currentSession.id;
        playMatchChime();
      }
      if (currentSession.peerPublicKey && deviceId) {
        void establishSharedKey(deviceId, currentSession.id, currentSession.peerPublicKey);
      }
    }
  }, [currentSession?.id, currentSession?.peerPublicKey, deviceId]);

  // Queue Heartbeat polling while listening
  useEffect(() => {
    if (!deviceId || !listening) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const blocked = readBlockedStations();
        const res = await heartbeatQueue({ deviceId, blockedIds: blocked });
        if (!cancelled) setDesk(res.desk);
      } catch {}
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deviceId, listening]);

  // Wirecut banner auto-dismiss
  useEffect(() => {
    if (!wireCutPrimed) return;
    const timer = window.setTimeout(() => {
      setWireCutPrimed(false);
      setNote((prev) => (prev?.includes("Esc again") ? null : prev));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [wireCutPrimed]);

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
  };

  const handleDraftChange = useCallback((next: string) => {
    setDraft(next);
    resetIdle();
  }, [resetIdle]);

  const handleJoinQueue = useCallback(async (overrideInterests?: unknown) => {
    if (!deviceId || busy) return;
    const finalInterests = Array.isArray(overrideInterests)
      ? overrideInterests.filter((x): x is string => typeof x === "string")
      : interests;
    setBusy(true);
    try {
      setNote(null);
      const blocked = readBlockedStations();
      const pubKey = await exportDevicePublicKeyHex(deviceId);
      const res = await joinQueue({
        deviceId,
        interests: finalInterests,
        blockedIds: blocked,
        publicKey: pubKey ?? undefined,
      });
      setDesk(res.desk);
      setLogOpen(false);
      setSettingsOpen(false);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }, [deviceId, busy, interests, notifyError]);

  const handleLeaveQueue = useCallback(async () => {
    if (!deviceId || busy) return;
    setBusy(true);
    try {
      setNote(null);
      const next = await leaveQueue({ deviceId });
      setDesk(next);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }, [deviceId, busy, notifyError]);

  const handleLeaveSession = useCallback(async () => {
    if (!deviceId || busy) return;
    const targetSessionId = currentSession?.id;
    setBusy(true);
    playLeaveTone();
    setIsAway(false);
    setReplyingTo(null);
    setMessages([]);
    setSessionView(null);
    setDesk((prev) => (prev ? { ...prev, activeSession: null } : null));
    setHistorySessions(loadChatHistory());

    if (targetSessionId) {
      leftSessionIdsRef.current.add(targetSessionId);
      destroySessionKey(targetSessionId);
      try {
        setNote(null);
        const next = await leaveSession({ deviceId, sessionId: targetSessionId });
        setDesk(next);
      } catch {
        if (deviceId) getDesk({ deviceId }).then(setDesk).catch(() => {});
      } finally {
        setBusy(false);
      }
    } else {
      setBusy(false);
    }
  }, [deviceId, busy, currentSession?.id, setIsAway, setReplyingTo, setMessages]);

  const handleNextStranger = useCallback(async () => {
    if (!deviceId || busy) return;
    const targetSessionId = currentSession?.id;
    setBusy(true);
    playLeaveTone();
    setIsAway(false);
    setReplyingTo(null);
    setMessages([]);
    setSessionView(null);
    setDesk((prev) => (prev ? { ...prev, activeSession: null, queued: true } : null));
    setHistorySessions(loadChatHistory());

    if (targetSessionId) {
      leftSessionIdsRef.current.add(targetSessionId);
      destroySessionKey(targetSessionId);
      void leaveSession({ deviceId, sessionId: targetSessionId }).catch(() => {});
    }

    try {
      setNote(null);
      const blocked = readBlockedStations();
      const pubKey = await exportDevicePublicKeyHex(deviceId);
      const res = await joinQueue({
        deviceId,
        interests,
        blockedIds: blocked,
        publicKey: pubKey ?? undefined,
      });
      setDesk(res.desk);
      setLogOpen(false);
      setSettingsOpen(false);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }, [deviceId, busy, currentSession?.id, interests, setIsAway, setReplyingTo, setMessages, notifyError]);

  const handleSendMessage = () => {
    if (!isOnline) {
      setNote("You're offline. Reconnect to send messages.");
      return;
    }
    if (currentSession) {
      void runSendMessage(draft, currentSession, desk?.station.callsign ?? "You");
      setDraft("");
    }
  };

  const handleSeverAndBlock = async () => {
    if (!deviceId || busy) return;
    if (currentSession?.peerId) saveBlockedStation(currentSession.peerId);
    await handleLeaveSession();
    setNote("Chat ended. You will not be matched with this stranger again.");
  };

  const handleOfferQsl = async () => {
    if (!deviceId || !currentSession?.id || busy) return;
    setBusy(true);
    try {
      setNote(null);
      const pack = await offerQsl({ deviceId, sessionId: currentSession.id });
      setMessages(pack.messages);
      setSessionView(pack.session);
      const refreshed = await getDesk({ deviceId });
      setDesk(refreshed);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRespondQsl = async (requestId: string, accept: boolean) => {
    if (!deviceId || busy) return;
    setBusy(true);
    try {
      setNote(null);
      const next = await respondQsl({ deviceId, requestId, accept });
      setDesk(next);
      if (currentSession?.id) {
        const pack = await listMessages({ deviceId, sessionId: currentSession.id });
        setMessages(pack.messages);
        setSessionView(pack.session);
      }
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenFriendLine = async (friendId: string) => {
    if (!deviceId || busy) return;
    setBusy(true);
    try {
      setNote(null);
      const next = await openFriendLine({ deviceId, friendId });
      setDesk(next);
      setLogOpen(false);
      setSettingsOpen(false);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleTyping = (isTyping: boolean) => {
    if (!deviceId || !currentSession?.id) return;
    const now = Date.now();
    if (isTyping && now - lastTypingReport < 1800) return;
    lastTypingReport = isTyping ? now : 0;
    void reportTyping({ deviceId, sessionId: currentSession.id, isTyping }).catch(() => {});
  };

  // Keyboard Navigation: Esc for wirecut / leave, Enter for queue join / next
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (currentSession?.id) {
          e.preventDefault();
          if (currentSession.closed) {
            void handleLeaveSession();
          } else if (wireCutPrimed) {
            setWireCutPrimed(false);
            setNote("You left the chat. Finding a new stranger...");
            void handleNextStranger();
          } else {
            setWireCutPrimed(true);
            setNote("Press Esc again to leave this chat");
          }
        } else if (listening) {
          e.preventDefault();
          void handleLeaveQueue();
        }
      } else if (e.key === "Enter") {
        if (currentSession?.closed) {
          e.preventDefault();
          void handleNextStranger();
        } else if (!currentSession?.id && !desk?.queued && !busy && deviceId) {
          const tag = document.activeElement?.tagName;
          if (tag !== "BUTTON" && tag !== "INPUT") {
            e.preventDefault();
            void handleJoinQueue();
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentSession,
    wireCutPrimed,
    listening,
    busy,
    deviceId,
    desk?.queued,
    handleJoinQueue,
    handleLeaveQueue,
    handleLeaveSession,
    handleNextStranger,
  ]);

  const meta = !isOnline
    ? "offline"
    : currentSession
      ? currentSession.kind === "friend"
        ? "friend"
        : "chatting"
      : listening
        ? "searching"
        : "online";

  return (
    <PaperShell>
      <StatusHeader
        callsign={desk?.station.callsign}
        meta={meta}
        logOpen={logOpen}
        onToggleLog={() => {
          setLogOpen((o) => !o);
          setSettingsOpen(false);
          setHistoryOpen(false);
        }}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        settingsOpen={settingsOpen}
        onToggleSettings={() => {
          setSettingsOpen((o) => !o);
          setLogOpen(false);
          setHistoryOpen(false);
        }}
        onToggleVoid={() => setVoidOpen((o) => !o)}
        hasHistory={historySessions.length > 0}
        historyOpen={historyOpen}
        onToggleHistory={() => {
          setHistoryOpen((o) => !o);
          setLogOpen(false);
          setSettingsOpen(false);
        }}
        activeChat={
          currentSession
            ? {
                peerCallsign: currentSession.peerCallsign,
                sessionCreatedAt: currentSession.createdAt,
                sessionKind: currentSession.kind,
                peerPresence: currentSession.peerPresence,
                peerTyping: currentSession.peerTyping,
              }
            : undefined
        }
      />

      <NetworkBanner isOnline={isOnline} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {settingsOpen && desk ? (
          <SettingsPanel
            desk={desk}
            onClose={() => setSettingsOpen(false)}
            onCallsignUpdated={setDesk}
            onStationReset={() => {
              const newDid = getOrCreateDeviceId();
              setDeviceId(newDid);
              setDesk(null);
              setReplyingTo(null);
              setMessages([]);
              setSessionView(null);
              void registerStation({ deviceId: newDid }).then(setDesk).catch(() => {});
            }}
          />
        ) : logOpen && desk ? (
          <LogPanel
            desk={desk}
            busy={busy}
            onOpenFriend={handleOpenFriendLine}
            onRespond={handleRespondQsl}
          />
        ) : currentSession ? (
          <LineView
            key={`chat-${currentSession.id}`}
            sessionKind={currentSession.kind}
            peerCallsign={currentSession.peerCallsign}
            createdAt={currentSession.createdAt}
            interests={currentSession.interests}
            messages={messages}
            draft={draft}
            onDraft={handleDraftChange}
            onActivity={resetIdle}
            onSend={handleSendMessage}
            onTyping={handleTyping}
            sending={busy}
            closed={currentSession.closed}
            peerTyping={currentSession.peerTyping}
            replyingTo={replyingTo}
            onReply={setReplyingTo}
            onCancelReply={() => setReplyingTo(null)}
            canQsl={
              currentSession.kind === "stranger" &&
              !currentSession.alreadyFriends &&
              currentSession.outboundQsl !== "pending" &&
              currentSession.outboundQsl !== "accepted"
            }
            qslState={currentSession.outboundQsl}
            inbound={currentSession.inboundQsl}
            onQsl={handleOfferQsl}
            onAcceptInbound={() => {
              if (currentSession.inboundQsl?.id) void handleRespondQsl(currentSession.inboundQsl.id, true);
            }}
            onDeclineInbound={() => {
              if (currentSession.inboundQsl?.id) void handleRespondQsl(currentSession.inboundQsl.id, false);
            }}
            onLeave={handleLeaveSession}
            onNext={handleNextStranger}
            onBlock={handleSeverAndBlock}
            busy={busy}
            onReaction={(emoji) => runSendReaction(emoji, currentSession)}
            floatingReactions={floatingReactions}
            onReactionFinished={handleReactionFinished}
            onEditMessage={(mid, body) => runEditMessage(mid, body, currentSession)}
            onDeleteMessage={(mid) => runDeleteMessage(mid, currentSession)}
          />
        ) : listening ? (
          <ListeningView
            key="listening-view"
            enteredAt={desk?.enteredAt ?? null}
            interests={desk?.queuedInterests ?? interests}
            onStop={handleLeaveQueue}
            onAddPopular={() => {
              const combined = Array.from(new Set([...interests, ...POPULAR_MIDNIGHT_TOPICS]));
              setInterests(combined);
              void handleJoinQueue(combined);
            }}
            busy={busy}
          />
        ) : (
          <BootView
            key="boot-view"
            interests={interests}
            onInterests={setInterests}
            onCall={() => void handleJoinQueue()}
            busy={busy || !deviceId}
          />
        )}
      </div>

      {note && (
        <div className="border-t border-white/10 bg-zinc-950/90 px-4 py-2 text-xs text-zinc-300 flex items-center justify-between" role="status">
          <span>{note}</span>
          <button type="button" onClick={() => setNote(null)} className="text-zinc-500 hover:text-zinc-200 text-xs ml-2 cursor-pointer">
            dismiss
          </button>
        </div>
      )}

      {voidOpen && deviceId && (
        <VoidLetters deviceId={deviceId} onClose={() => setVoidOpen(false)} />
      )}

      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessions={historySessions}
        onDeleteSession={(sid) => {
          deleteHistorySession(sid);
          setHistorySessions(loadChatHistory());
        }}
        onClearAll={() => {
          clearAllChatHistory();
          setHistorySessions([]);
          setHistoryOpen(false);
        }}
      />

      <WelcomeModal />
    </PaperShell>
  );
}
