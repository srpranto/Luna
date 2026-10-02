"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
  size: number;
  brightness: number;
}

export function StarfieldCanvas({
  speed = 2.5,
  hyperspace = false,
  className = "",
}: {
  speed?: number;
  hyperspace?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth ?? window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight ?? window.innerHeight);

    const numStars = width < 640 ? 90 : 160;
    const maxDepth = 1000;
    const stars: Star[] = [];

    function initStar(): Star {
      const z = Math.random() * maxDepth + 1;
      return {
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z,
        pz: z,
        size: Math.random() * 1.5 + 0.6,
        brightness: Math.random() * 0.5 + 0.5,
      };
    }

    for (let i = 0; i < numStars; i++) {
      stars.push(initStar());
    }

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", handleResize);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let currentSpeed = speed;

    const render = () => {
      const targetSpeed = hyperspace ? 24 : speed;
      currentSpeed += (targetSpeed - currentSpeed) * 0.05;

      ctx.fillStyle = hyperspace ? "rgba(9, 9, 11, 0.25)" : "rgba(9, 9, 11, 0.4)";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!prefersReducedMotion) {
          star.pz = star.z;
          star.z -= currentSpeed;

          if (star.z <= 0) {
            star.z = maxDepth;
            star.pz = maxDepth;
            star.x = (Math.random() - 0.5) * width * 2;
            star.y = (Math.random() - 0.5) * height * 2;
          }
        }

        const k = 250 / star.z;
        const px = star.x * k + cx;
        const py = star.y * k + cy;

        const pk = 250 / star.pz;
        const prevX = star.x * pk + cx;
        const prevY = star.y * pk + cy;

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          const depthRatio = 1 - star.z / maxDepth;
          const alpha = Math.min(
            1,
            Math.max(0.1, depthRatio * star.brightness * (hyperspace ? 1.4 : 1)),
          );

          if (currentSpeed > 3 || hyperspace) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = star.size * (hyperspace ? 1.8 : 1);
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(px, py);
            ctx.stroke();
          } else {
            const radius = star.size * (0.8 + depthRatio * 0.8);
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();

            if (depthRatio > 0.7) {
              ctx.beginPath();
              ctx.fillStyle = `rgba(165, 180, 252, ${alpha * 0.25})`;
              ctx.arc(px, py, radius * 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, [speed, hyperspace]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}
