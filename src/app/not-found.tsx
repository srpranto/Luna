import Link from "next/link";
import { PaperShell } from "@/components/luna/paper-shell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { LunaMoon } from "@/components/luna/luna-moon";

export default function NotFound() {
  return (
    <PaperShell>
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] mb-4">
          <LunaMoon className="h-6 w-6 text-zinc-300" />
        </div>
        <h1 className="text-5xl sm:text-6xl font-mono font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500">
          404
        </h1>
        <p className="mt-4 text-base font-semibold text-zinc-100">Page Not Found</p>
        <p className="mt-1 text-xs text-zinc-400 max-w-xs">
          This conversation doesn&apos;t exist, or has already ended.
        </p>
        <Link href="/" className="mt-6">
          <Button variant="secondary" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Luna</span>
          </Button>
        </Link>
      </div>
    </PaperShell>
  );
}
