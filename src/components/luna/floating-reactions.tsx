"use client";

import { useEffect } from "react";

export interface FloatingItem {
  id: string;
  emoji: string;
  leftPercent: number;
}

export function FloatingReactionsOverlay({
  items,
  onFinished,
}: {
  items: FloatingItem[];
  onFinished: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
      {items.map((item) => (
        <FloatingReaction key={item.id} item={item} onDone={() => onFinished(item.id)} />
      ))}
    </div>
  );
}

function FloatingReaction({ item, onDone }: { item: FloatingItem; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="absolute bottom-16 text-3xl select-none animate-reaction-float filter drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]"
      style={{ left: `${item.leftPercent}%` }}
    >
      {item.emoji}
    </div>
  );
}
