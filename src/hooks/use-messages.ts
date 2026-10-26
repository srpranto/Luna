"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage, HistorySession, MessagesPack, SessionView } from "@/lib/types";
export interface FloatingItem {
  id: string;
  emoji: string;
  leftPercent: number;
}
import {
  decryptText,
  encryptText,
  loadCachedMessages,
  saveCachedMessages,
  updateCachedMessage,
  deleteCachedMessage,
  establishSharedKey,
  saveHistorySession,
  loadChatHistory,
  deleteHistorySession,
} from "@/lib/encryption";
import {
  sendMessage as apiSendMessage,
  editMessage as apiEditMessage,
  deleteMessage as apiDeleteMessage,
} from "@/lib/api-client";
import { playMessagePop, playMessageReceived, triggerHaptic } from "@/lib/sound-effects";
import { notifyUser, clearNotificationBadge } from "@/lib/notifications";

const REACTION_REGEX = /^\[reaction:(.+?)\]$/u;

interface UseMessagesOptions {
  deviceId: string | null;
  sessionId?: string | null;
  onActivity?: () => void;
  onHistoryUpdated?: (sessions: HistorySession[]) => void;
  onSessionEndedNotice?: () => void;
}

export function useMessages({
  deviceId,
  sessionId,
  onActivity,
  onHistoryUpdated,
  onSessionEndedNotice,
}: UseMessagesOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (sessionId) {
      return loadCachedMessages(sessionId);
    }
    return [];
  });
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingItem[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; fromCallsign: string; body: string } | null>(null);

  const hydrateCached = useCallback((sid: string) => {
    const cached = loadCachedMessages(sid);
    if (cached.length > 0) {
      setMessages(cached);
    }
    return cached;
  }, []);

  useEffect(() => {
    if (sessionId) {
      queueMicrotask(() => {
        hydrateCached(sessionId);
      });
    }
  }, [sessionId, hydrateCached]);

  const seenReactionsRef = useRef<Set<string>>(new Set());
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const unreadRef = useRef(0);

  const triggerFloatingReaction = useCallback((emoji: string) => {
    const id = crypto.randomUUID();
    const leftPercent = 20 + Math.random() * 60;
    setFloatingReactions((prev) => [...prev, { id, emoji, leftPercent }]);
  }, []);

  const handleReactionFinished = useCallback((id: string) => {
    setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notifyUnread = useCallback((fromCallsign: string, text: string) => {
    unreadRef.current += 1;
    const clean = text.replace(/[\r\n]+/g, " ").trim().slice(0, 48);
    notifyUser({
      title: `Message from ${fromCallsign}`,
      body: clean || "Encrypted message received",
      type: "message",
      tag: "luna-message",
    });
  }, []);

  const clearUnread = useCallback(() => {
    unreadRef.current = 0;
    clearNotificationBadge();
  }, []);

  const decryptPack = useCallback(async (pack: MessagesPack, targetDeviceId: string) => {
    if (pack.session.peerPublicKey) {
      await establishSharedKey(targetDeviceId, pack.session.id, pack.session.peerPublicKey);
    }
    const decrypted = await Promise.all(
      pack.messages.map(async (m) => {
        if (m.body.startsWith("e2e:")) {
          const plain = await decryptText(m.body, pack.session.id);
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
    return displayMsgs;
  }, [triggerFloatingReaction]);

  const mergeAndStoreMessages = useCallback(
    (sessionId: string, session: SessionView, incoming: ChatMessage[], isSoundNotification = false) => {
      setMessages((prev) => {
        const incomingById = new Map<string, ChatMessage>();
        const incomingByClientMsgId = new Map<string, ChatMessage>();
        for (const m of incoming) {
          incomingById.set(m.id, m);
          if (m.clientMsgId) {
            incomingByClientMsgId.set(m.clientMsgId, m);
          }
        }

        const matchedOptIds = new Set<string>();
        const optToConfirmed = new Map<string, ChatMessage>();

        for (const inc of incoming) {
          const isMine = inc.mine || (deviceId && inc.fromId === deviceId);
          if (isMine) {
            const matchingOpt = prev.find(
              (p) =>
                (p.clientMsgId && p.clientMsgId === inc.clientMsgId) ||
                p.id === inc.clientMsgId ||
                p.id === inc.id ||
                (p.id.startsWith("opt-") && p.mine && p.body === inc.body && !matchedOptIds.has(p.id)),
            );
            if (matchingOpt) {
              matchedOptIds.add(matchingOpt.id);
              optToConfirmed.set(matchingOpt.id, inc);
            }
          }
        }

        const resultMap = new Map<string, ChatMessage>();

        for (const m of prev) {
          if (matchedOptIds.has(m.id)) {
            const confirmed = optToConfirmed.get(m.id);
            if (confirmed) {
              resultMap.set(confirmed.id, confirmed);
            }
          } else if (incomingById.has(m.id)) {
            resultMap.set(m.id, incomingById.get(m.id)!);
          } else if (m.clientMsgId && incomingByClientMsgId.has(m.clientMsgId)) {
            const confirmed = incomingByClientMsgId.get(m.clientMsgId)!;
            resultMap.set(confirmed.id, confirmed);
          } else {
            resultMap.set(m.id, m);
          }
        }

        for (const inc of incoming) {
          if (!resultMap.has(inc.id)) {
            resultMap.set(inc.id, inc);
          }
        }

        const merged = Array.from(resultMap.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        saveCachedMessages(sessionId, merged);

        if (merged.length > 0 && session) {
          const lastMsg = merged[merged.length - 1];
          saveHistorySession({
            sessionId,
            peerCallsign: session.peerCallsign ?? "Stranger",
            startedAt: session.createdAt ? new Date(session.createdAt).getTime() : Date.now(),
            savedAt: Date.now(),
            messageCount: merged.length,
            preview: lastMsg?.body ?? "",
            interests: session.interests,
            messages: merged,
          });
          queueMicrotask(() => onHistoryUpdated?.(loadChatHistory()));
        }

        return merged;
      });

      if (isSoundNotification && incoming.length > 0) {
        const lastMsg = incoming[incoming.length - 1];
        if (lastMsg && !lastMsg.mine && !lastMsg.system) {
          onActivity?.();
          playMessageReceived();
          triggerHaptic("message-received");
          notifyUnread(lastMsg.fromCallsign, lastMsg.body);
        }
      }
    },
    [deviceId, notifyUnread, onActivity, onHistoryUpdated],
  );

  const handleSendMessage = useCallback(
    async (text: string, currentSession: SessionView, senderCallsign: string) => {
      if (!deviceId || !currentSession.id || !text.trim() || currentSession.closed) return;

      onActivity?.();
      const rawText = text.trim();
      let textToSend = rawText;
      if (replyingTo) {
        const quoteSnippet = replyingTo.body.replace(/[\r\n]+/g, " ").slice(0, 100);
        textToSend = `> ${replyingTo.fromCallsign}: ${quoteSnippet}\n${rawText}`;
        setReplyingTo(null);
      }

      const currentMsgs = messagesRef.current;
      const lastTimestamp =
        currentMsgs.length > 0 ? new Date(currentMsgs[currentMsgs.length - 1]!.createdAt).getTime() : 0;
      const optimisticCreatedAt = new Date(Math.max(Date.now(), lastTimestamp + 1)).toISOString();

      const clientMsgId = crypto.randomUUID();
      const optimisticMsg: ChatMessage = {
        id: clientMsgId,
        clientMsgId,
        fromId: deviceId,
        fromCallsign: senderCallsign,
        body: textToSend,
        createdAt: optimisticCreatedAt,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        mine: true,
        system: false,
        copied: false,
        status: "sending",
      };

      playMessagePop();
      triggerHaptic("message-sent");
      setMessages((prev) => [...prev, optimisticMsg]);

      sendQueueRef.current = sendQueueRef.current
        .catch(() => {})
        .then(async () => {
          try {
            if (currentSession.peerPublicKey) {
              await establishSharedKey(deviceId, currentSession.id, currentSession.peerPublicKey);
            }
            const bodyToSend = await encryptText(textToSend, currentSession.id);
            const pack = await apiSendMessage({
              deviceId,
              sessionId: currentSession.id,
              body: bodyToSend,
              clientMsgId,
            });

            if (pack.session?.closed) {
              onSessionEndedNotice?.();
              return;
            }

            const displayMsgs = await decryptPack(pack, deviceId);
            mergeAndStoreMessages(currentSession.id, pack.session, displayMsgs, false);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("ended") || msg.includes("closed") || msg.includes("not found")) {
              onSessionEndedNotice?.();
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === clientMsgId || m.clientMsgId === clientMsgId
                    ? { ...m, status: "failed" }
                    : m,
                ),
              );
            }
          }
        });
    },
    [deviceId, replyingTo, onActivity, decryptPack, mergeAndStoreMessages, onSessionEndedNotice],
  );

  const handleRetryMessage = useCallback(
    async (messageId: string, currentSession: SessionView) => {
      const target = messages.find((m) => m.id === messageId || m.clientMsgId === messageId);
      if (!target || !deviceId || !currentSession.id || currentSession.closed) return;

      const clientMsgId = target.clientMsgId || target.id;
      const textToSend = target.body;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.id ? { ...m, status: "sending" } : m,
        ),
      );

      sendQueueRef.current = sendQueueRef.current
        .catch(() => {})
        .then(async () => {
          try {
            if (currentSession.peerPublicKey) {
              await establishSharedKey(deviceId, currentSession.id, currentSession.peerPublicKey);
            }
            const bodyToSend = await encryptText(textToSend, currentSession.id);
            const pack = await apiSendMessage({
              deviceId,
              sessionId: currentSession.id,
              body: bodyToSend,
              clientMsgId,
            });

            if (pack.session?.closed) {
              onSessionEndedNotice?.();
              return;
            }

            const displayMsgs = await decryptPack(pack, deviceId);
            mergeAndStoreMessages(currentSession.id, pack.session, displayMsgs, false);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("ended") || msg.includes("closed") || msg.includes("not found")) {
              onSessionEndedNotice?.();
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === target.id || m.clientMsgId === target.id
                    ? { ...m, status: "failed" }
                    : m,
                ),
              );
            }
          }
        });
    },
    [deviceId, messages, decryptPack, mergeAndStoreMessages, onSessionEndedNotice],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, newBody: string, currentSession: SessionView) => {
      if (!deviceId || !currentSession.id || !newBody.trim()) return;
      onActivity?.();
      const encrypted = await encryptText(newBody.trim(), currentSession.id);
      await apiEditMessage({
        deviceId,
        sessionId: currentSession.id,
        messageId,
        body: encrypted,
      });

      const nowIso = new Date().toISOString();
      const nextMsgs = messages.map((m) =>
        m.id === messageId ? { ...m, body: newBody.trim(), editedAt: nowIso } : m,
      );
      setMessages(nextMsgs);
      updateCachedMessage(currentSession.id, messageId, newBody.trim());

      saveHistorySession({
        sessionId: currentSession.id,
        peerCallsign: currentSession.peerCallsign,
        startedAt: new Date(currentSession.createdAt).getTime(),
        savedAt: Date.now(),
        messageCount: nextMsgs.length,
        preview: nextMsgs[nextMsgs.length - 1]?.body ?? "",
        interests: currentSession.interests,
        messages: nextMsgs,
      });
      onHistoryUpdated?.(loadChatHistory());
    },
    [deviceId, messages, onActivity, onHistoryUpdated],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string, currentSession: SessionView) => {
      if (!deviceId || !currentSession.id) return;
      onActivity?.();
      await apiDeleteMessage({
        deviceId,
        sessionId: currentSession.id,
        messageId,
      });

      const nextMsgs = messages.filter((m) => m.id !== messageId);
      setMessages(nextMsgs);
      deleteCachedMessage(currentSession.id, messageId);

      if (nextMsgs.length > 0) {
        saveHistorySession({
          sessionId: currentSession.id,
          peerCallsign: currentSession.peerCallsign,
          startedAt: new Date(currentSession.createdAt).getTime(),
          savedAt: Date.now(),
          messageCount: nextMsgs.length,
          preview: nextMsgs[nextMsgs.length - 1]?.body ?? "",
          interests: currentSession.interests,
          messages: nextMsgs,
        });
      } else {
        deleteHistorySession(currentSession.id);
      }
      onHistoryUpdated?.(loadChatHistory());
    },
    [deviceId, messages, onActivity, onHistoryUpdated],
  );

  const handleSendReaction = useCallback(
    async (emoji: string, currentSession: SessionView) => {
      if (!deviceId || !currentSession.id) return;
      onActivity?.();
      triggerFloatingReaction(emoji);
      try {
        if (currentSession.peerPublicKey) {
          await establishSharedKey(deviceId, currentSession.id, currentSession.peerPublicKey);
        }
        const bodyToSend = await encryptText(`[reaction:${emoji}]`, currentSession.id);
        await apiSendMessage({
          deviceId,
          sessionId: currentSession.id,
          body: bodyToSend,
          isReaction: true,
        });
      } catch {}
    },
    [deviceId, onActivity, triggerFloatingReaction],
  );

  return {
    messages,
    setMessages,
    replyingTo,
    setReplyingTo,
    floatingReactions,
    triggerFloatingReaction,
    handleReactionFinished,
    handleSendMessage,
    handleRetryMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleSendReaction,
    decryptPack,
    mergeAndStoreMessages,
    clearUnread,
    hydrateCachedMessages: hydrateCached,
  };
}
