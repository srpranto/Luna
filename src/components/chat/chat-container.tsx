import type { ReactNode } from "react";
import { BackgroundEffects } from "@/components/chat/background-effects";
import { InstallAppBanner } from "@/components/chat/install-app-banner";

export function ChatContainer({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-[var(--visual-viewport-height,100dvh)] h-[var(--visual-viewport-height,100dvh)] max-h-[var(--visual-viewport-height,100dvh)] w-full bg-[#070914] flex flex-col items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
      <BackgroundEffects />

      <div className="pointer-events-none fixed inset-0 ambient-glow opacity-50" />

      <div className="relative z-10 flex h-[var(--visual-viewport-height,100dvh)] sm:h-[92vh] max-h-[var(--visual-viewport-height,100dvh)] sm:max-h-[92vh] w-full max-w-4xl flex-col bg-[#070914] sm:bg-[#0a0e1e]/90 sm:rounded-3xl border-0 sm:border border-indigo-500/20 shadow-[0_30px_90px_-20px_rgba(2,6,23,0.95),0_0_80px_rgba(99,102,241,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-2xl overflow-hidden">
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>

      <InstallAppBanner />
    </main>
  );
}
