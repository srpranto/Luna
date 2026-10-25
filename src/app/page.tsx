"use client";

import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { LogPanel } from "@/components/luna/log-panel";
import { SettingsPanel } from "@/components/luna/settings-panel";
import { PaperShell } from "@/components/luna/paper-shell";
import { StatusHeader } from "@/components/luna/status-header";
import { HistoryModal } from "@/components/luna/history-modal";
import { VoidLetters } from "@/components/luna/void-letters";
import { WelcomeModal } from "@/components/luna/welcome-modal";
import { ExitConfirmModal } from "@/components/luna/exit-confirm-modal";
import { Start } from "@/components/luna/start";
import { Searching } from "@/components/luna/searching";
import { LineView as Chat } from "@/components/luna/line-view";
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
  decryptText,
  saveCachedMessages,
  loadCachedMessages,
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
  blockUser,
  reportUser,
  requestReconnect,
} from "@/lib/luna/client";
import {
  isSoundEnabled,
  playMatchChime,
  playLeaveTone,
  setSoundEnabled,
  triggerHaptic,
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
  const [exitConfirm, setExitConfirm] = useState<{ type: "chat" | "queue" } | null>(null);
  const hasAutoQueuedRef = useRef(false);

  const isOnline = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  const prevOnlineRef = useRef(isOnline);

  const activeSessionRef = useRef<SessionView | null>(null);
  const leftSessionIdsRef = useRef<Set<string>>(new Set());
  const lastMatchChimeRef = useRef<string | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(busy);
  const isQueueingRef = useRef(false);
  const isLeavingQueueRef = useRef(false);
  const isLeavingSessionRef = useRef(false);
  const interestsRef = useRef(interests);
  const settingsOpenRef = useRef(settingsOpen);
  const logOpenRef = useRef(logOpen);
  const historyOpenRef = useRef(historyOpen);
  const voidOpenRef = useRef(voidOpen);
  const exitConfirmRef = useRef(exitConfirm);
  const listeningRef = useRef(false);
  const recentPeersRef = useRef<Map<string, number>>(new Map());

  const getRecentPeerIds = useCallback((): string[] => {
    const now = Date.now();
    const valid: string[] = [];
    for (const [peerId, ts] of recentPeersRef.current.entries()) {
      if (now - ts < 120_000) {
        valid.push(peerId);
      } else {
        recentPeersRef.current.delete(peerId);
      }
    }
    return valid;
  }, []);

  const notifyError = useCallback((err: unknown) => {
    const msg = errorMessage(err);
    if (msg) setNote(msg);
  }, []);

  const handleDeskUpdate = useCallback((refreshed: DeskView) => {
    setDesk((prev) => {
      if (!prev) return refreshed;
      const validSession =
        refreshed.activeSession && !leftSessionIdsRef.current.has(refreshed.activeSession.id);

      if (isQueueingRef.current && !validSession && !refreshed.queued) {
        return {
          ...refreshed,
          activeSession: null,
          queued: true,
          queuedInterests: prev.queuedInterests ?? refreshed.queuedInterests,
          enteredAt: prev.enteredAt ?? refreshed.enteredAt,
        };
      }

      if (refreshed.activeSession && leftSessionIdsRef.current.has(refreshed.activeSession.id)) {
        return { ...refreshed, activeSession: null };
      }

      return refreshed;
    });
  }, []);

  const session = desk?.activeSession ?? null;
  const currentSession = session
    ? sessionView && sessionView.id === session.id
      ? sessionView
      : session
    : sessionView && !sessionView.closed
      ? sessionView
      : null;
  const listening = Boolean(desk?.queued) && !currentSession;

  useEffect(() => {
    busyRef.current = busy;
    interestsRef.current = interests;
    settingsOpenRef.current = settingsOpen;
    logOpenRef.current = logOpen;
    historyOpenRef.current = historyOpen;
    voidOpenRef.current = voidOpen;
    exitConfirmRef.current = exitConfirm;
    listeningRef.current = listening;
    activeSessionRef.current = currentSession;
  }, [busy, interests, settingsOpen, logOpen, historyOpen, voidOpen, exitConfirm, listening, currentSession]);

  const markSessionClosed = useCallback((sessionId: string | undefined) => {
    if (!sessionId) return;
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
    handleRetryMessage: runRetryMessage,
    handleEditMessage: runEditMessage,
    handleDeleteMessage: runDeleteMessage,
    handleSendReaction: runSendReaction,
    decryptPack,
    mergeAndStoreMessages,
    clearUnread,
    hydrateCachedMessages,
  } = useLunaMessages({
    deviceId,
    sessionId: currentSession?.id,
    onActivity: () => {},
    onHistoryUpdated: setHistorySessions,
    onSessionEndedNotice: () => {
      markSessionClosed(currentSession?.id);
      playLeaveTone();
      triggerHaptic("disconnect");
    },
  });

  const triggerResync = useCallback(() => {
    if (deviceId) {
      void getDesk({ deviceId }).then(handleDeskUpdate).catch(() => {});
      if (activeSessionRef.current?.id) {
        const targetId = activeSessionRef.current.id;
        listMessages({ deviceId, sessionId: targetId })
          .then(async (pack) => {
            if (activeSessionRef.current?.id === targetId) {
              const displayMsgs = await decryptPack(pack, deviceId);
              setSessionView(pack.session);
              mergeAndStoreMessages(targetId, pack.session, displayMsgs, false);
            }
          })
          .catch(() => {});
      }
    }
  }, [deviceId, handleDeskUpdate, decryptPack, mergeAndStoreMessages]);

  const { setIsAway, resetIdle } = useLunaPresence({
    deviceId,
    currentSession,
    onResync: triggerResync,
  });

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && deviceId) {
      void getDesk({ deviceId }).then(handleDeskUpdate).catch(() => {});
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, deviceId, handleDeskUpdate]);

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

      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "void") {
        setVoidOpen(true);
      } else if (params.get("action") === "chat") {
        hasAutoQueuedRef.current = true;
      }
    }, 0);

    const sweepTimer = window.setInterval(sweepExpiredCaches, 3600000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(sweepTimer);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${INTEREST_KEY}.${deskName()}`, JSON.stringify(interests));
    }
  }, [interests]);

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
              handleDeskUpdate(updated);
              return;
            }
          } catch {}
        }
        handleDeskUpdate(data);
      })
      .catch((err) => {
        if (!cancelled) notifyError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, notifyError, handleDeskUpdate]);

  const handleStreamEvent = useCallback(
    async (eventType: string, data: unknown) => {
      if (eventType === "message") {
        const pack = data as MessagesPack;
        const packId = pack.session?.id;
        const isActive =
          packId &&
          (packId === activeSessionRef.current?.id ||
            (!activeSessionRef.current && !leftSessionIdsRef.current.has(packId) && !pack.session.closed));

        if (isActive && deviceId) {
          const displayMsgs = await decryptPack(pack, deviceId);
          if (!leftSessionIdsRef.current.has(packId)) {
            setSessionView(pack.session);
            mergeAndStoreMessages(pack.session.id, pack.session, displayMsgs, true);
          }
        }
      } else if (eventType === "message_edited") {
        const payload = data as Record<string, unknown>;
        if (typeof payload?.messageId === "string" && typeof payload?.sessionId === "string") {
          const info = payload as { sessionId: string; messageId: string; body: string; editedAt: string };
          if (info.sessionId === activeSessionRef.current?.id && deviceId) {
            const decryptedBody = await decryptText(info.body, info.sessionId);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === info.messageId ? { ...m, body: decryptedBody, editedAt: info.editedAt } : m,
              ),
            );
            const cached = loadCachedMessages(info.sessionId);
            if (cached.length > 0) {
              saveCachedMessages(
                info.sessionId,
                cached.map((m) =>
                  m.id === info.messageId ? { ...m, body: decryptedBody, editedAt: info.editedAt } : m,
                ),
              );
            }
          }
        } else {
          const pack = data as MessagesPack;
          const packId = pack.session?.id;
          const isActive =
            packId &&
            (packId === activeSessionRef.current?.id ||
              (!activeSessionRef.current && !leftSessionIdsRef.current.has(packId) && !pack.session.closed));

          if (isActive && deviceId) {
            const displayMsgs = await decryptPack(pack, deviceId);
            if (!leftSessionIdsRef.current.has(packId)) {
              setSessionView(pack.session);
              mergeAndStoreMessages(pack.session.id, pack.session, displayMsgs, false);
            }
          }
        }
      } else if (eventType === "messages_seen") {
        const info = data as { sessionId: string; seenAt: string };
        if (info.sessionId === activeSessionRef.current?.id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.mine && !m.seenAt ? { ...m, seenAt: info.seenAt, status: "seen" as const } : m,
            ),
          );
          const cached = loadCachedMessages(info.sessionId);
          if (cached.length > 0) {
            saveCachedMessages(
              info.sessionId,
              cached.map((m) =>
                m.mine && !m.seenAt ? { ...m, seenAt: info.seenAt, status: "seen" as const } : m,
              ),
            );
          }
        }
      } else if (eventType === "reconnect_requested") {
        const info = data as { sessionId: string; fromCallsign: string; session: SessionView };
        if (activeSessionRef.current?.id === info.sessionId) {
          setSessionView(info.session);
          triggerHaptic("match");
          setNote(`${info.fromCallsign} wants to reconnect! Click Accept Reconnect.`);
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
        setSessionView(null);
        setMessages([]);
        setIsAway(false);
        if (info.desk) handleDeskUpdate(info.desk);
        else if (deviceId) getDesk({ deviceId }).then(handleDeskUpdate).catch(() => {});

        if (info.sessionId && lastMatchChimeRef.current !== info.sessionId) {
          lastMatchChimeRef.current = info.sessionId;
          playMatchChime();
          triggerHaptic("match");
        }
      } else if (eventType === "session_ended") {
        const info = data as { sessionId: string; desk?: DeskView };
        if (info.sessionId && info.sessionId === activeSessionRef.current?.id) {
          markSessionClosed(info.sessionId);
          if (info.desk) handleDeskUpdate(info.desk);
          playLeaveTone();
          triggerHaptic("disconnect");
        }
      } else if (eventType === "desk_update" || eventType === "friend_request") {
        const refreshed = data as DeskView;
        if (refreshed?.station) handleDeskUpdate(refreshed);
      }
    },
    [deviceId, decryptPack, mergeAndStoreMessages, setMessages, markSessionClosed, setIsAway, handleDeskUpdate],
  );

  useLunaStream({
    deviceId,
    onEvent: handleStreamEvent,
    onDeskUpdate: handleDeskUpdate,
    onResync: triggerResync,
    isListening: listening,
  });

  useEffect(() => {
    if (!deviceId || !currentSession?.id) return;
    let cancelled = false;

    const syncSessionMessages = () => {
      const targetSessionId = currentSession.id;
      listMessages({ deviceId, sessionId: targetSessionId })
        .then(async (pack) => {
          if (
            cancelled ||
            leftSessionIdsRef.current.has(targetSessionId) ||
            activeSessionRef.current?.id !== targetSessionId
          ) {
            return;
          }
          const displayMsgs = await decryptPack(pack, deviceId);
          if (cancelled || activeSessionRef.current?.id !== targetSessionId) return;
          setSessionView(pack.session);
          mergeAndStoreMessages(targetSessionId, pack.session, displayMsgs, false);
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

  useEffect(() => {
    if (currentSession?.id) {
      hydrateCachedMessages(currentSession.id);
      if (lastMatchChimeRef.current !== currentSession.id) {
        lastMatchChimeRef.current = currentSession.id;
        playMatchChime();
        triggerHaptic("match");
      }
      if (currentSession.peerPublicKey && deviceId) {
        void establishSharedKey(deviceId, currentSession.id, currentSession.peerPublicKey);
      }
    }
  }, [currentSession?.id, currentSession?.peerPublicKey, deviceId, hydrateCachedMessages]);

  useEffect(() => {
    if (!deviceId || !listening) return;
    let cancelled = false;

    const tick = async () => {
      if (isQueueingRef.current || busyRef.current) return;
      try {
        const blocked = readBlockedStations();
        const res = await heartbeatQueue({
          deviceId,
          blockedIds: blocked,
          recentPeerIds: getRecentPeerIds(),
        });
        if (!cancelled) {
          if (res.status === "matched") {
            setSessionView(null);
            setMessages([]);
            setIsAway(false);
            handleDeskUpdate(res.desk);
          } else if (res.status === "waiting") {
            handleDeskUpdate(res.desk);
          }
        }
      } catch {}
    };

    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deviceId, listening, setIsAway, setMessages, handleDeskUpdate, getRecentPeerIds]);

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
    if (!deviceId || busyRef.current || isQueueingRef.current) return;
    const finalInterests = Array.isArray(overrideInterests)
      ? overrideInterests.filter((x): x is string => typeof x === "string")
      : interestsRef.current;
    setBusy(true);
    isQueueingRef.current = true;
    isLeavingQueueRef.current = false;
    listeningRef.current = true;
    setNote(null);
    setIsAway(false);
    setReplyingTo(null);
    setMessages([]);
    setSessionView(null);
    setExitConfirm(null);
    exitConfirmRef.current = null;
    leftSessionIdsRef.current.clear();
    setDesk((prev) => (prev ? {
      ...prev,
      activeSession: null,
      queued: true,
      queuedInterests: finalInterests,
      enteredAt: new Date().toISOString(),
    } : null));

    if (typeof window !== "undefined" && window.history.state?.view !== "queue") {
      window.history.pushState({ luna: true, view: "queue" }, "");
    }

    try {
      const blocked = readBlockedStations();
      const pubKey = await exportDevicePublicKeyHex(deviceId);
      const res = await joinQueue({
        deviceId,
        interests: finalInterests,
        blockedIds: blocked,
        publicKey: pubKey ?? undefined,
        sessionId: currentSession?.id,
        recentPeerIds: getRecentPeerIds(),
      });
      if (res.status === "matched") {
        setSessionView(null);
        setMessages([]);
        setIsAway(false);
      }
      handleDeskUpdate(res.desk);
      setLogOpen(false);
      setSettingsOpen(false);
    } catch (err) {
      notifyError(err);
      if (deviceId) {
        void getDesk({ deviceId }).then(handleDeskUpdate).catch(() => {});
      }
    } finally {
      isQueueingRef.current = false;
      setBusy(false);
    }
  }, [deviceId, currentSession, notifyError, setIsAway, setMessages, setReplyingTo, handleDeskUpdate, getRecentPeerIds]);

  useEffect(() => {
    if (hasAutoQueuedRef.current && deviceId && desk && !desk.activeSession && !desk.queued && !busy) {
      hasAutoQueuedRef.current = false;
      void handleJoinQueue();
    }
  }, [deviceId, desk, busy, handleJoinQueue]);

  const handleLeaveQueue = useCallback(async () => {
    if (!deviceId || busy || isLeavingQueueRef.current) return;
    setBusy(true);
    isLeavingQueueRef.current = true;
    listeningRef.current = false;
    setExitConfirm(null);
    exitConfirmRef.current = null;
    triggerHaptic("tap");
    setDesk((prev) => (prev ? { ...prev, queued: false, enteredAt: null } : null));

    if (typeof window !== "undefined") {
      window.history.replaceState({ luna: true, view: "boot" }, "");
    }

    try {
      setNote(null);
      const next = await leaveQueue({ deviceId });
      handleDeskUpdate(next);
    } catch (err) {
      notifyError(err);
    } finally {
      isLeavingQueueRef.current = false;
      setBusy(false);
    }
  }, [deviceId, busy, notifyError, handleDeskUpdate]);

  const handleLeaveSession = useCallback(async () => {
    if (!deviceId || busy || isLeavingSessionRef.current) return;
    const targetSessionId = currentSession?.id;
    if (currentSession?.peerId) {
      recentPeersRef.current.set(currentSession.peerId, Date.now());
    }
    setBusy(true);
    isLeavingSessionRef.current = true;
    activeSessionRef.current = null;
    setExitConfirm(null);
    exitConfirmRef.current = null;
    playLeaveTone();
    triggerHaptic("disconnect");
    setIsAway(false);
    setReplyingTo(null);
    setMessages([]);
    setSessionView(null);
    setDesk((prev) => (prev ? { ...prev, activeSession: null } : null));
    setHistorySessions(loadChatHistory());

    if (typeof window !== "undefined") {
      window.history.replaceState({ luna: true, view: "boot" }, "");
    }

    if (targetSessionId) {
      leftSessionIdsRef.current.add(targetSessionId);
      destroySessionKey(targetSessionId);
      try {
        setNote(null);
        const next = await leaveSession({ deviceId, sessionId: targetSessionId });
        handleDeskUpdate(next);
      } catch {
        if (deviceId) getDesk({ deviceId }).then(handleDeskUpdate).catch(() => {});
      } finally {
        isLeavingSessionRef.current = false;
        setBusy(false);
      }
    } else {
      isLeavingSessionRef.current = false;
      setBusy(false);
    }
  }, [deviceId, busy, currentSession, setIsAway, setReplyingTo, setMessages, handleDeskUpdate]);

  const handleNextStranger = useCallback(async () => {
    if (!deviceId || busyRef.current) return;
    const targetSessionId = currentSession?.id;
    if (currentSession?.peerId) {
      recentPeersRef.current.set(currentSession.peerId, Date.now());
    }
    setBusy(true);
    isQueueingRef.current = true;
    playLeaveTone();
    triggerHaptic("disconnect");
    setIsAway(false);
    setReplyingTo(null);
    setMessages([]);
    setSessionView(null);
    setDesk((prev) => (prev ? {
      ...prev,
      activeSession: null,
      queued: true,
      queuedInterests: interestsRef.current,
      enteredAt: new Date().toISOString(),
    } : null));
    setHistorySessions(loadChatHistory());

    if (typeof window !== "undefined") {
      window.history.replaceState({ luna: true, view: "queue" }, "");
    }

    if (targetSessionId) {
      leftSessionIdsRef.current.add(targetSessionId);
      destroySessionKey(targetSessionId);
    }

    try {
      setNote(null);
      const blocked = readBlockedStations();
      const pubKey = await exportDevicePublicKeyHex(deviceId);
      const res = await joinQueue({
        deviceId,
        interests: interestsRef.current,
        blockedIds: blocked,
        publicKey: pubKey ?? undefined,
        sessionId: targetSessionId,
        recentPeerIds: getRecentPeerIds(),
      });
      if (res.status === "matched") {
        setSessionView(null);
        setMessages([]);
        setIsAway(false);
      }
      handleDeskUpdate(res.desk);
      setLogOpen(false);
      setSettingsOpen(false);
    } catch (err) {
      notifyError(err);
      if (deviceId) {
        void getDesk({ deviceId }).then(handleDeskUpdate).catch(() => {});
      }
    } finally {
      isQueueingRef.current = false;
      setBusy(false);
    }
  }, [deviceId, currentSession, setIsAway, setReplyingTo, setMessages, notifyError, handleDeskUpdate, getRecentPeerIds]);

  const handleReconnect = useCallback(async () => {
    if (!deviceId || !currentSession?.id || busyRef.current) return;
    setBusy(true);
    triggerHaptic("medium");
    try {
      setNote(null);
      const nextDesk = await requestReconnect({
        deviceId,
        sessionId: currentSession.id,
      });
      handleDeskUpdate(nextDesk);
      setSessionView((prev) => (prev ? { ...prev, outboundReconnect: true } : prev));
      setNote("Reconnect requested. Waiting for stranger to accept...");
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }, [deviceId, currentSession, handleDeskUpdate, notifyError]);

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
    if (currentSession?.peerId) {
      recentPeersRef.current.set(currentSession.peerId, Date.now());
      saveBlockedStation(currentSession.peerId);
      void blockUser({ deviceId, targetId: currentSession.peerId }).catch(() => {});
    }
    await handleLeaveSession();
    setNote("Chat ended. You will not be matched with this stranger again.");
  };

  const handleReportAndBlock = async (reason: string) => {
    if (!deviceId || busy) return;
    if (currentSession?.peerId) {
      recentPeersRef.current.set(currentSession.peerId, Date.now());
      saveBlockedStation(currentSession.peerId);
      void reportUser({ deviceId, targetId: currentSession.peerId, reason }).catch(() => {});
    }
    await handleLeaveSession();
    setNote("Report submitted. You will not be matched with this user again.");
  };

  const handleOfferQsl = async () => {
    if (!deviceId || !currentSession || busy) return;
    setBusy(true);
    triggerHaptic("medium");
    try {
      setNote(null);
      const pack = await offerQsl({ deviceId, sessionId: currentSession.id });
      const displayMsgs = await decryptPack(pack, deviceId);
      setSessionView(pack.session);
      mergeAndStoreMessages(currentSession.id, pack.session, displayMsgs, false);
      setNote("Invite offered.");
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRespondQsl = async (requestId: string, accept: boolean) => {
    if (!deviceId || busy) return;
    setBusy(true);
    triggerHaptic("medium");
    try {
      setNote(null);
      const next = await respondQsl({ deviceId, requestId, accept });
      handleDeskUpdate(next);
      setNote(accept ? "Friend connected." : "Invite declined.");
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenFriendLine = async (friendId: string) => {
    if (!deviceId || busy) return;
    setBusy(true);
    triggerHaptic("tap");
    setNote(null);
    setIsAway(false);
    setReplyingTo(null);
    setMessages([]);
    setSessionView(null);

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

  const openOverlayModal = useCallback((name: "settings" | "log" | "history" | "void") => {
    setSettingsOpen(name === "settings");
    setLogOpen(name === "log");
    setHistoryOpen(name === "history");
    setVoidOpen(name === "void");

    if (typeof window !== "undefined") {
      const current = window.history.state;
      const view = activeSessionRef.current ? "chat" : listeningRef.current ? "queue" : "boot";
      const sessionId = activeSessionRef.current?.id;
      const nextState = { luna: true, view, sessionId, modal: name };

      if (current?.modal && current.modal !== "exit_confirm") {
        window.history.replaceState(nextState, "");
      } else {
        window.history.pushState(nextState, "");
      }
    }
  }, []);

  const closeOverlayModal = useCallback((name?: "settings" | "log" | "history" | "void") => {
    if (!name || name === "settings") setSettingsOpen(false);
    if (!name || name === "log") setLogOpen(false);
    if (!name || name === "history") setHistoryOpen(false);
    if (!name || name === "void") setVoidOpen(false);
    settingsOpenRef.current = false;
    logOpenRef.current = false;
    historyOpenRef.current = false;
    voidOpenRef.current = false;

    if (typeof window !== "undefined") {
      const current = window.history.state;
      if (current?.modal && current.modal !== "exit_confirm") {
        window.history.back();
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { luna?: boolean; view?: string; sessionId?: string; modal?: string } | null;

      if (exitConfirmRef.current) {
        setExitConfirm(null);
        exitConfirmRef.current = null;
        if (activeSessionRef.current && !activeSessionRef.current.closed) {
          window.history.pushState(
            {
              luna: true,
              view: "chat",
              sessionId: activeSessionRef.current.id,
            },
            "",
          );
        } else if (listeningRef.current && !isLeavingQueueRef.current) {
          window.history.pushState(
            {
              luna: true,
              view: "queue",
            },
            "",
          );
        }
        return;
      }

      if (
        settingsOpenRef.current ||
        logOpenRef.current ||
        historyOpenRef.current ||
        voidOpenRef.current
      ) {
        if (state?.modal === "history" && historyOpenRef.current) {
          return;
        }
        setSettingsOpen(false);
        setLogOpen(false);
        setHistoryOpen(false);
        setVoidOpen(false);
        settingsOpenRef.current = false;
        logOpenRef.current = false;
        historyOpenRef.current = false;
        voidOpenRef.current = false;
        return;
      }

      if (isLeavingSessionRef.current || isLeavingQueueRef.current) {
        return;
      }

      if (activeSessionRef.current && !activeSessionRef.current.closed) {
        if (state?.view === "chat" && state?.sessionId === activeSessionRef.current.id) {
          return;
        }
        setExitConfirm({ type: "chat" });
        exitConfirmRef.current = { type: "chat" };
        window.history.pushState(
          {
            luna: true,
            view: "chat",
            sessionId: activeSessionRef.current.id,
            modal: "exit_confirm",
          },
          "",
        );
        return;
      }

      if (listeningRef.current && !isLeavingQueueRef.current) {
        if (state?.view === "queue") {
          return;
        }
        setExitConfirm({ type: "queue" });
        exitConfirmRef.current = { type: "queue" };
        window.history.pushState(
          {
            luna: true,
            view: "queue",
            modal: "exit_confirm",
          },
          "",
        );
        return;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        const target = e.target as HTMLElement | null;
        const isInputOrTextarea =
          target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
        if (
          !isInputOrTextarea &&
          activeSessionRef.current?.closed &&
          !busyRef.current &&
          !settingsOpenRef.current &&
          !logOpenRef.current &&
          !historyOpenRef.current &&
          !voidOpenRef.current &&
          !exitConfirmRef.current
        ) {
          e.preventDefault();
          void handleNextStranger();
          return;
        }
      }

      if (e.key === "Escape") {
        if (exitConfirmRef.current) {
          e.preventDefault();
          const type = exitConfirmRef.current.type;
          setExitConfirm(null);
          exitConfirmRef.current = null;
          if (typeof window !== "undefined") {
            if (type === "chat" && activeSessionRef.current) {
              window.history.replaceState(
                { luna: true, view: "chat", sessionId: activeSessionRef.current.id },
                "",
              );
            } else if (type === "queue") {
              window.history.replaceState({ luna: true, view: "queue" }, "");
            }
          }
          return;
        }

        if (
          settingsOpenRef.current ||
          logOpenRef.current ||
          historyOpenRef.current ||
          voidOpenRef.current
        ) {
          e.preventDefault();
          closeOverlayModal();
          return;
        }

        if (activeSessionRef.current && !busyRef.current) {
          e.preventDefault();
          if (wireCutPrimed) {
            void handleLeaveSession();
          } else {
            setWireCutPrimed(true);
            setNote("Press Esc again within 2.5s to leave the chat.");
          }
          return;
        }

        if (listeningRef.current && !busyRef.current && !isLeavingQueueRef.current) {
          e.preventDefault();
          void handleLeaveQueue();
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wireCutPrimed, closeOverlayModal, handleLeaveSession, handleLeaveQueue, handleNextStranger]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePageHide = () => {
      const dId = deviceId;
      if (!dId) return;
      const sId = activeSessionRef.current?.id;
      if (sId && !activeSessionRef.current?.closed) {
        const payload = JSON.stringify({
          action: "leaveSession",
          payload: { deviceId: dId, sessionId: sId },
        });
        navigator.sendBeacon("/api/luna", new Blob([payload], { type: "application/json" }));
      } else if (listeningRef.current) {
        const payload = JSON.stringify({
          action: "leaveQueue",
          payload: { deviceId: dId },
        });
        navigator.sendBeacon("/api/luna", new Blob([payload], { type: "application/json" }));
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [deviceId]);

  const fallbackDesk: DeskView = desk ?? {
    station: { deviceId: deviceId ?? "", callsign: "----" },
    friends: [],
    inboundQsl: [],
    activeSession: null,
    queued: false,
    queuedInterests: [],
    enteredAt: null,
  };

  return (
    <div className="flex h-dvh w-full flex-col bg-zinc-950 text-zinc-100 antialiased selection:bg-white/20 select-none overflow-hidden overscroll-none">
      <PaperShell>
        <StatusHeader
          callsign={desk?.station.callsign}
          meta={
            currentSession
              ? `in session with ${currentSession.peerCallsign}`
              : listening
                ? "searching"
                : "ready"
          }
          onToggleLog={() => (logOpen ? closeOverlayModal("log") : openOverlayModal("log"))}
          logOpen={logOpen}
          soundEnabled={soundActive}
          onToggleSound={handleToggleSound}
          settingsOpen={settingsOpen}
          onToggleSettings={() =>
            settingsOpen ? closeOverlayModal("settings") : openOverlayModal("settings")
          }
          voidOpen={voidOpen}
          onToggleVoid={() => (voidOpen ? closeOverlayModal("void") : openOverlayModal("void"))}
          hasHistory={historySessions.length > 0}
          historyOpen={historyOpen}
          onToggleHistory={() =>
            historyOpen ? closeOverlayModal("history") : openOverlayModal("history")
          }
          activeChat={
            currentSession
              ? {
                  peerCallsign: currentSession.peerCallsign,
                  sessionCreatedAt: currentSession.createdAt,
                  sessionKind: currentSession.kind,
                  peerPresence: currentSession.peerPresence,
                  peerTyping: currentSession.peerTyping,
                  interests: currentSession.interests,
                }
              : undefined
          }
        />

        <NetworkBanner isOnline={isOnline} />

        {note && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-4 py-2 text-xs font-mono text-zinc-200 animate-in fade-in slide-in-from-top-1"
          >
            <span>{note}</span>
            <button
              type="button"
              onClick={() => setNote(null)}
              className="ml-3 text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {settingsOpen ? (
          <SettingsPanel
            isOpen={settingsOpen}
            desk={fallbackDesk}
            onClose={() => closeOverlayModal("settings")}
            onCallsignUpdated={handleDeskUpdate}
            onStationReset={() => {
              setDeviceId(null);
              const nextId = getOrCreateDeviceId();
              setDeviceId(nextId);
              if (nextId) void getDesk({ deviceId: nextId }).then(handleDeskUpdate).catch(() => {});
            }}
          />
        ) : logOpen ? (
          <LogPanel
            desk={fallbackDesk}
            onOpenFriend={handleOpenFriendLine}
            onRespond={handleRespondQsl}
            onClose={() => closeOverlayModal("log")}
            busy={busy}
          />
        ) : currentSession ? (
          <Chat
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
            onReport={handleReportAndBlock}
            onRetryMessage={(mid) => currentSession && runRetryMessage(mid, currentSession)}
            busy={busy}
            onReaction={(emoji) => runSendReaction(emoji, currentSession)}
            floatingReactions={floatingReactions}
            onReactionFinished={handleReactionFinished}
            onEditMessage={(mid, body) => runEditMessage(mid, body, currentSession)}
            onDeleteMessage={(mid) => runDeleteMessage(mid, currentSession)}
            onReconnect={handleReconnect}
            outboundReconnect={currentSession.outboundReconnect}
            inboundReconnect={currentSession.inboundReconnect}
          />
        ) : listening ? (
          <Searching
            key="listening-view"
            enteredAt={desk?.enteredAt ?? null}
            interests={desk?.queuedInterests ?? interests}
            onStop={handleLeaveQueue}
            onAddPopular={() => {
              const combined = Array.from(new Set([...interests, ...POPULAR_MIDNIGHT_TOPICS]));
              setInterests(combined);
              void handleJoinQueue(combined);
            }}
            onRestartSearch={() => {
              void handleJoinQueue(desk?.queuedInterests ?? interests);
            }}
            onBroadenSearch={() => {
              setInterests([]);
              void handleJoinQueue([]);
            }}
            busy={busy}
          />
        ) : (
          <Start
            interests={interests}
            onInterests={setInterests}
            onCall={() => void handleJoinQueue()}
            busy={busy}
            onlineCount={desk?.onlineCount}
            activeQueueTopics={desk?.activeQueueTopics}
          />
        )}
      </PaperShell>

      <HistoryModal
        isOpen={historyOpen}
        onClose={() => closeOverlayModal("history")}
        sessions={historySessions}
        onDeleteSession={(sid) => {
          deleteHistorySession(sid);
          setHistorySessions(loadChatHistory());
        }}
        onClearAll={() => {
          clearAllChatHistory();
          setHistorySessions([]);
        }}
      />

      {voidOpen && (
        <VoidLetters
          deviceId={deviceId ?? ""}
          onClose={() => closeOverlayModal("void")}
        />
      )}

      <WelcomeModal />

      <ExitConfirmModal
        isOpen={Boolean(exitConfirm)}
        type={exitConfirm?.type ?? "chat"}
        onCancel={() => {
          const type = exitConfirm?.type;
          setExitConfirm(null);
          exitConfirmRef.current = null;
          if (typeof window !== "undefined") {
            if (type === "chat" && activeSessionRef.current) {
              window.history.replaceState(
                { luna: true, view: "chat", sessionId: activeSessionRef.current.id },
                "",
              );
            } else if (type === "queue") {
              window.history.replaceState({ luna: true, view: "queue" }, "");
            }
          }
        }}
        onConfirm={() => {
          const type = exitConfirm?.type;
          setExitConfirm(null);
          exitConfirmRef.current = null;
          if (type === "chat") {
            void handleLeaveSession();
          } else {
            void handleLeaveQueue();
          }
        }}
      />
    </div>
  );
}
