"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaContextValue {
  showInstallButton: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  installApp: () => Promise<boolean>;
  dismissBanner: () => void;
}

const PwaContext = createContext<PwaContextValue>({
  showInstallButton: false,
  isStandalone: false,
  canInstall: false,
  installApp: async () => false,
  dismissBanner: () => {},
});

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem("luna.pwa_dismissed");
      if (!stored) return false;
      const ts = Number(stored);
      return Date.now() - ts < 86400000;
    } catch {
      return false;
    }
  });

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      localStorage.setItem("luna.pwa_dismissed", Date.now().toString());
    } catch {}
  }, []);

  useEffect(() => {
    const checkStandalone = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        nav.standalone === true ||
        document.referrer.includes("android-app://");
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mediaQuery.addEventListener("change", handler);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    let swRegistration: ServiceWorkerRegistration | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && swRegistration) {
        void swRegistration.update().catch(() => {});
      }
    };
    const handleFocus = () => {
      if (swRegistration) {
        void swRegistration.update().catch(() => {});
      }
    };

    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "test") {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .then((reg) => {
            swRegistration = reg;
            void reg.update().catch(() => {});
          })
          .catch(() => {});
      });

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("focus", handleFocus);
    }

    return () => {
      mediaQuery.removeEventListener("change", handler);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const installApp = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setIsStandalone(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  return (
    <PwaContext.Provider
      value={{
        showInstallButton: Boolean(deferredPrompt) && !isStandalone && !bannerDismissed,
        isStandalone,
        canInstall: Boolean(deferredPrompt) && !isStandalone,
        installApp,
        dismissBanner,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  return useContext(PwaContext);
}
