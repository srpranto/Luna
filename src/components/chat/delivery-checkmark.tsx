"use client";

import { cn } from "@/lib/utils";

interface DeliveryCheckmarkProps {
  status?: "sending" | "sent" | "delivered" | "seen" | "failed";
  seenAt?: string | null;
  className?: string;
}

export function DeliveryCheckmark({
  status = "sent",
  seenAt,
  className,
}: DeliveryCheckmarkProps) {
  const isSeen = Boolean(seenAt) || status === "seen";
  const isDelivered = status === "delivered" || isSeen;
  const isSending = status === "sending";
  const isFailed = status === "failed";

  if (isFailed) {
    return (
      <span
        aria-label="Failed to deliver"
        className={cn(
          "inline-flex items-center justify-center font-bold text-rose-400 text-[10px]",
          className,
        )}
      >
        !
      </span>
    );
  }

  if (isSending) {
    return (
      <span
        aria-label="Sending message"
        className={cn("inline-flex items-center gap-0.5 text-zinc-500", className)}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400/70 animate-pulse" />
      </span>
    );
  }

  return (
    <span
      aria-label={isSeen ? "Seen" : isDelivered ? "Delivered" : "Sent"}
      className={cn(
        "inline-flex items-center select-none transition-colors duration-200",
        isSeen
          ? "text-sky-300 drop-shadow-[0_0_4px_rgba(56,189,248,0.55)] font-semibold"
          : "text-cyan-400/85",
        className,
      )}
    >
      {/* First checkmark */}
      <svg
        className="h-3 w-3 animate-tick-pop stroke-[2.2] shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>

      {/* Second checkmark for delivered / seen */}
      {isDelivered && (
        <svg
          className="h-3 w-3 -ml-1.5 animate-second-tick stroke-[2.2] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}
