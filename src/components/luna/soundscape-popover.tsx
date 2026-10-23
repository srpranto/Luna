"use client";

import { useEffect, useState } from "react";
import { Sparkles, Radio, Volume2, VolumeX, Sliders, X } from "lucide-react";
import {
  getSavedSoundscape,
  getSavedVolume,
  getSoundscapeEngine,
  type SoundscapeType,
} from "@/lib/luna/soundscapes";
import { triggerHaptic } from "@/lib/luna/sound";
import { cn } from "@/lib/utils";

interface SoundscapePopoverProps {
  soundFxEnabled: boolean;
  onToggleSoundFx: () => void;
}

export function SoundscapePopover({ soundFxEnabled, onToggleSoundFx }: SoundscapePopoverProps) {
  const [open, setOpen] = useState(false);
  const [soundscape, setSoundscape] = useState<SoundscapeType>("off");
  const [volume, setVolume] = useState(0.35);

  useEffect(() => {
    const savedScape = getSavedSoundscape();
    const savedVol = getSavedVolume();
    const timer = window.setTimeout(() => {
      setSoundscape(savedScape);
      setVolume(savedVol);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function handleSelect(type: SoundscapeType) {
    triggerHaptic("selection");
    setSoundscape(type);
    const engine = getSoundscapeEngine();
    engine.play(type);
  }

  function handleVolumeChange(newVol: number) {
    setVolume(newVol);
    const engine = getSoundscapeEngine();
    engine.setVolume(newVol);
  }

  const isSoundscapeActive = soundscape !== "off";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          triggerHaptic("light");
          setOpen((prev) => !prev);
        }}
        aria-label="Sound & Ambient Atmosphere"
        title="Sound & Ambient Atmosphere"
        className={cn(
          "relative flex h-8.5 w-8.5 sm:h-8 sm:w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer touch-manipulation active:scale-95",
          open && "bg-zinc-800 text-zinc-100 ring-1 ring-white/20",
          isSoundscapeActive && "text-zinc-100 hover:text-white",
        )}
      >
        {isSoundscapeActive ? (
          <>
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <Sparkles className="h-4 w-4" />
          </>
        ) : soundFxEnabled ? (
          <Volume2 className="h-4 w-4" />
        ) : (
          <VolumeX className="h-4 w-4 text-zinc-500" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/15 bg-zinc-950 p-3.5 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.1)] backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/10">
              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-zinc-100" />
                <span>Audio & Atmosphere</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    onToggleSoundFx();
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer touch-manipulation active:scale-95"
                  title={
                    soundFxEnabled
                      ? "Mute interface sound effects"
                      : "Enable interface sound effects"
                  }
                >
                  {soundFxEnabled ? (
                    <>
                      <Volume2 className="h-3 w-3 text-zinc-100" />
                      <span>SFX On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-3 w-3 text-zinc-500" />
                      <span>SFX Off</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setOpen(false);
                  }}
                  className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-850 cursor-pointer touch-manipulation active:scale-95"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 mb-2">Ambient Atmosphere</p>

            <div className="flex flex-col gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => handleSelect("cosmic")}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs text-left transition-all cursor-pointer active:scale-[0.98] touch-manipulation",
                  soundscape === "cosmic"
                    ? "border-white/30 bg-zinc-850 text-white font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]"
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850",
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 border border-white/10 shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-zinc-100" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-100">Cosmic Drift</div>
                  <div className="text-[10px] text-zinc-400 truncate">Deep ambient drone & soft bells</div>
                </div>
                {soundscape === "cosmic" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelect("lofi")}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs text-left transition-all cursor-pointer active:scale-[0.98] touch-manipulation",
                  soundscape === "lofi"
                    ? "border-white/30 bg-zinc-850 text-white font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]"
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850",
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 border border-white/10 shrink-0">
                  <Radio className="h-3.5 w-3.5 text-zinc-100" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-100">Lo-Fi Tape</div>
                  <div className="text-[10px] text-zinc-400 truncate">Rhodes jazz chords & vinyl warmth</div>
                </div>
                {soundscape === "lofi" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelect("off")}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs text-left transition-all cursor-pointer active:scale-[0.98] touch-manipulation",
                  soundscape === "off"
                    ? "border-white/20 bg-zinc-800/80 text-zinc-200 font-medium"
                    : "border-white/10 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850",
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 border border-white/10 shrink-0">
                  <VolumeX className="h-3.5 w-3.5 text-zinc-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-200">Silent</div>
                  <div className="text-[10px] text-zinc-500 truncate">Mute ambient atmosphere</div>
                </div>
                {soundscape === "off" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
                )}
              </button>
            </div>

            {soundscape !== "off" && (
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Sliders className="h-3 w-3 text-zinc-300" />
                    <span>Atmosphere Volume</span>
                  </span>
                  <span className="font-mono text-zinc-400 font-medium">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
