"use client";

import { useEffect, useState } from "react";
import { CloudRain, Sparkles, Radio, Volume2, VolumeX, Sliders, X } from "lucide-react";
import {
  getSavedSoundscape,
  getSavedVolume,
  getSoundscapeEngine,
  type SoundscapeType,
} from "@/lib/luna/soundscapes";
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
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Sound & Ambient Atmosphere"
        title="Sound & Ambient Atmosphere"
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer",
          open && "bg-zinc-800 text-zinc-100 ring-1 ring-white/20",
          isSoundscapeActive && "text-indigo-400 hover:text-indigo-300",
        )}
      >
        {isSoundscapeActive ? (
          <>
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
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
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span>Audio & Atmosphere</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleSoundFx}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
                  title={
                    soundFxEnabled
                      ? "Mute interface sound effects"
                      : "Enable interface sound effects"
                  }
                >
                  {soundFxEnabled ? (
                    <>
                      <Volume2 className="h-3 w-3 text-emerald-400" />
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
                  onClick={() => setOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-850 cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 mb-2">Procedural Ambient Audio</p>

            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => handleSelect("rain")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs text-left transition-all cursor-pointer",
                  soundscape === "rain"
                    ? "border-indigo-500/60 bg-indigo-950/60 text-indigo-200 font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850",
                )}
              >
                <CloudRain className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-medium">Rain & Thunder</div>
                  <div className="text-[9px] text-zinc-500 truncate">Storm rumble</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelect("cosmic")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs text-left transition-all cursor-pointer",
                  soundscape === "cosmic"
                    ? "border-indigo-500/60 bg-indigo-950/60 text-indigo-200 font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-855",
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-medium">Cosmic Drift</div>
                  <div className="text-[9px] text-zinc-500 truncate">Deep ambient drone</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelect("lofi")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs text-left transition-all cursor-pointer",
                  soundscape === "lofi"
                    ? "border-indigo-500/60 bg-indigo-950/60 text-indigo-200 font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-855",
                )}
              >
                <Radio className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-medium">Lo-Fi Tape</div>
                  <div className="text-[9px] text-zinc-500 truncate">Rhodes jazz chords</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelect("off")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs text-left transition-all cursor-pointer",
                  soundscape === "off"
                    ? "border-white/20 bg-zinc-800/80 text-zinc-200 font-medium"
                    : "border-white/10 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850",
                )}
              >
                <VolumeX className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-medium">Silent</div>
                  <div className="text-[9px] text-zinc-500 truncate">Mute ambient</div>
                </div>
              </button>
            </div>

            {soundscape !== "off" && (
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Sliders className="h-3 w-3 text-indigo-400" />
                    <span>Ambient Volume</span>
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
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
