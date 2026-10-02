"use client";

import { HeartHandshake, Settings, X, Download, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SoundscapePopover } from "@/components/luna/soundscape-popover";
import { usePwa } from "@/components/luna/pwa-provider";
import { BlackHoleIcon } from "@/components/luna/black-hole-icon";
import { LunaMoon } from "@/components/luna/luna-moon";
import { formatElapsed } from "@/lib/luna/identity";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

function SessionElapsedBadge({
  createdAt,
  fallbackAgeMs = 0,
}: {
  createdAt?: string;
  fallbackAgeMs?: number;
}) {
  const [elapsed, setElapsed] = useState(() => {
    if (!createdAt) return fallbackAgeMs;
    return Math.max(0, Date.now() - new Date(createdAt).getTime());
  });

  useEffect(() => {
    if (!createdAt) return;
    const interval = window.setInterval(() => {
      setElapsed(Math.max(0, Date.now() - new Date(createdAt).getTime()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [createdAt]);

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] text-zinc-300 font-mono shrink-0 shadow-sm">
      <span>{formatElapsed(elapsed)}</span>
    </span>
  );
}

const STELLAR_STARS = [
  { top: "22%", left: "3%", size: 1, duration: "3.8s", delay: "0.2s" },
  { top: "68%", left: "7%", size: 1.5, duration: "4.5s", delay: "1.2s", glow: true },
  { top: "35%", left: "12%", size: 1, duration: "3.2s", delay: "2.4s" },
  { top: "18%", left: "19%", size: 2, duration: "4.8s", delay: "0.7s", glow: true },
  { top: "72%", left: "26%", size: 1, duration: "3.6s", delay: "1.9s" },
  { top: "42%", left: "33%", size: 1.5, duration: "5.1s", delay: "0.4s" },
  { top: "25%", left: "41%", size: 1, duration: "4.1s", delay: "2.8s" },
  { top: "65%", left: "48%", size: 2, duration: "3.9s", delay: "1.1s", glow: true },
  { top: "20%", left: "54%", size: 1, duration: "4.7s", delay: "0.5s" },
  { top: "78%", left: "62%", size: 1.5, duration: "3.4s", delay: "2.1s" },
  { top: "30%", left: "69%", size: 1, duration: "5.4s", delay: "1.6s" },
  { top: "60%", left: "77%", size: 2, duration: "4.3s", delay: "0.3s", glow: true },
  { top: "16%", left: "83%", size: 1, duration: "3.7s", delay: "2.5s" },
  { top: "75%", left: "89%", size: 1.5, duration: "4.9s", delay: "1.4s" },
  { top: "38%", left: "94%", size: 1, duration: "3.3s", delay: "0.8s" },
  { top: "52%", left: "98%", size: 1, duration: "4.6s", delay: "2.0s" },
  { top: "82%", left: "15%", size: 1, duration: "4.2s", delay: "3.0s" },
  { top: "14%", left: "37%", size: 1.5, duration: "3.5s", delay: "1.7s" },
  { top: "84%", left: "58%", size: 1, duration: "5.2s", delay: "2.2s" },
  { top: "26%", left: "72%", size: 1, duration: "4.0s", delay: "0.9s" },
];

export function StatusHeader({
  callsign,
  meta,
  onToggleLog,
  logOpen,
  soundEnabled = true,
  onToggleSound,
  settingsOpen = false,
  onToggleSettings,
  onToggleVoid,
  hasHistory = false,
  historyOpen = false,
  onToggleHistory,
  activeChat,
}: {
  callsign?: string;
  meta?: string;
  onToggleLog: () => void;
  logOpen: boolean;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  onToggleVoid?: () => void;
  hasHistory?: boolean;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  activeChat?: {
    peerCallsign: string;
    sessionAgeMs?: number;
    sessionCreatedAt?: string;
    sessionKind?: "stranger" | "friend";
    peerPresence?: "active" | "away" | "disconnected";
    peerTyping?: boolean;
  };
}) {
  const { showInstallButton, installApp } = usePwa();

  return (
    <header className="relative z-40 flex items-center justify-between border-b border-white/10 bg-zinc-950/60 px-4 py-3 sm:px-6 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-radial-[ellipse_80%_60%_at_50%_40%] from-indigo-950/15 via-transparent to-transparent opacity-60" />
        {STELLAR_STARS.map((star, idx) => (
          <span
            key={idx}
            className="stellar-star"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDuration: star.duration,
              animationDelay: star.delay,
              boxShadow: star.glow ? "0 0 3px 1px rgba(255, 255, 255, 0.7)" : undefined,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
        <div className="flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
          <LunaMoon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-100" glow />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">Luna</span>
            {!activeChat && (
              <>
                <span className="text-xs text-zinc-600 hidden sm:inline">•</span>
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                  <span className="text-xs font-mono text-zinc-400 font-medium">
                    {callsign ?? "connecting…"}
                  </span>
                </div>
              </>
            )}
          </div>
          {!activeChat && (
            <div className="flex items-center gap-1.5 sm:hidden">
              <span className="text-[11px] font-mono text-zinc-400 truncate max-w-[110px]">
                {callsign ?? "connecting…"}
              </span>
            </div>
          )}
        </div>
      </div>

      {activeChat ? (
        <div className="relative z-10 flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-2 px-1 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 max-w-[110px] xs:max-w-[140px] sm:max-w-[220px]">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                activeChat.peerPresence === "away"
                  ? "bg-amber-400"
                  : activeChat.peerPresence === "disconnected"
                    ? "bg-zinc-500"
                    : "bg-emerald-400 animate-pulse",
              )}
              title={
                activeChat.peerPresence === "away"
                  ? "Stranger is away"
                  : activeChat.peerPresence === "disconnected"
                    ? "Disconnected"
                    : "Active"
              }
            />
            <span className="text-xs sm:text-sm font-semibold font-mono text-zinc-100 truncate">
              {activeChat.peerCallsign}
            </span>
            {activeChat.peerPresence === "away" && (
              <span className="text-[10px] font-mono text-amber-400/90 shrink-0">(away)</span>
            )}
            {activeChat.peerTyping && (
              <span className="text-[10px] font-mono text-zinc-400 animate-pulse hidden sm:inline shrink-0">
                (typing…)
              </span>
            )}
          </div>
          <SessionElapsedBadge
            createdAt={activeChat.sessionCreatedAt}
            fallbackAgeMs={activeChat.sessionAgeMs}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="relative z-20 flex items-center gap-1 sm:gap-2 shrink-0">
        <div className="h-4 w-px bg-white/10 hidden sm:block" />

        {meta && (
          <Badge
            variant="outline"
            className="hidden md:inline-flex text-[11px] font-mono capitalize"
          >
            {meta}
          </Badge>
        )}

        <div className="flex items-center gap-0.5 sm:gap-1">
          {onToggleSound && (
            <SoundscapePopover soundFxEnabled={soundEnabled} onToggleSoundFx={onToggleSound} />
          )}

          <Button
            type="button"
            variant={logOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleLog}
            aria-label="Connections"
            title="Connections"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
          >
            {logOpen ? <X className="h-4 w-4" /> : <HeartHandshake className="h-4 w-4" />}
          </Button>

          {hasHistory && onToggleHistory && (
            <Button
              type="button"
              variant={historyOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleHistory}
              aria-label="24h Chat History"
              title="24h Chat History"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 cursor-pointer"
            >
              {historyOpen ? <X className="h-4 w-4" /> : <History className="h-4 w-4" />}
            </Button>
          )}

          {!activeChat && onToggleVoid && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleVoid}
              aria-label="The Void (24h Orbit Letters)"
              title="The Void (24h Orbit Letters)"
              className="h-8 w-8 text-indigo-400 hover:text-indigo-200 hover:bg-zinc-800/80"
            >
              <BlackHoleIcon className="h-4 w-4" />
            </Button>
          )}

          {showInstallButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={installApp}
              aria-label="Install Luna App"
              title="Install Luna App"
              className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 cursor-pointer"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}

          {onToggleSettings && (
            <Button
              type="button"
              variant={settingsOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleSettings}
              aria-label="Settings"
              title="Settings"
              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
            >
              {settingsOpen ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
