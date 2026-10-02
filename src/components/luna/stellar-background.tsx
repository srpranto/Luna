"use client";

const FULL_VIEW_STARS = [
  { top: "4%", left: "8%", size: 1, duration: "3.6s", delay: "0.2s" },
  { top: "7%", left: "24%", size: 1.5, duration: "4.8s", delay: "1.1s", glow: true },
  { top: "5%", left: "47%", size: 1, duration: "3.2s", delay: "2.4s" },
  { top: "9%", left: "71%", size: 2, duration: "4.2s", delay: "0.7s", glow: true },
  { top: "6%", left: "88%", size: 1, duration: "3.9s", delay: "1.9s" },
  { top: "12%", left: "15%", size: 1.5, duration: "5.1s", delay: "0.4s" },
  { top: "16%", left: "38%", size: 1, duration: "4.1s", delay: "2.8s" },
  { top: "14%", left: "59%", size: 2, duration: "3.7s", delay: "1.3s", glow: true },
  { top: "18%", left: "82%", size: 1, duration: "4.6s", delay: "0.5s" },
  { top: "15%", left: "95%", size: 1.5, duration: "3.4s", delay: "2.1s" },
  { top: "22%", left: "5%", size: 1, duration: "5.4s", delay: "1.6s" },
  { top: "25%", left: "29%", size: 2, duration: "4.3s", delay: "0.3s", glow: true },
  { top: "28%", left: "49%", size: 1, duration: "3.7s", delay: "2.5s" },
  { top: "24%", left: "67%", size: 1.5, duration: "4.9s", delay: "1.4s" },
  { top: "27%", left: "91%", size: 1, duration: "3.3s", delay: "0.8s" },
  { top: "33%", left: "12%", size: 2, duration: "4.5s", delay: "2.0s", glow: true },
  { top: "36%", left: "34%", size: 1, duration: "4.2s", delay: "3.0s" },
  { top: "38%", left: "55%", size: 1.5, duration: "3.5s", delay: "1.7s" },
  { top: "34%", left: "78%", size: 1, duration: "5.2s", delay: "2.2s" },
  { top: "41%", left: "96%", size: 1.5, duration: "4.0s", delay: "0.9s" },
  { top: "45%", left: "4%", size: 1, duration: "3.8s", delay: "2.7s" },
  { top: "48%", left: "21%", size: 2, duration: "4.7s", delay: "1.0s", glow: true },
  { top: "44%", left: "43%", size: 1, duration: "3.6s", delay: "0.6s" },
  { top: "49%", left: "64%", size: 1.5, duration: "5.0s", delay: "2.3s" },
  { top: "46%", left: "86%", size: 1, duration: "4.4s", delay: "1.5s" },
  { top: "54%", left: "16%", size: 1.5, duration: "3.9s", delay: "0.4s" },
  { top: "58%", left: "31%", size: 1, duration: "4.8s", delay: "2.9s" },
  { top: "55%", left: "52%", size: 2, duration: "4.2s", delay: "1.2s", glow: true },
  { top: "59%", left: "74%", size: 1, duration: "3.5s", delay: "0.8s" },
  { top: "53%", left: "93%", size: 1.5, duration: "5.3s", delay: "2.0s" },
  { top: "64%", left: "7%", size: 2, duration: "4.6s", delay: "0.3s", glow: true },
  { top: "67%", left: "26%", size: 1, duration: "3.3s", delay: "2.6s" },
  { top: "63%", left: "45%", size: 1.5, duration: "4.9s", delay: "1.7s" },
  { top: "68%", left: "69%", size: 1, duration: "3.7s", delay: "0.5s" },
  { top: "65%", left: "84%", size: 2, duration: "5.1s", delay: "2.2s", glow: true },
  { top: "73%", left: "14%", size: 1, duration: "4.3s", delay: "1.1s" },
  { top: "76%", left: "37%", size: 1.5, duration: "3.6s", delay: "2.8s" },
  { top: "72%", left: "58%", size: 1, duration: "4.7s", delay: "0.9s" },
  { top: "78%", left: "77%", size: 2, duration: "4.0s", delay: "2.4s", glow: true },
  { top: "75%", left: "92%", size: 1, duration: "5.2s", delay: "1.5s" },
  { top: "82%", left: "3%", size: 1.5, duration: "3.8s", delay: "0.7s" },
  { top: "85%", left: "22%", size: 1, duration: "4.5s", delay: "3.1s" },
  { top: "88%", left: "41%", size: 2, duration: "3.9s", delay: "1.8s", glow: true },
  { top: "84%", left: "63%", size: 1, duration: "5.0s", delay: "0.2s" },
  { top: "87%", left: "85%", size: 1.5, duration: "4.2s", delay: "2.5s" },
  { top: "93%", left: "11%", size: 1, duration: "3.5s", delay: "1.3s" },
  { top: "95%", left: "33%", size: 2, duration: "4.8s", delay: "0.6s", glow: true },
  { top: "92%", left: "54%", size: 1, duration: "4.1s", delay: "2.7s" },
  { top: "96%", left: "73%", size: 1.5, duration: "3.7s", delay: "1.9s" },
  { top: "94%", left: "95%", size: 1, duration: "5.3s", delay: "0.4s" },
];

export function StellarBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-radial-[ellipse_80%_60%_at_50%_30%] from-indigo-950/25 via-transparent to-transparent opacity-70" />
      <div className="absolute inset-0 bg-radial-[ellipse_60%_50%_at_80%_70%] from-purple-950/15 via-transparent to-transparent opacity-60" />

      {FULL_VIEW_STARS.map((star, idx) => (
        <span
          key={idx}
          className="stellar-star"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDuration: star.duration,
            animationDelay: star.delay,
            boxShadow: star.glow ? "0 0 4px 1.5px rgba(255, 255, 255, 0.75)" : undefined,
          }}
        />
      ))}
    </div>
  );
}
