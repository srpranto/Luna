import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-950/70 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_12px_40px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
