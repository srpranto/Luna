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
  const [isAway, setIsAway] = useState(false);
  const isAwayRef = useRef(false);
  const lastActivityRef = useRef(0);

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    isAwayRef.current = isAway;
  }, [isAway]);

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isAwayRef.current) {
      setIsAway(false);
      if (deviceId && currentSession?.id && !currentSession.closed) {
        void reportPresence({ deviceId, sessionId: currentSession.id, isAway: false }).catch(() => {});
      }
    }
  }, [deviceId, currentSession]);

  useEffect(() => {
    if (!currentSession?.id || currentSession.closed) {
      return;
    }

    const sessionId = currentSession.id;

    function evaluateIdle() {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_AWAY_THRESHOLD_MS) {
        if (!isAwayRef.current) {
          setIsAway(true);
          if (deviceId) {
            void reportPresence({ deviceId, sessionId, isAway: true }).catch(() => {});
          }
        }
      } else if (isAwayRef.current) {
        setIsAway(false);
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
          setIsAway(true);
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
