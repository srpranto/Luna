"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { IDLE_AWAY_THRESHOLD_MS } from "@/lib/luna/constants";
import { reportPresence } from "@/lib/luna/client";
import type { SessionView } from "@/lib/luna/types";

interface UseLunaPresenceOptions {
  deviceId: string | null;
  currentSession: SessionView | null;
  onResync?: () => void;
}

export function useLunaPresence({
  deviceId,
  currentSession,
  onResync,
}: UseLunaPresenceOptions) {
  const currentSessionId = currentSession?.id;
  const isClosed = currentSession?.closed;

  const [awaySessionId, setAwaySessionId] = useState<string | null>(null);
  const isAway = Boolean(
    currentSessionId && !isClosed && awaySessionId === currentSessionId,
  );
  const isAwayRef = useRef(isAway);
  const lastActivityRef = useRef(0);
  const sessionStartRef = useRef(0);

  useEffect(() => {
    isAwayRef.current = isAway;
  }, [isAway]);

  const setIsAway = useCallback(
    (val: boolean) => {
      if (val && currentSessionId) {
        setAwaySessionId(currentSessionId);
      } else {
        setAwaySessionId(null);
      }
    },
    [currentSessionId],
  );

  // Synchronize timestamps and notify server on fresh session start
  useEffect(() => {
    if (currentSessionId && !isClosed) {
      lastActivityRef.current = Date.now();
      sessionStartRef.current = Date.now();
      if (deviceId) {
        void reportPresence({ deviceId, sessionId: currentSessionId, isAway: false }).catch(() => {});
      }
    }
  }, [currentSessionId, isClosed, deviceId]);

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isAwayRef.current) {
      setAwaySessionId(null);
      if (deviceId && currentSessionId && !isClosed) {
        void reportPresence({ deviceId, sessionId: currentSessionId, isAway: false }).catch(() => {});
      }
    }
  }, [deviceId, currentSessionId, isClosed]);

  useEffect(() => {
    if (!currentSession?.id || currentSession.closed) {
      return;
    }

    const sessionId = currentSession.id;

    function evaluateIdle() {
      // 60-second grace window after match before idle detection begins
      const sessionAge = Date.now() - sessionStartRef.current;
      if (sessionAge < IDLE_AWAY_THRESHOLD_MS) {
        if (isAwayRef.current) {
          setAwaySessionId(null);
          if (deviceId) {
            void reportPresence({ deviceId, sessionId, isAway: false }).catch(() => {});
          }
        }
        return;
      }

      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_AWAY_THRESHOLD_MS) {
        if (!isAwayRef.current) {
          setAwaySessionId(sessionId);
          if (deviceId) {
            void reportPresence({ deviceId, sessionId, isAway: true }).catch(() => {});
          }
        }
      } else if (isAwayRef.current) {
        setAwaySessionId(null);
        if (deviceId) {
          void reportPresence({ deviceId, sessionId, isAway: false }).catch(() => {});
        }
      }
    }

    const onActivity = () => resetIdle();

    const onVisibility = () => {
      if (document.hidden) {
        if (!isAwayRef.current) {
          isAwayRef.current = true;
          setAwaySessionId(sessionId);
          if (deviceId) {
            void reportPresence({ deviceId, sessionId, isAway: true }).catch(() => {});
          }
        }
      } else {
        resetIdle();
        onResync?.();
      }
    };

    const onFocus = () => {
      resetIdle();
      onResync?.();
    };

    const passiveOpts = { passive: true } as const;
    const passiveCapture = { capture: true, passive: true } as const;

    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity, passiveOpts);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("wheel", onActivity, passiveOpts);
    document.addEventListener("scroll", onActivity, passiveCapture);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    evaluateIdle();
    const interval = window.setInterval(evaluateIdle, 1000);

    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("wheel", onActivity);
      document.removeEventListener("scroll", onActivity, passiveCapture);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [currentSession, deviceId, resetIdle, onResync]);

  const effectiveIsAway = Boolean(currentSession?.id && !currentSession.closed && isAway);

  return { isAway: effectiveIsAway, setIsAway, resetIdle, lastActivityRef };
}
