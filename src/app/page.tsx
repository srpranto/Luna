"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Sparkles,
  Ban,
  Moon,
  HeartHandshake,
  DoorOpen,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  Download,
} from "lucide-react";
import { usePwa } from "@/components/luna/pwa-provider";
import { Composer } from "@/components/luna/composer";
import { InterestGrid } from "@/components/luna/interest-grid";
import { LogPanel } from "@/components/luna/log-panel";
import { SettingsPanel } from "@/components/luna/settings-panel";
import { PaperShell } from "@/components/luna/paper-shell";
import { StatusHeader } from "@/components/luna/status-header";
import { Transcript } from "@/components/luna/transcript";
import { StarfieldCanvas } from "@/components/luna/starfield-canvas";
import { MatchChathead } from "@/components/luna/match-chathead";
import { VoidLetters } from "@/components/luna/void-letters";
import { WelcomeModal } from "@/components/luna/welcome-modal";
import { FloatingReactionsOverlay, type FloatingItem } from "@/components/luna/floating-reactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sanitizeInterests } from "@/lib/luna/constants";
import {
  deskName,
  formatElapsed,
  getCachedCustomName,
  getOrCreateDeviceId,
} from "@/lib/luna/identity";
import {
  clearCachedMessages,
  decryptText,
  encryptText,
  loadCachedMessages,
  saveCachedMessages,
  exportDevicePublicKeyHex,
  establishSharedKey,
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
import type { ChatMessage, DeskView, MessagesPack, SessionView } from "@/lib/luna/types";
import { cn } from "@/lib/utils";

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
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The connection slipped away. Please try again.";
}

let lastTypingReport = 0;

