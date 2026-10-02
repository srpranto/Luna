"use client";

import { useState, type FormEvent } from "react";
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
import { usePwa } from "@/components/luna/pwa-provider";
import type { DeskView } from "@/lib/luna/types";

interface SettingsPanelProps {
  desk: DeskView;
  onClose: () => void;
  onCallsignUpdated: (next: DeskView) => void;
  onStationReset: () => void;
}

export function SettingsPanel({
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
    const random = mintCallsign();
    setHandle(random);
  }

  async function handleDeleteAccountOrBurn() {
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

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
            <Settings className="h-4 w-4 text-zinc-100" />
          </div>
          <div>
            <span className="text-base font-semibold tracking-tight text-zinc-100">Your name</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {status && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
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
              className="font-mono text-sm tracking-wider bg-zinc-900/60 border-zinc-800"
            />
            <Button type="submit" disabled={saving || !handle.trim()} className="shrink-0 h-9">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>2–20 characters</span>
            <button
              type="button"
              onClick={handleMintRandom}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
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
              <Smartphone className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-semibold text-zinc-200">
                {isStandalone ? "Installed on this device" : "Install as App"}
              </span>
            </div>
            {isStandalone && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
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
  );
}
