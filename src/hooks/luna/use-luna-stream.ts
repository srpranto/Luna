"use client";

import { useEffect, useRef } from "react";
import { subscribeDeskStream, getDesk } from "@/lib/luna/client";
import type { DeskView } from "@/lib/luna/types";

interface UseLunaStreamOptions {
  deviceId: string | null;
  onEvent: (eventType: string, data: unknown) => void;
  onDeskUpdate: (desk: DeskView) => void;
  onResync: () => void;
}

export function useLunaStream({
  deviceId,
  onEvent,
  onDeskUpdate,
  onResync,
}: UseLunaStreamOptions) {
  const onEventRef = useRef(onEvent);
  const onDeskUpdateRef = useRef(onDeskUpdate);
  const onResyncRef = useRef(onResync);

  useEffect(() => {
    onEventRef.current = onEvent;
    onDeskUpdateRef.current = onDeskUpdate;
    onResyncRef.current = onResync;
  });

  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    const unsubscribe = subscribeDeskStream(
      deviceId,
      (type, data) => {
        if (!cancelled) onEventRef.current(type, data);
      },
      () => {
        if (cancelled) return;
        getDesk({ deviceId })
          .then((d) => !cancelled && onDeskUpdateRef.current(d))
          .catch(() => {});
        onResyncRef.current();
      },
    );

    const pollTimer = window.setInterval(() => {
      getDesk({ deviceId })
        .then((data) => {
          if (!cancelled) onDeskUpdateRef.current(data);
        })
        .catch(() => {});
    }, 15000);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(pollTimer);
    };
  }, [deviceId]);
}
