import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-zinc-950/60 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
