import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-sm font-medium transition-all duration-200 ease-coloros disabled:pointer-events-none disabled:opacity-40 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 touch-manipulation active:scale-[0.96]",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-950 hover:bg-white shadow-[0_0_20px_rgba(255,255,255,0.15)] font-medium",
        destructive:
          "bg-rose-950/40 text-rose-300 border border-rose-500/30 hover:bg-rose-950/60",
        outline:
          "border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 hover:border-zinc-700",
        secondary:
          "bg-zinc-900 text-zinc-100 border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-zinc-850 hover:border-white/20 hover:text-white",
        ghost: "bg-transparent text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100",
        success:
          "bg-white/10 text-zinc-100 border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-white/15",
      },
      size: {
        default: "min-h-[38px] px-4 py-2 rounded-xl",
        sm: "min-h-[34px] px-3 text-xs rounded-lg",
        lg: "min-h-[44px] px-6 text-sm rounded-xl font-medium",
        icon: "min-h-[36px] min-w-[36px] p-0 rounded-lg",
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
