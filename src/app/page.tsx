"use client";

import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { LogPanel } from "@/components/luna/log-panel";
import { SettingsPanel } from "@/components/luna/settings-panel";
import { PaperShell } from "@/components/luna/paper-shell";
import { StatusHeader } from "@/components/luna/status-header";
import { DynamicIsland } from "@/components/luna/dynamic-island";
import { HistoryModal } from "@/components/luna/history-modal";
import { VoidLetters } from "@/components/luna/void-letters";
import { WelcomeModal } from "@/components/luna/welcome-modal";
import { BootView } from "@/components/luna/boot-view";
import { ListeningView } from "@/components/luna/listening-view";
import { BannedView } from "@/components/luna/banned-view";
import { LineView } from "@/components/luna/line-view";
import { NetworkBanner } from "@/components/luna/network-banner";
import type { FloatingItem } from "@/components/luna/floating-reactions";
import {
  IDLE_AWAY_THRESHOLD_MS,
  INACTIVITY_DISCONNECT_MS,
  sanitizeInterests,
} from "@/lib/luna/constants";
import {
  deskName,
  getCachedCustomName,
  getOrCreateDeviceId,
} from "@/lib/luna/identity";
import {
  decryptText,
  encryptText,
  saveCachedMessages,
  updateCachedMessage,
  deleteCachedMessage,
  sweepExpiredCaches,
  exportDevicePublicKeyHex,
  establishSharedKey,
  saveHistorySession,
  loadChatHistory,
  deleteHistorySession,
  clearAllChatHistory,
  destroySessionKey,
} from "@/lib/luna/crypto";
import {
  editMessage,
  deleteMessage,
  reportPresence,
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
  sendMessage,
  updateCallsign,
  subscribeDeskStream,
  recordMSpam,
  reportViolation,
} from "@/lib/luna/client";
import { evaluateSafety } from "@/lib/luna/safety";
import {
  isSoundEnabled,
  playMatchChime,
  playMessagePop,
  playMessageReceived,
  playLeaveTone,
  setSoundEnabled,
} from "@/lib/luna/sound";
import type {
  ChatMessage,
  DeskView,
  MessagesPack,
  SessionView,
  HistorySession,
} from "@/lib/luna/types";

const INTEREST_KEY = "luna.interests";
const BLOCKED_KEY = "luna.blocked";
const REACTION_REGEX = /^\[reaction:(🌙|✨)\]$/;

function readSavedInterests(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(`${INTEREST_KEY}.${deskName()}`);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeInterests(parsed);
  } catch {
    return [];
  }
}

function readBlockedStations(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function saveBlockedStation(peerId: string): void {
  if (typeof window === "undefined") {
    return;
  }
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
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("Load failed")
    ) {
      return "No internet connection. Waiting for network...";
    }
    return msg;
  }
  return "";
}

function subscribeNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getNetworkSnapshot(): boolean {
  return navigator.onLine;
}

function getNetworkServerSnapshot(): boolean {
  return true;
}

let lastTypingReport = 0;

