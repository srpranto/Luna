"use client";

/**
 * Luna Unified Notification System
 * - Web Notifications API (native background/minimized OS notifications)
 * - Dynamic Document Title & Favicon alert badges
 * - In-app toast event dispatcher
 * - Web Audio synthesized ambient chimes
 */

export interface LunaToastNotification {
  id: string;
  title: string;
  message: string;
  type?: "match" | "message" | "friend" | "system";
  actionLabel?: string;
  onAction?: () => void;
  timestamp: number;
}

type ToastListener = (toast: LunaToastNotification) => void;
const toastListeners = new Set<ToastListener>();

let originalDocumentTitle = "Luna — Ephemeral Midnight Encrypted Chat";
let unreadCount = 0;
let titleFlashTimer: ReturnType<typeof setInterval> | null = null;
let audioContext: AudioContext | null = null;

if (typeof window !== "undefined") {
  if (document.title) {
    originalDocumentTitle = document.title;
  }

  // Restore title when window gains focus
  window.addEventListener("focus", () => {
    clearNotificationBadge();
  });
}

/**
 * Check if the browser supports the Notifications API
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return "denied";
  }
}

/**
 * Get current notification permission
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/**
 * Web Audio synthesized chime generator
 * Generates delicate ethereal celestial sounds that bypass strict static asset policies
 */
export function playSynthesizedChime(type: "match" | "message" | "friend" | "alert" | "system" = "message") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContext) {
      audioContext = new AudioCtx();
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const now = audioContext.currentTime;

    if (type === "match") {
      // Ethereal rising triple chord (F#5 -> A#5 -> C#6)
      const freqs = [739.99, 932.33, 1108.73];
      freqs.forEach((freq, i) => {
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.08);

        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.08, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.65);
      });
    } else if (type === "friend") {
      // Water droplet air chime (harmonic ping with gentle sweep)
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now);
      osc.stop(now + 0.55);
    } else {
      // Subtle message drop (warm soft dual ping: 587.33Hz -> 880Hz)
      const freqs = [587.33, 880];
      freqs.forEach((freq, i) => {
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.05);

        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.06, now + i * 0.05 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.35);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.4);
      });
    }
  } catch {
    // Graceful fallback if audio context cannot play
  }
}

/**
 * Dispatch an OS system notification and/or background title alert
 */
export function notifyUser(options: {
  title: string;
  body: string;
  type?: "match" | "message" | "friend" | "system";
  tag?: string;
  onClick?: () => void;
}) {
  // Dispatch in-app toast event
  const toastItem: LunaToastNotification = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: options.title,
    message: options.body,
    type: options.type ?? "message",
    timestamp: Date.now(),
    onAction: options.onClick,
  };

  toastListeners.forEach((listener) => {
    try {
      listener(toastItem);
    } catch {
      // Ignore listener error
    }
  });

  if (typeof window === "undefined") return;

  const isBackground = document.hidden || !document.hasFocus();

  // Play audio chime
  playSynthesizedChime(options.type ?? "message");

  // If in background, update title badge
  if (isBackground) {
    unreadCount += 1;
    updateNotificationBadge(options.type === "match" ? "★ Match" : undefined);

    // If native system notification permitted, trigger OS alert
    if (isNotificationSupported() && Notification.permission === "granted") {
      try {
        const notif = new Notification(options.title, {
          body: options.body,
          tag: options.tag ?? `luna-${options.type ?? "general"}`,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        });

        notif.onclick = () => {
          window.focus();
          options.onClick?.();
          notif.close();
        };
      } catch {
        // Fallback for notification construction errors
      }
    }
  }
}

/**
 * Flash or update document title badge
 */
export function updateNotificationBadge(customTag?: string) {
  if (typeof document === "undefined") return;

  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }

  const badge = customTag ? `(${customTag})` : unreadCount > 0 ? `(${unreadCount})` : "";
  let flashState = false;

  titleFlashTimer = setInterval(() => {
    if (typeof document === "undefined") return;
    if (!document.hidden && document.hasFocus()) {
      clearNotificationBadge();
      return;
    }
    flashState = !flashState;
    document.title = flashState
      ? `${badge} Luna`
      : originalDocumentTitle;
  }, 1200);
}

/**
 * Clear document title badge
 */
export function clearNotificationBadge() {
  unreadCount = 0;
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (typeof document !== "undefined") {
    document.title = originalDocumentTitle;
  }
}

/**
 * Subscribe to in-app toast notifications
 */
export function subscribeToLunaToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}
