"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { IDLE_AWAY_THRESHOLD_MS } from "@/lib/constants";
import { reportPresence } from "@/lib/api-client";
import type { SessionView } from "@/lib/types";

interface UsePresenceOptions {
  deviceId: string | null;
  currentSession: SessionView | null;
  onResync?: () => void;
}

export function usePresence({
  deviceId,
  currentSession,
  onResync,
}: UsePresenceOptions) {
  const currentSessionId = currentSession?.id;
  const isClosed = currentSession?.closed;

  const [awaySessionId, setAwaySessionId] = useState<string | null>(null);
  const isAway = Boolean(
    currentSessionId && !isClosed && awaySessionId === currentSessionId,
  );
  const isAwayRef = useRef(isAway);
  const lastActivityRef = useRef(0);
  const sessionStartRef = useRef(0);
  const awayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (awayTimerRef.current) {
      clearTimeout(awayTimerRef.current);
      awayTimerRef.current = null;
    }
    lastActivityRef.current = Date.now();
    if (isAwayRef.current) {
      setAwaySessionId(null);
      if (deviceId && currentSessionId && !isClosed) {
        void reportPresence({ deviceId, sessionId: currentSessionId, isAway: false }).catch(() => {});
      }
    }
  }, [deviceId, currentSessionId, isClosed]);

  useEffect(() => {
    if (!currentSessionId || isClosed) {
      return;
    }

    const sessionId = currentSessionId;

    function evaluateIdle() {
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
        if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
        awayTimerRef.current = setTimeout(() => {
          if (document.hidden && !isAwayRef.current) {
            isAwayRef.current = true;
            setAwaySessionId(sessionId);
            if (deviceId) {
              void reportPresence({ deviceId, sessionId, isAway: true }).catch(() => {});
            }
          }
        }, 10000);
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
    const interval = window.setInterval(evaluateIdle, 2000);

    return () => {
      if (awayTimerRef.current) {
        clearTimeout(awayTimerRef.current);
        awayTimerRef.current = null;
      }
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
  }, [currentSessionId, isClosed, deviceId, resetIdle, onResync]);

  const effectiveIsAway = Boolean(currentSessionId && !isClosed && isAway);
  return { isAway: effectiveIsAway, setIsAway, resetIdle, lastActivityRef };
}
