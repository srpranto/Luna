import { cn } from "@/lib/utils";

interface LunaMoonProps {
  className?: string;
  glow?: boolean;
}

export function LunaMoon({ className = "h-4 w-4", glow = false }: LunaMoonProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        {glow && (
          <filter id="luna-moon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <path
        d="M12 3.5 A 8.5 8.5 0 0 0 12 20.5 A 9.5 9.5 0 0 1 12 3.5 Z"
        fill="currentColor"
        filter={glow ? "url(#luna-moon-glow)" : undefined}
      />
    </svg>
  );
}
