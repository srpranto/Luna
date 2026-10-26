import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3.5 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 shadow-inner transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-white/30 focus-visible:ring-1 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
