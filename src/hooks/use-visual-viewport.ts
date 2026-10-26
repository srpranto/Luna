"use client";

import { useEffect, useState } from "react";

export interface VisualViewportState {
  visualViewportHeight: number | null;
  keyboardHeight: number;
  isKeyboardOpen: boolean;
}

export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({
    visualViewportHeight: null,
    keyboardHeight: 0,
    isKeyboardOpen: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId: number | null = null;

    const updateViewport = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        const innerH = window.innerHeight;
        const currentHeight = vv ? vv.height : innerH;
        const currentTop = vv ? vv.offsetTop : 0;
        const kbHeight = Math.max(0, innerH - currentHeight);
        const kbOpen = kbHeight > 100;

        document.documentElement.style.setProperty("--visual-viewport-height", `${currentHeight}px`);
        document.documentElement.style.setProperty("--visual-viewport-offset-top", `${currentTop}px`);
        document.documentElement.style.setProperty("--keyboard-height", `${kbHeight}px`);

        // Prevent iOS Safari from scrolling window/body out of alignment on focus
        if (window.scrollY !== 0) {
          window.scrollTo(0, 0);
        }
        if (document.body.scrollTop !== 0) {
          document.body.scrollTop = 0;
        }

        setState({
          visualViewportHeight: currentHeight,
          keyboardHeight: kbHeight,
          isKeyboardOpen: kbOpen,
        });
      });
    };

    updateViewport();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updateViewport);
      vv.addEventListener("scroll", updateViewport);
    }
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (vv) {
        vv.removeEventListener("resize", updateViewport);
        vv.removeEventListener("scroll", updateViewport);
      }
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  return state;
}
