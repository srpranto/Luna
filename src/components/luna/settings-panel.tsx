"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Settings,
  Trash2,
  X,
  Sparkles,
  Check,
  AlertCircle,
  Download,
  Smartphone,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCallsign, deleteStation } from "@/lib/luna/client";
import { mintCallsign } from "@/lib/luna/constants";
import { setCachedCustomName, clearCachedCustomName } from "@/lib/luna/identity";
import { triggerHaptic, isHapticEnabled, setHapticEnabled } from "@/lib/luna/sound";
import { usePwa } from "@/components/luna/pwa-provider";
import type { DeskView } from "@/lib/luna/types";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  isOpen?: boolean;
  desk: DeskView;
  onClose: () => void;
  onCallsignUpdated: (next: DeskView) => void;
  onStationReset: () => void;
}

export function SettingsPanel({
  isOpen = true,
  desk,
  onClose,
  onCallsignUpdated,
  onStationReset,
}: SettingsPanelProps) {
  const { isStandalone, installApp } = usePwa();
  const [handle, setHandle] = useState(desk.station.callsign);
  const [prevCallsign, setPrevCallsign] = useState(desk.station.callsign);
  const [saving, setSaving] = useState(false);

  if (desk.station.callsign !== prevCallsign) {
    setPrevCallsign(desk.station.callsign);
    setHandle(desk.station.callsign);
  }
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const [linkPreviews, setLinkPreviews] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("luna_link_previews_enabled") !== "false";
    }
    return true;
  });

  const [privacyShield, setPrivacyShield] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("luna.privacy_shield_enabled") === "true";
    }
    return false;
  });

  const [haptics, setHaptics] = useState(() => isHapticEnabled());

  const toggleHaptics = () => {
    const next = !haptics;
    setHaptics(next);
    setHapticEnabled(next);
    if (next) triggerHaptic("tap");
  };

  const togglePrivacyShield = () => {
    triggerHaptic("selection");
    const next = !privacyShield;
    setPrivacyShield(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("luna.privacy_shield_enabled", String(next));
    }
  };

  const toggleLinkPreviews = () => {
    triggerHaptic("selection");
    const next = !linkPreviews;
    setLinkPreviews(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("luna_link_previews_enabled", String(next));
    }
  };

  async function handleSaveHandle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = handle.trim().replace(/[^A-Za-z0-9_-]/g, "");
    if (clean.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      const nextDesk = await updateCallsign({
        deviceId: desk.station.deviceId,
        callsign: clean,
      });

      triggerHaptic("medium");
      setCachedCustomName(clean);
      onCallsignUpdated(nextDesk);
      setStatus("Name saved.");
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Couldn't save name. Try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleMintRandom() {
    triggerHaptic("selection");
    const random = mintCallsign();
    setHandle(random);
  }

  async function handleDeleteAccountOrBurn() {
    triggerHaptic("heavy");
    setDeleting(true);
    setError(null);
    try {
      clearCachedCustomName();
      await deleteStation({ deviceId: desk.station.deviceId });
      if (typeof window !== "undefined") {
        localStorage.clear();
      }
      onStationReset();
      onClose();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Failed to reset seat.";
      setError(message);
      setDeleting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          triggerHaptic("light");
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative flex flex-col w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl border-t sm:border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden animate-sheet-up sm:animate-none pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0">
        <div className="w-10 h-1 bg-zinc-700/60 rounded-full mx-auto my-2.5 sm:hidden" />
        <div className="flex flex-col gap-6 p-4 sm:p-6 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
                <Settings className="h-4 w-4 text-zinc-100" />
              </div>
              <div>
                <h2 id="settings-modal-title" className="text-base font-semibold tracking-tight text-zinc-100">Settings</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onClose();
              }}
              aria-label="Close settings"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

      {status && (
        <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-xs text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
          <Check className="h-4 w-4 shrink-0 text-white" />
          <p>{status}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <p className="text-xs text-zinc-500">This is how strangers see you at the table.</p>
        <form onSubmit={handleSaveHandle} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={20}
              placeholder="Rainy-Soul"
              className="font-mono text-base sm:text-sm tracking-wider bg-zinc-900/60 border-zinc-800"
            />
            <Button type="submit" disabled={saving || !handle.trim()} className="shrink-0 h-9 touch-manipulation active:scale-95">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>2–20 characters</span>
            <button
              type="button"
              onClick={handleMintRandom}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer touch-manipulation active:scale-95 py-1"
            >
              <Sparkles className="h-3 w-3" />
              <span>Suggest a name</span>
            </button>
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-white/5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
          Luna Web App
        </span>
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-zinc-200" />
              <span className="text-xs font-semibold text-zinc-200">
                {isStandalone ? "Installed on this device" : "Install as App"}
              </span>
            </div>
            {isStandalone && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-200 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                <CheckCircle2 className="h-3 w-3" /> Standalone
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            {isStandalone
              ? "Running in native standalone window mode with offline shell caching and low latency."
              : "Install Luna on your home screen or desktop for instant full-screen access without browser bars."}
          </p>

          {!isStandalone && (
            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                onClick={async () => {
                  triggerHaptic("medium");
                  await installApp();
                }}
                className="h-9 text-xs bg-white text-zinc-950 hover:bg-zinc-200 gap-2 font-medium cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.18)]"
              >
                <Download className="h-4 w-4" />
                <span>Install Luna App</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-white/5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
          Privacy & Security
        </span>
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-zinc-200">
                Rich Link Previews
              </span>
              <span className="text-[11px] text-zinc-400">
                Generate title and card previews when URLs are shared
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={linkPreviews}
              aria-label="Toggle rich link previews"
              onClick={toggleLinkPreviews}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                linkPreviews ? "bg-zinc-100" : "bg-zinc-800",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out",
                  linkPreviews ? "translate-x-5 bg-zinc-950" : "translate-x-0 bg-zinc-400",
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-zinc-200">
                Stealth Blur Shield
              </span>
              <span className="text-[11px] text-zinc-400">
                Blur conversation screen whenever window loses focus or switches tabs
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacyShield}
              aria-label="Toggle stealth blur shield"
              onClick={togglePrivacyShield}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                privacyShield ? "bg-zinc-100" : "bg-zinc-800",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out",
                  privacyShield ? "translate-x-5 bg-zinc-950" : "translate-x-0 bg-zinc-400",
                )}
              />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed border-t border-white/5 pt-2">
            Notice: When enabled, preview metadata is fetched by the Luna preview proxy for the requested URL. Disabling prevents any link preview requests.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-white/5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
          Sensory & Feedback
        </span>
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-zinc-200">
                Tactile Haptics
              </span>
              <span className="text-[11px] text-zinc-400">
                Subtle vibration pulses on match, messages, and key actions
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={haptics}
              aria-label="Toggle tactile haptics"
              onClick={toggleHaptics}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                haptics ? "bg-zinc-100" : "bg-zinc-800",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out",
                  haptics ? "translate-x-5 bg-zinc-950" : "translate-x-0 bg-zinc-400",
                )}
              />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed border-t border-white/5 pt-2">
            Supports Android Vibration API, iOS Taptic fallback, and PWA system haptics. Muting master sound also silences haptics.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-white/5">
        <span className="text-xs font-semibold uppercase tracking-wider text-red-400/80 font-mono">
          Reset
        </span>
        <div className="rounded-xl border border-red-500/20 bg-red-950/15 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-red-300">Start fresh</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Clears your name and seat from this device. Cannot be undone.
          </p>
          {confirmDelete ? (
            <div className="flex items-center gap-3 pt-1">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteAccountOrBurn}
                disabled={deleting}
              >
                {deleting ? "Wiping…" : "Yes, reset everything"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="gap-1.5 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
