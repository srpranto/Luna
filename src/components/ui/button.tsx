import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-sm font-medium transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400",
  {
    variants: {
      variant: {
        default: "bg-zinc-50 text-zinc-950 hover:bg-zinc-200 shadow-sm active:scale-[0.98]",
        solid: "bg-zinc-50 text-zinc-950 hover:bg-zinc-200 shadow-sm active:scale-[0.98]",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 active:scale-[0.98]",
        outline:
          "border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 active:scale-[0.98]",
        secondary:
          "bg-zinc-900 text-zinc-200 border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:bg-zinc-800 hover:text-white active:scale-[0.98]",
        ghost: "bg-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
        line: "border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.98]",
        link: "text-zinc-400 underline-offset-4 hover:underline hover:text-zinc-100",
        success:
          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-md",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-11 px-6 text-sm rounded-lg font-medium",
        icon: "h-8 w-8 p-0 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