export default function Home() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
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
  const seenReactionsRef = useRef<Set<string>>(new Set());
  const unreadRef = useRef(0);

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
    const current = new Date();
    const initialSound = isSoundEnabled();

    const t = window.setTimeout(() => {
      setDeviceId(id);
      setInterests(saved);
      setNow(current);
      setSoundActive(initialSound);
    }, 0);

    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(timer);
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
          setNote(errorMessage(err));
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

          setMessages(displayMsgs);
          saveCachedMessages(pack.session.id, displayMsgs);
          setSessionView(pack.session);

          const lastMsg = displayMsgs[displayMsgs.length - 1];
          if (lastMsg && !lastMsg.mine && !lastMsg.system) {
            playMessageReceived();
            notifyUnread(lastMsg.fromCallsign, lastMsg.body);
          }
        }
      } else if (eventType === "typing") {
        const info = data as { isTyping: boolean };
        setSessionView((prev) => (prev ? { ...prev, peerTyping: info.isTyping } : prev));
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
        setSessionView((prev) => (prev ? { ...prev, closed: true } : null));
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
        setSessionView((prev) => (prev ? { ...prev, closed: true } : null));
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
    }, 5000);

    return () => {
      cancelled = true;
      unsubscribeStream();
      window.clearInterval(pollTimer);
    };
  }, [deviceId, notifyUnread]);

  const session = desk?.activeSession ?? null;
  const listening = Boolean(desk?.queued) && !session;

  useEffect(() => {
    if (session?.id) {
      playMatchChime();
      if (session.peerPublicKey && deviceId) {
        void establishSharedKey(deviceId, session.id, session.peerPublicKey);
      }
    }
  }, [session?.id, session?.peerPublicKey, deviceId]);

  useEffect(() => {
    if (!deviceId || !session?.id) {
      return;
    }
    let cancelled = false;

    const fetchMessages = () => {
      listMessages({ deviceId, sessionId: session.id })
        .then(async (pack) => {
          if (cancelled) {
            return;
          }
          if (pack.session.peerPublicKey) {
            await establishSharedKey(deviceId, session.id, pack.session.peerPublicKey);
          }
          const decrypted = await Promise.all(
            pack.messages.map(async (m) => {
              if (m.body.startsWith("e2e:")) {
                const plain = await decryptText(m.body, session.id);
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

          const cached = loadCachedMessages(session.id);
          const map = new Map<string, ChatMessage>();
          for (const m of cached) {
            map.set(m.id, m);
          }
          for (const m of displayDecrypted) {
            map.set(m.id, m);
          }
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          saveCachedMessages(session.id, merged);
          setMessages(merged);
          setSessionView(pack.session);
        })
        .catch((err) => {
          if (!cancelled) {
            setNote(errorMessage(err));
          }
        });
    };

    fetchMessages();
    const interval = window.setInterval(fetchMessages, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [deviceId, session?.id]);

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
      } catch (error) {
        if (!cancelled) {
          setNote(errorMessage(error));
        }
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

  const waitMs =
    desk?.enteredAt && now ? Math.max(0, now.getTime() - new Date(desk.enteredAt).getTime()) : 0;

  const currentSession = sessionView ?? session;

  const sessionAgeMs =
    currentSession?.createdAt && now
      ? Math.max(0, now.getTime() - new Date(currentSession.createdAt).getTime())
      : 0;

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
        setNote(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [deviceId, busy, interests],
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
      setNote(errorMessage(err));
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

  async function handleSendMessage() {
    if (!deviceId || !session?.id || !draft.trim() || busy) {
      return;
    }
    const rawText = draft.trim();
    const isFirst = messages.length === 0 || !messages.some((m) => m.mine);
    const safety = evaluateSafety(rawText, isFirst);

    if (safety.autoBan) {
      setDraft("");
      setIsBanned(true);
      setBanReason(safety.reason ?? "Policy violation");
      try {
        await reportViolation({
          deviceId,
          sessionId: session.id,
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
          sessionId: session.id,
        });
        if (res.banned) {
          setDraft("");
          setIsBanned(true);
          setBanReason("Automated ban: Excessive 'M'/gender spam across 5 or more chats.");
          return;
        }
      } catch {}
    }

    const tempId = `opt-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      fromId: deviceId,
      fromCallsign: desk?.station.callsign ?? "You",
      body: rawText,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      mine: true,
      system: false,
      copied: false,
    };

    setDraft("");
    playMessagePop();
    setMessages((prev) => [...prev, optimisticMsg]);
    setBusy(true);

    try {
      const bodyToSend = await encryptText(rawText, session.id);

      const pack = await sendMessage({
        deviceId,
        sessionId: session.id,
        body: bodyToSend,
      });
      setNote(null);
      const decrypted = await Promise.all(
        pack.messages.map(async (m) => {
          if (m.body.startsWith("e2e:")) {
            const plain = await decryptText(m.body, session.id);
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
      const cached = loadCachedMessages(session.id);
      const map = new Map<string, ChatMessage>();
      for (const m of cached) {
        if (!m.id.startsWith("opt-")) {
          map.set(m.id, m);
        }
      }
      for (const m of displayDecrypted) {
        map.set(m.id, m);
      }
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      saveCachedMessages(session.id, merged);
      setMessages(merged);
      setSessionView(pack.session);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(rawText);
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReaction(emoji: string) {
    if (!deviceId || !session?.id) return;
    triggerFloatingReaction(emoji);
    try {
      const bodyToSend = await encryptText(`[reaction:${emoji}]`, session.id);
      await sendMessage({
        deviceId,
        sessionId: session.id,
        body: bodyToSend,
      });
    } catch {}
  }

  const handleLeaveSession = useCallback(async () => {
    if (!deviceId || busy) {
      return;
    }
    const targetSessionId = currentSession?.id;
    setBusy(true);
    playLeaveTone();
    if (targetSessionId) {
      clearCachedMessages(targetSessionId);
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
  }, [deviceId, busy, currentSession?.id]);

  const handleNextStranger = useCallback(async () => {
    if (!deviceId || busy) return;
    const targetSessionId = currentSession?.id;
    setBusy(true);
    playLeaveTone();
    if (targetSessionId) {
      clearCachedMessages(targetSessionId);
      try {
        await leaveSession({ deviceId, sessionId: targetSessionId });
      } catch {}
    }
    setMessages([]);
    setSessionView(null);
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
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [deviceId, busy, currentSession?.id, interests]);

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
    if (!deviceId || !session?.id || busy) {
      return;
    }
    setBusy(true);
    try {
      setNote(null);
      const pack = await offerQsl({
        deviceId,
        sessionId: session.id,
      });
      setMessages(pack.messages);
      setSessionView(pack.session);
      const refreshed = await getDesk({ deviceId });
      setDesk(refreshed);
    } catch (err) {
      setNote(errorMessage(err));
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
      if (session?.id) {
        const pack = await listMessages({
          deviceId,
          sessionId: session.id,
        });
        setMessages(pack.messages);
        setSessionView(pack.session);
      }
    } catch (err) {
      setNote(errorMessage(err));
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
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleTyping(isTyping: boolean) {
    if (!deviceId || !session?.id) {
      return;
    }
    const current = Date.now();
    if (isTyping && current - lastTypingReport < 1800) {
      return;
    }
    lastTypingReport = current;
    void reportTyping({ deviceId, sessionId: session.id, isTyping }).catch(() => {});
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

  const meta = currentSession
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
        }}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        settingsOpen={settingsOpen}
        onToggleSettings={() => {
          setSettingsOpen((open) => !open);
          setLogOpen(false);
        }}
        onToggleVoid={() => setVoidOpen((open) => !open)}
        activeChat={
          currentSession
            ? {
                peerCallsign: currentSession.peerCallsign,
                sessionAgeMs,
                sessionKind: currentSession.kind,
              }
            : undefined
        }
      />

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
            interests={currentSession.interests}
            messages={messages}
            now={now}
            draft={draft}
            onDraft={setDraft}
            onSend={handleSendMessage}
            onTyping={handleTyping}
            sending={busy}
            closed={currentSession.closed}
            flutter={currentSession.flutter}
            drifting={currentSession.drifting}
            reconnectRemainingSeconds={currentSession.reconnectRemainingSeconds}
            peerTyping={currentSession.peerTyping}
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
            sessionAgeMs={sessionAgeMs}
            onReaction={handleSendReaction}
            floatingReactions={floatingReactions}
            onReactionFinished={handleReactionFinished}
          />
        ) : listening ? (
          <>
            <ListeningView
              key="listening-view"
              waitMs={waitMs}
              interests={desk?.queuedInterests ?? interests}
              onStop={handleLeaveQueue}
              busy={busy}
            />
            {waitMs >= 60000 && (
              <MatchChathead
                onAddPopular={handleAddPopularTopics}
                onChangeInterests={handleLeaveQueue}
              />
            )}
          </>
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

      <WelcomeModal />
    </PaperShell>
  );
}

function BootView({
  interests,
  onInterests,
  onCall,
  busy,
}: {
  interests: string[];
  onInterests: (next: string[]) => void;
  onCall: () => void;
  busy: boolean;
}) {
  const { showInstallButton, installApp } = usePwa();

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="flex flex-col items-center text-center select-none mb-1">
        <div className="animate-fade-up inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-white/10 bg-zinc-900/70 backdrop-blur-md mb-2 sm:mb-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 tracking-wide">
            anonymous
          </span>
        </div>

        <h1 className="animate-fade-up stagger-1 text-3xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-100 to-zinc-400">
          Luna
        </h1>

        <p className="animate-fade-up stagger-2 mt-1.5 sm:mt-2 max-w-sm text-xs sm:text-sm text-zinc-400 leading-relaxed px-2">
          Late-night conversations with strangers. No account needed.
        </p>
      </div>

      <div className="animate-fade-up stagger-3 mt-4 sm:mt-6 w-full max-w-md rounded-xl sm:rounded-2xl border border-white/10 bg-zinc-950/70 p-3.5 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <InterestGrid value={interests} onChange={onInterests} />
      </div>

      <div className="animate-fade-up stagger-4 mt-5 sm:mt-6 flex flex-col items-center gap-2 w-full max-w-xs sm:max-w-none">
        <Button
          type="button"
          size="lg"
          onClick={onCall}
          disabled={busy}
          className="h-11 sm:h-12 w-full sm:w-auto px-8 sm:px-10 rounded-full font-semibold text-sm sm:text-base bg-white text-zinc-950 hover:bg-zinc-200 shadow-[0_0_30px_rgba(255,255,255,0.25)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Start Text Chat</span>
        </Button>
        <span className="hidden sm:inline-block text-[11px] font-mono text-zinc-500">
          press Enter ↵
        </span>
      </div>

      <div className="animate-fade-up stagger-5 mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-[11px] sm:text-xs text-zinc-500 text-center">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
          <span>Private & ephemeral • Disappears when you leave</span>
        </div>
        {showInstallButton && (
          <>
            <span className="hidden sm:inline text-zinc-700">•</span>
            <button
              type="button"
              onClick={installApp}
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install App</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ListeningView({
  waitMs,
  interests,
  onStop,
  busy,
}: {
  waitMs: number;
  interests: string[];
  onStop: () => void;
  busy: boolean;
}) {
  return (
    <section className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 text-center overflow-hidden">
      <StarfieldCanvas
        speed={waitMs > 15000 ? 3.5 : 2.2}
        className="absolute inset-0 pointer-events-none opacity-80"
      />

      <div className="animate-fade-up relative z-10 flex items-center justify-center w-40 h-40 sm:w-60 sm:h-60 my-2 sm:my-4">
        <div className="absolute inset-0 rounded-full border border-indigo-500/20 bg-indigo-500/5 radar-ring" />
        <div className="absolute inset-0 rounded-full border border-white/10 bg-zinc-900/10 radar-ring-delayed" />
        <div className="relative flex h-20 w-20 sm:h-28 sm:w-28 items-center justify-center rounded-full border border-indigo-400/30 bg-zinc-950/90 shadow-[0_0_50px_rgba(99,102,241,0.25),inset_0_1px_0_0_rgba(255,255,255,0.2)] backdrop-blur-md overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/15 to-transparent pointer-events-none" />
          <Moon className="h-7 w-7 sm:h-9 sm:w-9 text-zinc-100 animate-pulse drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm sm:max-w-md px-4 text-center">
        <p className="animate-fade-up stagger-1 text-base sm:text-lg font-medium text-zinc-100 tracking-tight">
          Finding someone to chat with…
        </p>

        <div className="animate-fade-up stagger-2 mt-2.5 inline-flex items-center gap-2 rounded-full bg-zinc-900/95 border border-white/15 px-3 py-1 text-xs font-mono text-zinc-200 shadow-inner">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>{formatElapsed(waitMs)}</span>
        </div>

        <p className="animate-fade-up stagger-3 mt-2 text-xs text-zinc-400">
          Traversing deep space to find a quiet mind
        </p>

        {interests.length > 0 && (
          <div className="animate-fade-up stagger-4 mt-3 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 max-w-xs sm:max-w-md">
            {interests.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="font-mono text-[10px] sm:text-xs border border-white/10 bg-zinc-900/80"
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {waitMs >= 8000 && waitMs < 60000 && (
          <div className="animate-fade-up stagger-4 mt-3.5 max-w-xs sm:max-w-sm rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs text-zinc-400 text-center leading-relaxed backdrop-blur-sm">
            <span>Still looking for a match. Try changing, adding, or removing topics.</span>
          </div>
        )}

        <div className="animate-fade-up stagger-5 mt-6 sm:mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={onStop}
            disabled={busy}
            className="h-9 sm:h-10 px-5 w-full sm:w-auto border-zinc-800 text-zinc-300 hover:text-white bg-zinc-950/80 backdrop-blur-sm text-xs sm:text-sm"
          >
            Leave the queue
          </Button>
        </div>
      </div>
    </section>
  );
}

function BannedView({ reason }: { reason?: string | null }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 sm:p-8 text-center overflow-y-auto">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-950/40 border border-red-500/20 text-red-400 mb-5 shadow-[0_0_25px_rgba(239,68,68,0.15)]">
        <Ban className="h-7 w-7" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 mb-3">
        Access Restricted
      </h2>
      <p className="max-w-md text-sm sm:text-base text-zinc-400 leading-relaxed mb-6">
        {reason ||
          "Your device has been restricted for violating Luna safety and community guidelines."}
      </p>
      <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4 max-w-sm text-xs text-zinc-400 text-left space-y-2 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        <p className="font-semibold text-zinc-200">Community Safety Standard:</p>
        <p className="text-zinc-400">
          • Unsolicited sexual talk and solicitations are strictly prohibited.
        </p>
        <p className="text-zinc-400">
          • Zero tolerance for incest, harassment, and predatory behavior.
        </p>
        <p className="text-zinc-400">
          • Spamming gender/ASL queries across chats is automatically banned.
        </p>
      </div>
      <p className="mt-8 text-xs text-zinc-600">
        Permanent restrictions applied by Luna automated moderation cannot be appealed.
      </p>
    </section>
  );
}

function LineView({
  sessionKind,
  peerCallsign,
  interests,
  messages,
  now,
  draft,
  onDraft,
  onSend,
  onTyping,
  sending,
  closed,
  flutter,
  drifting,
  reconnectRemainingSeconds,
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
  sessionAgeMs,
  onReaction,
  floatingReactions,
  onReactionFinished,
}: {
  sessionKind: "stranger" | "friend";
  peerCallsign: string;
  interests: string[];
  messages: ChatMessage[];
  now: Date | null;
  draft: string;
  onDraft: (next: string) => void;
  onSend: () => void;
  onTyping: (isTyping: boolean) => void;
  sending: boolean;
  closed: boolean;
  flutter?: boolean;
  drifting?: boolean;
  reconnectRemainingSeconds?: number;
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
  sessionAgeMs: number;
  onReaction: (emoji: string) => void;
  floatingReactions: FloatingItem[];
  onReactionFinished: (id: string) => void;
}) {
  const isLocked = !closed && sessionAgeMs < 10000;
  const lockRemainingSeconds = isLocked ? Math.max(0, 10 - Math.floor(sessionAgeMs / 1000)) : 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 sm:gap-3 border-b border-white/10 bg-zinc-950/40 px-3 py-1.5 sm:px-6 sm:py-2 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-0">
          {interests.length > 0 ? (
            <div className="flex items-center gap-1 overflow-hidden min-w-0">
              <span className="rounded-md bg-zinc-900/80 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 truncate max-w-[85px] sm:max-w-none">
                #{interests[0]}
              </span>
              {interests.length > 1 && (
                <>
                  <span className="hidden sm:inline-flex rounded-md bg-zinc-900/80 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                    #{interests[1]}
                  </span>
                  {interests.length > 2 && (
                    <span className="hidden md:inline-flex rounded-md bg-zinc-900/80 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                      #{interests[2]}
                    </span>
                  )}
                  <span className="sm:hidden rounded-md bg-zinc-900/80 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                    +{interests.length - 1}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-[11px] sm:text-xs text-zinc-500 font-mono">
              {sessionKind === "friend" ? "Direct Line" : "Open Orbit"}
            </span>
          )}

          {sessionAgeMs >= 300000 && (
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

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <FloatingReactionsOverlay items={floatingReactions} onFinished={onReactionFinished} />
        <Transcript
          messages={messages}
          now={now}
          peerCallsign={peerCallsign}
          interests={interests}
          peerTyping={peerTyping}
          flutter={flutter}
          drifting={drifting}
          reconnectRemainingSeconds={reconnectRemainingSeconds}
          closed={closed}
          onNext={onNext}
          onLeave={onLeave}
        />
      </div>

      <Composer
        value={draft}
        onChange={onDraft}
        onSend={onSend}
        onTyping={onTyping}
        onReaction={onReaction}
        disabled={closed || sending}
        placeholder={
          closed ? "This chat has ended. Click Next to search for someone." : "Say something…"
        }
        autoFocus
      />
    </section>
  );
}