export default function Home() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const notifyError = useCallback((err: unknown) => {
    const msg = errorMessage(err);
    if (msg) {
      setNote(msg);
    }
  }, []);

  const [desk, setDesk] = useState<DeskView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionView, setSessionView] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundActive, setSoundActive] = useState(true);
  const [wireCutPrimed, setWireCutPrimed] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingItem[]>([]);
  const [isAway, setIsAway] = useState(false);
  const [remainingIdleSeconds, setRemainingIdleSeconds] = useState(240);
  const [showDynamicIsland, setShowDynamicIsland] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; fromCallsign: string; body: string } | null>(null);
  const isOnline = useSyncExternalStore(
    subscribeNetwork,
    getNetworkSnapshot,
    getNetworkServerSnapshot,
  );
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      if (deviceId) {
        void getDesk({ deviceId }).then(setDesk).catch(() => {});
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, deviceId]);

  const seenReactionsRef = useRef<Set<string>>(new Set());
  const unreadRef = useRef(0);
  const lastActivityRef = useRef<number>(0);
  const isAwayRef = useRef(false);
  useEffect(() => {
    isAwayRef.current = isAway;
  }, [isAway]);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageAtRef = useRef<number>(0);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  const notifyUnread = useCallback((fromCallsign: string, text: string) => {
    if (typeof document !== "undefined" && document.hidden) {
      unreadRef.current += 1;
      const clean = text
        .replace(/[\r\n]+/g, " ")
        .trim()
        .slice(0, 32);
      document.title = `(${unreadRef.current}) Luna — ${fromCallsign}: ${clean}`;
    }
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (!document.hidden) {
        unreadRef.current = 0;
        document.title = "Luna — Late-Night Anonymous Chat";
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, []);

  function triggerFloatingReaction(emoji: string) {
    const id = `${Date.now()}-${Math.random()}`;
    const leftPercent = 20 + Math.random() * 60;
    setFloatingReactions((prev) => [...prev, { id, emoji, leftPercent }]);
  }

  function handleReactionFinished(id: string) {
    setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
  }

  useEffect(() => {
    const id = getOrCreateDeviceId();
    const saved = readSavedInterests();
    const initialSound = isSoundEnabled();
    lastActivityRef.current = Date.now();

    const t = window.setTimeout(() => {
      setDeviceId(id);
      setInterests(saved);
      setSoundActive(initialSound);
      sweepExpiredCaches();
      setHistorySessions(loadChatHistory());
    }, 0);

    const sweepTimer = window.setInterval(() => {
      sweepExpiredCaches();
      setHistorySessions(loadChatHistory());
    }, 3600000);

    return () => {
      window.clearTimeout(t);
      window.clearInterval(sweepTimer);
    };
  }, []);

  function handleToggleSound() {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(`${INTEREST_KEY}.${deskName()}`, JSON.stringify(interests));
  }, [interests]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }
    let cancelled = false;

    exportDevicePublicKeyHex(deviceId)
      .then((pubKey) => registerStation({ deviceId, publicKey: pubKey ?? undefined }))
      .then(async (data) => {
        if (!cancelled) {
          if (data.banned) {
            setIsBanned(true);
            setBanReason(data.banReason ?? null);
          }
          const cachedName = getCachedCustomName();
          if (cachedName && cachedName !== data.station.callsign) {
            try {
              const updated = await updateCallsign({ deviceId, callsign: cachedName });
              if (!cancelled) {
                if (updated.banned) {
                  setIsBanned(true);
                  setBanReason(updated.banReason ?? null);
                }
                setDesk(updated);
                return;
              }
            } catch {}
          }
          setDesk(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          notifyError(err);
        }
      });

    const unsubscribeStream = subscribeDeskStream(deviceId, async (eventType, data) => {
      if (cancelled) return;

      if (eventType === "message") {
        const pack = data as MessagesPack;
        if (pack.session?.id) {
          if (pack.session.peerPublicKey) {
            await establishSharedKey(deviceId, pack.session.id, pack.session.peerPublicKey);
          }
          const decrypted = await Promise.all(
            pack.messages.map(async (m) => {
              if (m.body.startsWith("e2e:")) {
                const plain = await decryptText(m.body, pack.session.id);
                if (!m.mine && !m.system) {
                  const peerSafety = evaluateSafety(plain, false);
                  if (peerSafety.autoBan) {
                    void reportViolation({
                      deviceId,
                      peerId: pack.session.peerId,
                      sessionId: pack.session.id,
                      violation: peerSafety.severity,
                      sample: plain.slice(0, 100),
                    });
                  }
                }
                return { ...m, body: plain };
              }
              return m;
            }),
          );

          const displayMsgs: ChatMessage[] = [];
          for (const m of decrypted) {
            const match = m.body.match(REACTION_REGEX);
            if (match && match[1]) {
              if (!m.mine && !seenReactionsRef.current.has(m.id)) {
                seenReactionsRef.current.add(m.id);
                triggerFloatingReaction(match[1]);
              }
            } else {
              displayMsgs.push(m);
            }
          }

          setMessages((prev) => {
            const map = new Map<string, ChatMessage>();
            for (const m of displayMsgs) {
              map.set(m.id, m);
            }
            for (const m of prev) {
              if (m.id.startsWith("opt-") && !map.has(m.id)) {
                map.set(m.id, m);
              }
            }
            const merged = Array.from(map.values()).sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
            saveCachedMessages(pack.session.id, displayMsgs);
            return merged;
          });
          setSessionView(pack.session);

          if (displayMsgs.length > 0) {
            const lastMsg = displayMsgs[displayMsgs.length - 1];
            saveHistorySession({
              sessionId: pack.session.id,
              peerCallsign: pack.session.peerCallsign,
              startedAt: new Date(pack.session.createdAt).getTime(),
              savedAt: Date.now(),
              messageCount: displayMsgs.length,
              preview: lastMsg?.body ?? "",
              interests: pack.session.interests,
              messages: displayMsgs,
            });
            setHistorySessions(loadChatHistory());
          }

          const lastMsg = displayMsgs[displayMsgs.length - 1];
          if (lastMsg && !lastMsg.mine && !lastMsg.system) {
            playMessageReceived();
            notifyUnread(lastMsg.fromCallsign, lastMsg.body);
          }
        }
      } else if (eventType === "message_edited") {
        const pack = data as MessagesPack;
        if (pack.session?.id) {
          const decrypted = await Promise.all(
            pack.messages.map(async (m) => {
              if (m.body.startsWith("e2e:")) {
                const plain = await decryptText(m.body, pack.session.id);
                return { ...m, body: plain };
              }
              return m;
            }),
          );
          const displayMsgs = decrypted.filter((m) => !REACTION_REGEX.test(m.body));
          setMessages(displayMsgs);
          saveCachedMessages(pack.session.id, displayMsgs);
          if (displayMsgs.length > 0) {
            const lastMsg = displayMsgs[displayMsgs.length - 1];
            saveHistorySession({
              sessionId: pack.session.id,
              peerCallsign: pack.session.peerCallsign,
              startedAt: new Date(pack.session.createdAt).getTime(),
              savedAt: Date.now(),
              messageCount: displayMsgs.length,
              preview: lastMsg?.body ?? "",
              interests: pack.session.interests,
              messages: displayMsgs,
            });
            setHistorySessions(loadChatHistory());
          }
        }
      } else if (eventType === "message_deleted") {
        const info = data as { sessionId: string; messageId: string };
        setMessages((prev) => prev.filter((m) => m.id !== info.messageId));
        if (info.sessionId) {
          deleteCachedMessage(info.sessionId, info.messageId);
        }
      } else if (eventType === "presence_update") {
        const info = data as { sessionId: string; peerId: string; isAway: boolean };
        setSessionView((prev) => {
          if (!prev || prev.id !== info.sessionId) return prev;
          return {
            ...prev,
            peerIsAway: info.isAway,
            peerPresence: prev.closed ? "disconnected" : info.isAway ? "away" : "active",
          };
        });
      } else if (eventType === "typing") {
        const info = data as { isTyping: boolean };
        setSessionView((prev) => (prev ? { ...prev, peerTyping: info.isTyping } : prev));
        if (peerTypingTimeoutRef.current) {
          clearTimeout(peerTypingTimeoutRef.current);
          peerTypingTimeoutRef.current = null;
        }
        if (info.isTyping) {
          peerTypingTimeoutRef.current = setTimeout(() => {
            setSessionView((prev) => (prev ? { ...prev, peerTyping: false } : prev));
          }, 3000);
        }
      } else if (eventType === "session_started") {
        const info = data as { sessionId: string; desk?: DeskView };
        if (info.desk) {
          setDesk(info.desk);
        } else {
          getDesk({ deviceId })
            .then((d) => !cancelled && setDesk(d))
            .catch(() => {});
        }
        playMatchChime();
      } else if (eventType === "session_ended") {
        const info = data as { sessionId: string; desk?: DeskView };
        if (info.desk) {
          setDesk(info.desk);
        }
        setSessionView((prev) =>
          prev ? { ...prev, closed: true, peerPresence: "disconnected" } : null,
        );
        playLeaveTone();
      } else if (eventType === "banned") {
        const info = data as { reason?: string };
        setIsBanned(true);
        setBanReason(info.reason ?? "Access restricted.");
        setSessionView(null);
      } else if (eventType === "peer_banned") {
        const info = data as { reason?: string };
        setNote(
          info.reason ??
            "The other user was removed and banned for violating community safety guidelines.",
        );
        setSessionView((prev) =>
          prev ? { ...prev, closed: true, peerPresence: "disconnected" } : null,
        );
      } else if (eventType === "desk_update" || eventType === "friend_request") {
        const refreshed = data as DeskView;
        if (refreshed && refreshed.station) {
          if (refreshed.banned) {
            setIsBanned(true);
            setBanReason(refreshed.banReason ?? null);
          }
          setDesk(refreshed);
        }
      }
    });

    const pollTimer = window.setInterval(() => {
      getDesk({ deviceId })
        .then((data) => {
          if (!cancelled) {
            if (data.banned) {
              setIsBanned(true);
              setBanReason(data.banReason ?? null);
            }
            setDesk(data);
          }
        })
        .catch(() => {});
    }, 15000);

    return () => {
      cancelled = true;
      unsubscribeStream();
      window.clearInterval(pollTimer);
      if (peerTypingTimeoutRef.current) {
        clearTimeout(peerTypingTimeoutRef.current);
      }
    };
  }, [deviceId, notifyUnread, notifyError]);

  const session = desk?.activeSession ?? null;
  const currentSession = sessionView ?? session;
  const listening = Boolean(desk?.queued) && !currentSession;

  useEffect(() => {
    lastMessageAtRef.current = Date.now();
  }, [currentSession?.id, messages.length]);

  useEffect(() => {
    if (currentSession?.id) {
      playMatchChime();
      if (currentSession.peerPublicKey && deviceId) {
        void establishSharedKey(deviceId, currentSession.id, currentSession.peerPublicKey);
      }
    }
  }, [currentSession?.id, currentSession?.peerPublicKey, deviceId]);

  useEffect(() => {
    if (!deviceId || !currentSession?.id) {
      return;
    }
    let cancelled = false;

    const fetchMessages = () => {
      listMessages({ deviceId, sessionId: currentSession.id })
        .then(async (pack) => {
          if (cancelled) {
            return;
          }
          if (pack.session.peerPublicKey) {
            await establishSharedKey(deviceId, currentSession.id, pack.session.peerPublicKey);
          }
          const decrypted = await Promise.all(
            pack.messages.map(async (m) => {
              if (m.body.startsWith("e2e:")) {
                const plain = await decryptText(m.body, currentSession.id);
                return { ...m, body: plain };
              }
              return m;
            }),
          );

          const displayDecrypted: ChatMessage[] = [];
          for (const m of decrypted) {
            const match = m.body.match(REACTION_REGEX);
            if (match && match[1]) {
              if (!m.mine && !seenReactionsRef.current.has(m.id)) {
                seenReactionsRef.current.add(m.id);
                triggerFloatingReaction(match[1]);
              }
            } else {
              displayDecrypted.push(m);
            }
          }

          setMessages((prev) => {
            const map = new Map<string, ChatMessage>();
            for (const m of displayDecrypted) {
              map.set(m.id, m);
            }
            for (const m of prev) {
              if (m.id.startsWith("opt-") && !map.has(m.id)) {
                map.set(m.id, m);
              }
            }
            const merged = Array.from(map.values()).sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
            saveCachedMessages(currentSession.id, merged);
            return merged;
          });
          setSessionView(pack.session);

          if (displayDecrypted.length > 0) {
            const lastMsg = displayDecrypted[displayDecrypted.length - 1];
            saveHistorySession({
              sessionId: currentSession.id,
              peerCallsign: pack.session.peerCallsign,
              startedAt: new Date(pack.session.createdAt).getTime(),
              savedAt: Date.now(),
              messageCount: displayDecrypted.length,
              preview: lastMsg?.body ?? "",
              interests: pack.session.interests,
              messages: displayDecrypted,
            });
            setHistorySessions(loadChatHistory());
          }
        })
        .catch(() => {});
    };

    fetchMessages();
    const interval = window.setInterval(fetchMessages, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [deviceId, currentSession?.id]);

  useEffect(() => {
    if (!deviceId || !listening) {
      return;
    }
    let cancelled = false;

    const tick = async () => {
      try {
        const blocked = readBlockedStations();
        const result = await heartbeatQueue({ deviceId, blockedIds: blocked });
        if (cancelled) {
          return;
        }
        setDesk(result.desk);
      } catch {
        return;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [deviceId, listening]);

  useEffect(() => {
    if (!wireCutPrimed) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWireCutPrimed(false);
      setNote((prev) => (prev?.includes("Esc again") ? null : prev));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [wireCutPrimed]);


  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowDynamicIsland(false);
    if (isAwayRef.current) {
      setIsAway(false);
      if (deviceId && currentSession?.id) {
        void reportPresence({ deviceId, sessionId: currentSession.id, isAway: false });
      }
    }
  }, [deviceId, currentSession]);

  const handleDraftChange = useCallback(
    (next: string) => {
      setDraft(next);
      resetIdle();
    },
    [resetIdle],
  );

  const handleJoinQueue = useCallback(
    async (overrideInterests?: unknown) => {
      if (!deviceId || busy) {
        return;
      }
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
    },
    [deviceId, busy, interests, notifyError],
  );

  async function handleLeaveQueue() {
    if (!deviceId || busy) {
      return;
    }
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
  }

  const POPULAR_MIDNIGHT_TOPICS = [
    "quiet thoughts",
    "sleeplessness",
    "nostalgia",
    "music",
    "life questions",
  ];

  function handleAddPopularTopics() {
    const combined = Array.from(new Set([...interests, ...POPULAR_MIDNIGHT_TOPICS]));
    setInterests(combined);
    void handleJoinQueue(combined);
  }

  const handleLeaveSession = useCallback(async () => {
    if (!deviceId || busy) {
      return;
    }
    const targetSessionId = currentSession?.id;
    setBusy(true);
    playLeaveTone();
    setShowDynamicIsland(false);
    setIsAway(false);
    setReplyingTo(null);
    if (targetSessionId) {
      destroySessionKey(targetSessionId);
      try {
        setNote(null);
        const next = await leaveSession({
          deviceId,
          sessionId: targetSessionId,
        });
        setDesk(next);
      } catch {
        try {
          const freshDesk = await getDesk({ deviceId });
          setDesk(freshDesk);
        } catch {}
      }
    }
    setMessages([]);
    setSessionView(null);
    setBusy(false);
    setHistorySessions(loadChatHistory());
  }, [deviceId, busy, currentSession?.id]);

  const handleNextStranger = useCallback(async () => {
    if (!deviceId || busy) return;
    const targetSessionId = currentSession?.id;
    setBusy(true);
    playLeaveTone();
    setShowDynamicIsland(false);
    setIsAway(false);
    setReplyingTo(null);
    if (targetSessionId) {
      destroySessionKey(targetSessionId);
      try {
        await leaveSession({ deviceId, sessionId: targetSessionId });
      } catch {}
    }
    setMessages([]);
    setSessionView(null);
    setHistorySessions(loadChatHistory());
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
  }, [deviceId, busy, currentSession?.id, interests, notifyError]);

  useEffect(() => {
    if (!currentSession?.id || currentSession.closed) {
      return;
    }

    function evaluateIdle() {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_DISCONNECT_MS) {
        setShowDynamicIsland(false);
        void handleLeaveSession();
      } else if (elapsed >= IDLE_AWAY_THRESHOLD_MS) {
        const remaining = Math.max(0, Math.ceil((INACTIVITY_DISCONNECT_MS - elapsed) / 1000));
        setRemainingIdleSeconds(remaining);
        setShowDynamicIsland(true);
        if (!isAwayRef.current) {
          setIsAway(true);
          if (deviceId && currentSession?.id) {
            void reportPresence({ deviceId, sessionId: currentSession.id, isAway: true }).catch(() => {});
          }
        }
      } else {
        setShowDynamicIsland(false);
        if (isAwayRef.current) {
          setIsAway(false);
          if (deviceId && currentSession?.id) {
            void reportPresence({ deviceId, sessionId: currentSession.id, isAway: false }).catch(() => {});
          }
        }
      }
    }

    function onActivity() {
      resetIdle();
    }

    function onVisibility() {
      if (!document.hidden) {
        evaluateIdle();
      }
    }

    function onFocus() {
      evaluateIdle();
    }

    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    evaluateIdle();
    const interval = window.setInterval(evaluateIdle, 1000);

    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [currentSession?.id, currentSession?.closed, currentSession?.kind, deviceId, handleLeaveSession, handleNextStranger, resetIdle]);

  async function handleSendMessage() {
    if (!isOnline) {
      setNote("You're offline. Reconnect to send messages.");
      return;
    }
    const activeSessionId = currentSession?.id;
    if (!deviceId || !activeSessionId || !draft.trim() || currentSession?.closed) {
      return;
    }
    resetIdle();
    lastMessageAtRef.current = Date.now();
    const rawText = draft.trim();
    let textToSend = rawText;
    if (replyingTo) {
      const quoteSnippet = replyingTo.body.replace(/[\r\n]+/g, " ").slice(0, 100);
      textToSend = `> ${replyingTo.fromCallsign}: ${quoteSnippet}\n${rawText}`;
      setReplyingTo(null);
    }
    const isFirst = messages.length === 0 || !messages.some((m) => m.mine);
    const safety = evaluateSafety(textToSend, isFirst);

    if (safety.autoBan) {
      setDraft("");
      setIsBanned(true);
      setBanReason(safety.reason ?? "Policy violation");
      try {
        await reportViolation({
          deviceId,
          sessionId: activeSessionId,
          violation: safety.severity,
          sample: rawText.slice(0, 100),
        });
      } catch {}
      return;
    }

    if (safety.severity === "m_spam") {
      try {
        const res = await recordMSpam({
          deviceId,
          sessionId: activeSessionId,
        });
        if (res.banned) {
          setDraft("");
          setIsBanned(true);
          setBanReason("Automated ban: Excessive 'M'/gender spam across 5 or more chats.");
          return;
        }
      } catch {}
    }

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      fromId: deviceId,
      fromCallsign: desk?.station.callsign ?? "You",
      body: textToSend,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      mine: true,
      system: false,
      copied: false,
    };

    setDraft("");
    playMessagePop();
    setMessages((prev) => [...prev, optimisticMsg]);

    sendQueueRef.current = sendQueueRef.current.then(async () => {
      try {
        const bodyToSend = await encryptText(textToSend, activeSessionId);

        const pack = await sendMessage({
          deviceId,
          sessionId: activeSessionId,
          body: bodyToSend,
        });
        if (pack.session?.closed) {
          setSessionView(pack.session);
          return;
        }
        const decrypted = await Promise.all(
          pack.messages.map(async (m) => {
            if (m.body.startsWith("e2e:")) {
              const plain = await decryptText(m.body, activeSessionId);
              return { ...m, body: plain };
            }
            return m;
          }),
        );
        const displayDecrypted: ChatMessage[] = [];
        for (const m of decrypted) {
          if (!REACTION_REGEX.test(m.body)) {
            displayDecrypted.push(m);
          }
        }
        setMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          for (const m of displayDecrypted) {
            map.set(m.id, m);
          }
          for (const m of prev) {
            if (m.id.startsWith("opt-") && m.id !== tempId) {
              if (!map.has(m.id)) {
                map.set(m.id, m);
              }
            }
          }
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          saveCachedMessages(activeSessionId, merged);
          return merged;
        });
        setSessionView(pack.session);

        saveHistorySession({
          sessionId: activeSessionId,
          peerCallsign: pack.session.peerCallsign,
          startedAt: new Date(pack.session.createdAt).getTime(),
          savedAt: Date.now(),
          messageCount: displayDecrypted.length,
          preview: rawText,
          interests: pack.session.interests,
          messages: displayDecrypted,
        });
        setHistorySessions(loadChatHistory());
      } catch (err) {
        const msg = errorMessage(err);
        if (msg.includes("ended") || msg.includes("closed") || msg.includes("not found")) {
          setSessionView((prev) => (prev ? { ...prev, closed: true } : null));
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
        }
      }
    });
  }

  async function handleEditMessage(messageId: string, newBody: string) {
    const activeSessionId = currentSession?.id;
    if (!deviceId || !activeSessionId || !newBody.trim()) return;
    resetIdle();
    try {
      const encrypted = await encryptText(newBody.trim(), activeSessionId);
      await editMessage({
        deviceId,
        sessionId: activeSessionId,
        messageId,
        body: encrypted,
      });
      const nowIso = new Date().toISOString();
      const nextMsgs = messages.map((m) =>
        m.id === messageId ? { ...m, body: newBody.trim(), editedAt: nowIso } : m,
      );
      setMessages(nextMsgs);
      updateCachedMessage(activeSessionId, messageId, newBody.trim());

      saveHistorySession({
        sessionId: activeSessionId,
        peerCallsign: currentSession?.peerCallsign ?? "Stranger",
        startedAt: currentSession?.createdAt
          ? new Date(currentSession.createdAt).getTime()
          : Date.now(),
        savedAt: Date.now(),
        messageCount: nextMsgs.length,
        preview: nextMsgs[nextMsgs.length - 1]?.body ?? "",
        interests: currentSession?.interests ?? [],
        messages: nextMsgs,
      });
      setHistorySessions(loadChatHistory());
    } catch (err) {
      notifyError(err);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    const activeSessionId = currentSession?.id;
    if (!deviceId || !activeSessionId) return;
    resetIdle();
    try {
      await deleteMessage({
        deviceId,
        sessionId: activeSessionId,
        messageId,
      });
      const nextMsgs = messages.filter((m) => m.id !== messageId);
      setMessages(nextMsgs);
      deleteCachedMessage(activeSessionId, messageId);

      if (nextMsgs.length > 0) {
        saveHistorySession({
          sessionId: activeSessionId,
          peerCallsign: currentSession?.peerCallsign ?? "Stranger",
          startedAt: currentSession?.createdAt
            ? new Date(currentSession.createdAt).getTime()
            : Date.now(),
          savedAt: Date.now(),
          messageCount: nextMsgs.length,
          preview: nextMsgs[nextMsgs.length - 1]?.body ?? "",
          interests: currentSession?.interests ?? [],
          messages: nextMsgs,
        });
      } else {
        deleteHistorySession(activeSessionId);
      }
      setHistorySessions(loadChatHistory());
    } catch (err) {
      notifyError(err);
    }
  }

  async function handleSendReaction(emoji: string) {
    const activeSessionId = currentSession?.id;
    if (!deviceId || !activeSessionId) return;
    resetIdle();
    triggerFloatingReaction(emoji);
    try {
      const bodyToSend = await encryptText(`[reaction:${emoji}]`, activeSessionId);
      await sendMessage({
        deviceId,
        sessionId: activeSessionId,
        body: bodyToSend,
      });
    } catch {}
  }

  async function handleSeverAndBlock() {
    if (!deviceId || busy) {
      return;
    }
    const peerId = currentSession?.peerId;
    if (peerId) {
      saveBlockedStation(peerId);
    }
    await handleLeaveSession();
    setNote("Chat ended. You will not be matched with this stranger again.");
  }

  async function handleOfferQsl() {
    const activeSessionId = currentSession?.id;
    if (!deviceId || !activeSessionId || busy) {
      return;
    }
    setBusy(true);
    try {
      setNote(null);
      const pack = await offerQsl({
        deviceId,
        sessionId: activeSessionId,
      });
      setMessages(pack.messages);
      setSessionView(pack.session);
      const refreshed = await getDesk({ deviceId });
      setDesk(refreshed);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRespondQsl(requestId: string, accept: boolean) {
    if (!deviceId || busy) {
      return;
    }
    setBusy(true);
    try {
      setNote(null);
      const next = await respondQsl({ deviceId, requestId, accept });
      setDesk(next);
      if (currentSession?.id) {
        const pack = await listMessages({
          deviceId,
          sessionId: currentSession.id,
        });
        setMessages(pack.messages);
        setSessionView(pack.session);
      }
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenFriendLine(friendId: string) {
    if (!deviceId || busy) {
      return;
    }
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
  }

  function handleTyping(isTyping: boolean) {
    const activeSessionId = currentSession?.id;
    if (!deviceId || !activeSessionId) {
      return;
    }
    const current = Date.now();
    if (isTyping && current - lastTypingReport < 1800) {
      return;
    }
    lastTypingReport = current;
    void reportTyping({ deviceId, sessionId: activeSessionId, isTyping }).catch(() => {});
  }

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
        }
      } else if (e.key === "Enter") {
        if (currentSession?.closed) {
          e.preventDefault();
          void handleNextStranger();
        } else if (!currentSession?.id && !desk?.queued) {
          if (!busy && deviceId) {
            const activeEl = document.activeElement;
            if (activeEl?.tagName !== "BUTTON" && activeEl?.tagName !== "INPUT") {
              e.preventDefault();
              void handleJoinQueue();
            }
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentSession,
    wireCutPrimed,
    busy,
    deviceId,
    desk?.queued,
    handleJoinQueue,
    handleLeaveSession,
    handleNextStranger,
  ]);

  const inboundOnLine = currentSession?.inboundQsl;

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
          setLogOpen((open) => !open);
          setSettingsOpen(false);
          setHistoryOpen(false);
        }}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        settingsOpen={settingsOpen}
        onToggleSettings={() => {
          setSettingsOpen((open) => !open);
          setLogOpen(false);
          setHistoryOpen(false);
        }}
        onToggleVoid={() => setVoidOpen((open) => !open)}
        hasHistory={historySessions.length > 0}
        historyOpen={historyOpen}
        onToggleHistory={() => {
          setHistoryOpen((open) => !open);
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

      <DynamicIsland
        show={showDynamicIsland && Boolean(currentSession?.id) && !currentSession?.closed}
        remainingSeconds={remainingIdleSeconds}
        onStayConnected={resetIdle}
      />

      <NetworkBanner isOnline={isOnline} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isBanned || desk?.banned ? (
          <BannedView reason={banReason ?? desk?.banReason} />
        ) : settingsOpen && desk ? (
          <SettingsPanel
            desk={desk}
            onClose={() => setSettingsOpen(false)}
            onCallsignUpdated={(updated) => setDesk(updated)}
            onStationReset={() => {
              const newDid = getOrCreateDeviceId();
              setDeviceId(newDid);
              setDesk(null);
              setReplyingTo(null);
              setMessages([]);
              setSessionView(null);
              void registerStation({ deviceId: newDid })
                .then(setDesk)
                .catch(() => {});
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
            inbound={inboundOnLine ?? null}
            onQsl={handleOfferQsl}
            onAcceptInbound={() => {
              if (inboundOnLine?.id) {
                void handleRespondQsl(inboundOnLine.id, true);
              }
            }}
            onDeclineInbound={() => {
              if (inboundOnLine?.id) {
                void handleRespondQsl(inboundOnLine.id, false);
              }
            }}
            onLeave={handleLeaveSession}
            onNext={handleNextStranger}
            onBlock={handleSeverAndBlock}
            busy={busy}
            onReaction={handleSendReaction}
            floatingReactions={floatingReactions}
            onReactionFinished={handleReactionFinished}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
          />
        ) : listening ? (
          <ListeningView
            key="listening-view"
            enteredAt={desk?.enteredAt ?? null}
            interests={desk?.queuedInterests ?? interests}
            onStop={handleLeaveQueue}
            onAddPopular={handleAddPopularTopics}
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
        <div
          className="border-t border-white/10 bg-zinc-950/90 px-4 py-2 text-xs text-zinc-300 flex items-center justify-between"
          role="status"
        >
          <span>{note}</span>
          <button
            type="button"
            onClick={() => setNote(null)}
            className="text-zinc-500 hover:text-zinc-200 text-xs ml-2 cursor-pointer"
          >
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

