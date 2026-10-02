import type { ReactNode } from "react";
import { StellarBackground } from "@/components/luna/stellar-background";

export function PaperShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full bg-[#09090b] flex flex-col items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
      <StellarBackground />

      <div className="pointer-events-none fixed inset-0 ambient-glow opacity-50" />

      <div className="relative z-10 flex h-dvh sm:h-[92vh] w-full max-w-4xl flex-col bg-[#0c0d12]/80 sm:rounded-2xl border-0 sm:border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-2xl overflow-hidden">
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </main>
  );
}

export const ChatShell = PaperShell;
