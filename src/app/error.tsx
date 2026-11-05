"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[Luna Root Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl space-y-5 animate-scale-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100 font-mono">
            System Anomaly Detected
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Luna encountered an unexpected state. Your local messages and cryptographic identity are safely preserved.
          </p>
        </div>

        {error?.message && (
          <div className="rounded-xl border border-white/5 bg-zinc-950/70 p-3 text-left">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">Diagnostic Details</span>
            <p className="text-xs font-mono text-rose-300/90 break-words mt-1 line-clamp-3">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <Button
            type="button"
            variant="default"
            onClick={() => reset()}
            className="flex-1 h-10 gap-2 font-mono text-xs rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium cursor-pointer transition-transform active:scale-[0.96]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Recover Session</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              router.push("/");
            }}
            className="flex-1 h-10 gap-2 font-mono text-xs rounded-xl border border-white/10 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium cursor-pointer transition-transform active:scale-[0.96]"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Return Home</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
