"use client";

import { Ban } from "lucide-react";

export function BannedView({ reason }: { reason?: string | null }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 sm:p-8 text-center overflow-y-auto">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-950/40 border border-red-500/20 text-red-400 mb-5 shadow-[0_0_25px_rgba(239,68,68,0.15)]">
        <Ban className="h-7 w-7" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 mb-3">
        Access Restricted
      </h2>
      <p className="max-w-md text-sm sm:text-base text-zinc-400 leading-relaxed mb-6">
        {reason ||
          "Your device has been restricted for violating Luna safety and community guidelines."}
      </p>
      <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4 max-w-sm text-xs text-zinc-400 text-left space-y-2 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        <p className="font-semibold text-zinc-200">Community Safety Standard:</p>
        <p className="text-zinc-400">
          • Unsolicited sexual talk and solicitations are strictly prohibited.
        </p>
        <p className="text-zinc-400">
          • Zero tolerance for incest, harassment, and predatory behavior.
        </p>
        <p className="text-zinc-400">
          • Spamming gender/ASL queries across chats is automatically banned.
        </p>
      </div>
      <p className="mt-8 text-xs text-zinc-600">
        Permanent restrictions applied by Luna automated moderation cannot be appealed.
      </p>
    </section>
  );
}
