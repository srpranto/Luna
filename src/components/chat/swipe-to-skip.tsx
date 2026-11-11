"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FastForward, ArrowRight } from "lucide-react";
import { triggerHaptic } from "@/lib/sound-effects";
import { springTactile } from "@/lib/motion";
import { SkipConfirmDialog } from "@/components/chat/skip-confirm-dialog";
import { cn } from "@/lib/utils";

export interface SwipeToSkipProps {
  /** Whether the chat is currently closed/ended by peer or self */
  closed: boolean;
  /** Function to trigger matchmaking for the next stranger */
  onNext: () => void;
  /** Optional children wrapped inside the gesture boundary */
  children?: ReactNode;
  /** Whether the chat session is currently busy transitioning */
  busy?: boolean;
}

const SWIPE_THRESHOLD_PX = 75;
const DEADZONE_PX = 10;

export function SwipeToSkip({
  closed,
  onNext,
  children,
  busy = false,
}: SwipeToSkipProps) {
  const [dragDistance, setDragDistance] = useState(0);
  const [isEngaged, setIsEngaged] = useState(false);
  const [isPastThreshold, setIsPastThreshold] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const startCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const directionLockRef = useRef<"horizontal" | "vertical" | null>(null);
  const isPastThresholdRef = useRef(false);
  const hasTriggeredThresholdHapticRef = useRef(false);

  const handleConfirmSkip = useCallback(() => {
    setShowConfirmDialog(false);
    onNext();
  }, [onNext]);

  const handleCancelSkip = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTouchStart = (e: TouchEvent) => {
      // Gesture only allowed on mobile viewports (< 768px)
      if (window.innerWidth >= 768 || busy) return;

      const touch = e.touches[0];
      if (!touch) return;

      // STRICT GATE: Only active in the bottom 50% of the viewport
      const screenHeight = window.innerHeight;
      if (touch.clientY < screenHeight * 0.5) {
        return;
      }

      // EXCLUSION GATE: Ignore touches originating on inputs, textareas, or buttons
      const rawTarget = (touch.target || e.target) as HTMLElement | null;
      if (rawTarget && typeof rawTarget === "object" && "tagName" in rawTarget) {
        const el = rawTarget as HTMLElement;
        const tagName = el.tagName?.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "button" ||
          (typeof el.closest === "function" &&
            (el.closest("button") ||
              el.closest("input") ||
              el.closest("textarea") ||
              el.closest("[role='button']") ||
              el.closest("[data-no-swipe='true']")))
        ) {
          return;
        }
      }

      startCoordsRef.current = { x: touch.clientX, y: touch.clientY };
      directionLockRef.current = null;
      hasTriggeredThresholdHapticRef.current = false;
      isPastThresholdRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!startCoordsRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - startCoordsRef.current.x;
      const dy = touch.clientY - startCoordsRef.current.y;

      // Disambiguate horizontal vs vertical intent
      if (directionLockRef.current === null) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Small jitter deadzone
        if (absX < DEADZONE_PX && absY < DEADZONE_PX) return;

        // If swipe is moving leftwards or vertically dominant, lock as vertical/ignored
        if (dx <= 0 || absY > absX * 0.8) {
          directionLockRef.current = "vertical";
          return;
        }

        // Confirmed horizontal left-to-right swipe
        if (dx > DEADZONE_PX && dx > absY * 1.2) {
          directionLockRef.current = "horizontal";
          setIsEngaged(true);
        }
      }

      if (directionLockRef.current === "horizontal") {
        // Prevent accidental page scroll or back navigation while actively swiping to skip
        if (e.cancelable) {
          e.preventDefault();
        }

        const clampedDx = Math.max(0, dx);
        setDragDistance(clampedDx);

        const past = clampedDx >= SWIPE_THRESHOLD_PX;
        isPastThresholdRef.current = past;
        setIsPastThreshold(past);

        if (past && !hasTriggeredThresholdHapticRef.current) {
          triggerHaptic("selection");
          hasTriggeredThresholdHapticRef.current = true;
        } else if (!past && hasTriggeredThresholdHapticRef.current) {
          hasTriggeredThresholdHapticRef.current = false;
        }
      }
    };

    const handleTouchEnd = () => {
      if (startCoordsRef.current && directionLockRef.current === "horizontal") {
        if (isPastThresholdRef.current && !busy) {
          // VERIFICATION RULE:
          // If closed (peer already skipped/left) -> instant onNext() with no confirmation
          // If active (!closed) -> require verification to prevent accidental skip
          if (closed) {
            triggerHaptic("medium");
            onNext();
          } else {
            triggerHaptic("heavy");
            setShowConfirmDialog(true);
          }
        }
      }

      // Reset touch gesture state
      startCoordsRef.current = null;
      directionLockRef.current = null;
      isPastThresholdRef.current = false;
      hasTriggeredThresholdHapticRef.current = false;
      setIsEngaged(false);
      setDragDistance(0);
      setIsPastThreshold(false);
    };

    const handleTouchCancel = () => {
      startCoordsRef.current = null;
      directionLockRef.current = null;
      isPastThresholdRef.current = false;
      hasTriggeredThresholdHapticRef.current = false;
      setIsEngaged(false);
      setDragDistance(0);
      setIsPastThreshold(false);
    };

    // Passive false on touchmove is needed to allow e.preventDefault() during confirmed horizontal swipe
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [closed, onNext, busy]);

  // Visual translation calculation: smooth rubber-band curve
  const visualX = isEngaged
    ? Math.min(Math.max(-10, dragDistance * 0.7 - 25), 65)
    : -120;

  return (
    <>
      {children}

      {/* Floating Left-Center Tab (Vertically Centered at top: 50%, left: 0) */}
      <AnimatePresence>
        {isEngaged && (
          <motion.div
            initial={{ opacity: 0, x: -80 }}
            animate={{
              opacity: 1,
              x: visualX,
              scale: isPastThreshold ? 1.04 : 1,
            }}
            exit={{ opacity: 0, x: -100 }}
            transition={springTactile}
            className={cn(
              "fixed left-0 top-1/2 -translate-y-1/2 z-50 pointer-events-none select-none",
              "flex items-center gap-2.5 rounded-r-2xl border-y border-r py-3 pl-3 pr-4 shadow-2xl backdrop-blur-2xl transition-colors duration-150",
              isPastThreshold
                ? "bg-amber-950/90 border-amber-500/60 text-amber-200 shadow-[0_8px_32px_rgba(245,158,11,0.35),0_0_20px_rgba(245,158,11,0.25)]"
                : "bg-zinc-950/90 border-white/20 text-zinc-300 shadow-[0_8px_32px_rgba(0,0,0,0.8),0_0_15px_rgba(99,102,241,0.2)]"
            )}
          >
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl border transition-colors",
                isPastThreshold
                  ? "border-amber-400/50 bg-amber-500/20 text-amber-300"
                  : "border-white/10 bg-zinc-900/80 text-zinc-400"
              )}
            >
              {isPastThreshold ? (
                <FastForward className="h-4 w-4 animate-pulse" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </div>

            <div className="flex flex-col">
              <span
                className={cn(
                  "text-xs font-semibold tracking-tight transition-colors",
                  isPastThreshold ? "text-amber-200" : "text-zinc-200"
                )}
              >
                {isPastThreshold ? "Release to Skip" : "Swipe to Skip"}
              </span>
              <span className="text-[10px] text-zinc-400">
                {closed ? "Instant skip" : "Asks confirmation"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog to Prevent Accidental Skips on Active Chats */}
      <SkipConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmSkip}
        onCancel={handleCancelSkip}
      />
    </>
  );
}
