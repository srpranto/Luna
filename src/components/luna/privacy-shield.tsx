"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export function PrivacyShield() {
  const [blurred, setBlurred] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isPrintScreen = e.key === "PrintScreen";
      const isMacScreenshot = e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5");
      const isWinSnipping = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s";
      const isPrint = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p";

      if (isPrintScreen || isMacScreenshot || isWinSnipping || isPrint) {
        if (isPrint) {
          e.preventDefault();
        }
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("").catch(() => {});
        }
        setBlurred(true);
        setWarning("Screenshots and captures are restricted in private chat.");
        const t1 = window.setTimeout(() => setBlurred(false), 900);
        const t2 = window.setTimeout(() => setWarning(null), 3500);
        return () => {
          window.clearTimeout(t1);
          window.clearTimeout(t2);
        };
      }
    }

    function handleFocusChange() {
      if (document.hidden || !document.hasFocus()) {
        setBlurred(true);
      } else {
        const t = window.setTimeout(() => {
          if (!document.hidden && document.hasFocus()) {
            setBlurred(false);
          }
        }, 80);
        return () => window.clearTimeout(t);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleFocusChange);
    window.addEventListener("focus", handleFocusChange);
    document.addEventListener("visibilitychange", handleFocusChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleFocusChange);
      window.removeEventListener("focus", handleFocusChange);
      document.removeEventListener("visibilitychange", handleFocusChange);
    };
  }, []);

  return (
    <>
      {blurred && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/98 backdrop-blur-3xl p-6 text-center select-none"
          aria-hidden="true"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-white/10 shadow-inner mb-3">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            Luna Private Sanctuary
          </span>
          <span className="mt-1 text-xs text-zinc-400 font-mono">
            Screen protected • Content hidden while window is unfocused
          </span>
        </div>
      )}

      {warning && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-amber-500/30 bg-zinc-950/95 px-4 py-1.5 text-xs text-amber-300 shadow-2xl backdrop-blur-xl animate-fade-up">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="font-medium">{warning}</span>
        </div>
      )}
    </>
  );
}
