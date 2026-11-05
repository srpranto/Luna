"use client";

import { useEffect, useRef } from "react";
import { subscribeDeskStream, getDesk } from "@/lib/api-client";
import type { DeskView } from "@/lib/types";
import type { LunaStreamEvent } from "@/lib/events";

interface UseChatStreamOptions {
  deviceId: string | null;
  onEvent: (event: LunaStreamEvent) => void;
  onDeskUpdate: (desk: DeskView) => void;
  onResync: () => void;
  isListening?: boolean;
  onError?: (error: unknown) => void;
}

export function useChatStream({
  deviceId,
  onEvent,
  onDeskUpdate,
  onResync,
  isListening = false,
  onError,
}: UseChatStreamOptions) {
  const onEventRef = useRef(onEvent);
  const onDeskUpdateRef = useRef(onDeskUpdate);
  const onResyncRef = useRef(onResync);
  const isListeningRef = useRef(isListening);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onEventRef.current = onEvent;
    onDeskUpdateRef.current = onDeskUpdate;
    onResyncRef.current = onResync;
    isListeningRef.current = isListening;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    const unsubscribe = subscribeDeskStream(
      deviceId,
      (event) => {
        if (!cancelled) onEventRef.current(event);
      },
      () => {
        if (cancelled) return;
        getDesk({ deviceId })
          .then((d) => {
            if (!cancelled && !isListeningRef.current) {
              onDeskUpdateRef.current(d);
            }
          })
          .catch((err) => {
            onErrorRef.current?.(err);
          });
        onResyncRef.current();
      },
    );

    const pollTimer = window.setInterval(() => {
      if (isListeningRef.current) return;

      getDesk({ deviceId })
        .then((data) => {
          if (!cancelled && !isListeningRef.current) {
            onDeskUpdateRef.current(data);
          }
        })
        .catch((err) => {
          onErrorRef.current?.(err);
        });
    }, 20000);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(pollTimer);
    };
  }, [deviceId]);
}
