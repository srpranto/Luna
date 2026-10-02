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
  isInstallable: boolean;
  isStandalone: boolean;
  isIos: boolean;
  installApp: () => Promise<boolean>;
}

const PwaContext = createContext<PwaContextValue>({
  isInstallable: false,
  isStandalone: false,
  isIos: false,
  installApp: async () => false,
});

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    const hasMsStream = "MSStream" in window;
    return /iphone|ipad|ipod/.test(ua) && !hasMsStream;
  });

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

    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "test") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }

    return () => {
      mediaQuery.removeEventListener("change", handler);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
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
        isInstallable: Boolean(deferredPrompt),
        isStandalone,
        isIos,
        installApp,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  return useContext(PwaContext);
}
