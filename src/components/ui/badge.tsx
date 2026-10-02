import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-400",
  {
    variants: {
      variant: {
        default: "border-transparent bg-zinc-100 text-zinc-900 shadow-sm",
        secondary:
          "border-white/10 bg-zinc-900 text-zinc-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]",
        destructive: "border-red-500/20 bg-red-500/10 text-red-400",
        outline: "border-zinc-800 text-zinc-300 bg-zinc-950/50",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
