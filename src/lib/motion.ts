import type { Transition, Variants } from "framer-motion";

/**
 * Standardized Framer Motion transitions and presets for Luna.
 * Designed for sub-frame buttery responsiveness with zero layout jitter.
 */

export const springTactile: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 28,
};

export const springSmooth: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 30,
};

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 32,
};

export const springBubble: Transition = {
  type: "spring",
  stiffness: 450,
  damping: 26,
};

export const screenTransitionVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.985,
    y: 8,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    y: -8,
    transition: {
      duration: 0.18,
      ease: [0.7, 0, 0.84, 0],
    },
  },
};

export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContainerVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 380,
      damping: 28,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

export const messageBubbleVariants: Variants = {
  initial: (isMe: boolean) => ({
    opacity: 0,
    y: 10,
    scale: 0.96,
    transformOrigin: isMe ? "bottom right" : "bottom left",
  }),
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springBubble,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.12 },
  },
};

export const buttonMotion = {
  whileHover: { scale: 1.025, transition: { duration: 0.15, ease: "easeOut" } },
  whileTap: { scale: 0.96, transition: { duration: 0.08, ease: "easeOut" } },
};

export const iconButtonMotion = {
  whileHover: { scale: 1.08, transition: { duration: 0.15, ease: "easeOut" } },
  whileTap: { scale: 0.92, transition: { duration: 0.08, ease: "easeOut" } },
};

export const pillMotion = {
  whileHover: { scale: 1.03, y: -1, transition: { duration: 0.15, ease: "easeOut" } },
  whileTap: { scale: 0.97, transition: { duration: 0.08, ease: "easeOut" } },
};
