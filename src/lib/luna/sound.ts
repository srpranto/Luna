const SOUND_KEY = "luna.sound_enabled";
const HAPTIC_KEY = "luna.haptics_enabled";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(SOUND_KEY);
  return stored === null ? true : stored === "true";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, enabled ? "true" : "false");
}

export function isHapticEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(HAPTIC_KEY);
  return stored === null ? true : stored === "true";
}

export function setHapticEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HAPTIC_KEY, enabled ? "true" : "false");
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const win = window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AudioCtxClass = win.AudioContext || win.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
    } catch {}
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
}

export function playMatchChime(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(659.25, now);
    osc1.frequency.exponentialRampToValueAtTime(987.77, now + 0.12);

    osc2.frequency.setValueAtTime(329.63, now);
    osc2.frequency.exponentialRampToValueAtTime(493.88, now + 0.12);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.36);
    osc2.stop(now + 0.36);
  } catch {
    return;
  }
}

export function playMessagePop(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.04);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    return;
  }
}

export function playMessageReceived(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(784, now);
    osc.frequency.setValueAtTime(1046.5, now + 0.06);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  } catch {
    return;
  }
}

export function playLeaveTone(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.18);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    return;
  }
}

export type HapticFeedbackPattern =
  | "match"
  | "message-sent"
  | "message-received"
  | "tap"
  | "disconnect"
  | "light"
  | "medium"
  | "heavy"
  | "selection";

export const HAPTIC_PATTERNS: Record<HapticFeedbackPattern, number | number[]> = {
  match: [40, 60, 80],
  "message-sent": [15],
  "message-received": [25, 40, 25],
  tap: [10],
  disconnect: [60, 80, 40],
  light: [10],
  medium: [15],
  heavy: [25, 40, 25],
  selection: [10],
};

let safariSwitchEl: HTMLInputElement | null = null;

function triggerSafariSwitchHaptic(): void {
  if (typeof document === "undefined" || !document.body) return;
  try {
    if (!safariSwitchEl || !document.body.contains(safariSwitchEl)) {
      let el = document.getElementById("luna-haptic-switch") as HTMLInputElement | null;
      if (!el) {
        el = document.createElement("input");
        el.type = "checkbox";
        el.id = "luna-haptic-switch";
        el.setAttribute("switch", "");
        el.setAttribute("aria-hidden", "true");
        el.tabIndex = -1;
        el.style.position = "fixed";
        el.style.top = "-9999px";
        el.style.left = "-9999px";
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.width = "1px";
        el.style.height = "1px";
        document.body.appendChild(el);
      }
      if (typeof el.addEventListener === "function") {
        el.addEventListener("click", (e) => e.stopPropagation());
        el.addEventListener("change", (e) => e.stopPropagation());
      }
      safariSwitchEl = el;
    }
    safariSwitchEl.click();
  } catch {}
}

function playMicroHapticTick(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.008);
    gain.gain.setValueAtTime(0.015, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.012);
  } catch {}
}

export function triggerHaptic(type: HapticFeedbackPattern = "tap"): void {
  if (typeof window === "undefined") return;
  if (!isSoundEnabled() || !isHapticEnabled()) return;

  const pattern = HAPTIC_PATTERNS[type] ?? [10];

  // 1. Standard Web Vibration API (Android Chrome, Firefox, Samsung Internet, PWAs)
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
      return;
    } catch {}
  }

  // 2. iOS Safari Web Fallback (WebKit Switch Taptic Engine trick)
  triggerSafariSwitchHaptic();

  // For match or disconnect on iOS where sensory prominence is needed
  if (type === "match" || type === "disconnect") {
    playMicroHapticTick();
  }
}
