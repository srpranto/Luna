import type { ReactNode } from "react";
import { BackgroundEffects } from "@/components/chat/background-effects";
import { InstallAppBanner } from "@/components/chat/install-app-banner";

export function ChatContainer({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-[var(--visual-viewport-height,100dvh)] h-[var(--visual-viewport-height,100dvh)] max-h-[var(--visual-viewport-height,100dvh)] w-full bg-[#09090b] flex flex-col items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
      <BackgroundEffects />

      <div className="pointer-events-none fixed inset-0 ambient-glow opacity-50" />

      <div className="relative z-10 flex h-[var(--visual-viewport-height,100dvh)] sm:h-[92vh] max-h-[var(--visual-viewport-height,100dvh)] sm:max-h-[92vh] w-full max-w-4xl flex-col bg-[#09090b]/95 sm:bg-[#0d0d0f]/95 sm:rounded-2xl border-0 sm:border border-white/10 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl overflow-hidden transition-[height] duration-150 ease-out">
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>

      <InstallAppBanner />
    </main>
  );
}
