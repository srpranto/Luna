"use client";

import { useState, useRef, useCallback } from "react";
import type { ChatMessage, HistorySession, MessagesPack, SessionView } from "@/lib/luna/types";
import type { FloatingItem } from "@/components/luna/floating-reactions";
import {
  decryptText,
  encryptText,
  saveCachedMessages,
  updateCachedMessage,
  deleteCachedMessage,
  establishSharedKey,
  saveHistorySession,
  loadChatHistory,
  deleteHistorySession,
} from "@/lib/luna/crypto";
import {
  sendMessage as apiSendMessage,
  editMessage as apiEditMessage,
  deleteMessage as apiDeleteMessage,
} from "@/lib/luna/client";
import { playMessagePop, playMessageReceived } from "@/lib/luna/sound";

const REACTION_REGEX = /^\[reaction:(🌙|✨)\]$/;

interface UseLunaMessagesOptions {
  deviceId: string | null;
  onActivity?: () => void;
  onHistoryUpdated?: (sessions: HistorySession[]) => void;
  onSessionEndedNotice?: () => void;
}

export function useLunaMessages({
  deviceId,
  onActivity,
  onHistoryUpdated,
  onSessionEndedNotice,
}: UseLunaMessagesOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingItem[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; fromCallsign: string; body: string } | null>(null);

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
    if (typeof document !== "undefined" && document.hidden) {
      unreadRef.current += 1;
      const clean = text.replace(/[\r\n]+/g, " ").trim().slice(0, 32);
      document.title = `(${unreadRef.current}) Luna — ${fromCallsign}: ${clean}`;
    }
  }, []);

  const clearUnread = useCallback(() => {
    unreadRef.current = 0;
    if (typeof document !== "undefined") {
      document.title = "Luna — Late-Night Anonymous Chat";
    }
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
        const map = new Map<string, ChatMessage>();
        for (const m of incoming) {
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
        saveCachedMessages(sessionId, merged);
        return merged;
      });

      if (incoming.length > 0) {
        const lastMsg = incoming[incoming.length - 1];
        saveHistorySession({
          sessionId,
          peerCallsign: session.peerCallsign,
          startedAt: new Date(session.createdAt).getTime(),
          savedAt: Date.now(),
          messageCount: incoming.length,
          preview: lastMsg?.body ?? "",
          interests: session.interests,
          messages: incoming,
        });
        onHistoryUpdated?.(loadChatHistory());
      }

      if (isSoundNotification) {
        const lastMsg = incoming[incoming.length - 1];
        if (lastMsg && !lastMsg.mine && !lastMsg.system) {
          onActivity?.();
          playMessageReceived();
          notifyUnread(lastMsg.fromCallsign, lastMsg.body);
        }
      }
    },
    [notifyUnread, onActivity, onHistoryUpdated],
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

      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        fromId: deviceId,
        fromCallsign: senderCallsign,
        body: textToSend,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        mine: true,
        system: false,
        copied: false,
      };

      playMessagePop();
      setMessages((prev) => [...prev, optimisticMsg]);

      sendQueueRef.current = sendQueueRef.current.then(async () => {
        try {
          const bodyToSend = await encryptText(textToSend, currentSession.id);
          const pack = await apiSendMessage({
            deviceId,
            sessionId: currentSession.id,
            body: bodyToSend,
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
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
          }
        }
      });
    },
    [deviceId, replyingTo, onActivity, decryptPack, mergeAndStoreMessages, onSessionEndedNotice],
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
        const bodyToSend = await encryptText(`[reaction:${emoji}]`, currentSession.id);
        await apiSendMessage({
          deviceId,
          sessionId: currentSession.id,
          body: bodyToSend,
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
    handleEditMessage,
    handleDeleteMessage,
    handleSendReaction,
    decryptPack,
    mergeAndStoreMessages,
    clearUnread,
  };
}
