"use client";

import { usePwa } from "@/components/chat/service-worker-provider";
import { MoonLogo } from "@/components/chat/moon-logo";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { triggerHaptic } from "@/lib/sound-effects";

export function InstallAppBanner() {
  const { showInstallButton, installApp, dismissBanner } = usePwa();

  if (!showInstallButton) {
    return null;
  }

  async function handleInstall() {
    triggerHaptic("medium");
    await installApp();
  }

  function handleDismiss() {
    triggerHaptic("light");
    dismissBanner();
  }

  return (
    <aside
      aria-label="Install Luna App"
      className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md animate-sheet-up"
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-zinc-950/95 p-3 sm:px-4 sm:py-3 shadow-[0_16px_48px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-zinc-900 shadow-inner">
            <MoonLogo className="h-5 w-5 text-zinc-100" glow />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-zinc-100 tracking-tight">
              Install Luna App
            </div>
            <div className="text-[11px] text-zinc-400 truncate">
              Fullscreen, fluid midnight chat
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleInstall}
            className="h-8 px-3 text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer rounded-xl touch-manipulation active:scale-95 gap-1.5 shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Install</span>
          </Button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install banner"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
