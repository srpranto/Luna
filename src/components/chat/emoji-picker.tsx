"use client";

import { useState } from "react";
import { Smile, Hand, Heart, PartyPopper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/sound-effects";

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    id: "smileys",
    name: "Smileys",
    icon: Smile,
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹",
      "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗",
      "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩",
      "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖",
      "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯",
      "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔",
      "🫣", "🤭", "🫢", "🫡", "🤫", "🫠", "🤥", "😶", "😐", "😑",
      "😬", "🙄", "😯", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢",
      "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👻", "💀",
    ],
  },
  {
    id: "gestures",
    name: "Gestures",
    icon: Hand,
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫸", "🫷", "🫳",
      "🫴", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙",
      "👈", "👉", "👆", "🖕", "👇", "☝️", "🫵", "👍", "👎", "✊",
      "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏",
      "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻",
      "👃", "🫀", "🫁", "🧠", "🫂",
    ],
  },
  {
    id: "hearts",
    name: "Hearts & Sparkles",
    icon: Heart,
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "🩶",
      "🩷", "🩵", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗",
      "💖", "💘", "💝", "💟", "✨", "💫", "⭐", "🌟", "🔥", "💥",
      "⚡", "🌙", "🌛", "🌜", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌧️",
      "⛈️", "🌩️", "❄️", "🌊", "🫧", "🌈", "🕊️", "💎", "💯", "🪐",
    ],
  },
  {
    id: "objects",
    name: "Fun & Objects",
    icon: PartyPopper,
    emojis: [
      "🎉", "🎊", "🎈", "🎂", "🎁", "🏆", "🥇", "🥈", "🥉", "🏅",
      "🚀", "🛸", "🪐", "🌍", "☕", "🍵", "🧋", "🍺", "🍻", "🥂",
      "🍷", "🥃", "🍕", "🍔", "🍟", "🌮", "🍿", "🎮", "🕹️", "🎲",
      "🎯", "🎧", "🎵", "🎶", "🎤", "🎸", "📱", "💻", "💡", "🔑",
      "🔒", "🔓", "🔔", "🔕", "📣", "📢", "💬", "💭", "✨", "🪄",
    ],
  },
];

export function EmojiPicker({ onSelectEmoji, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState("smileys");

  const currentCategory =
    EMOJI_CATEGORIES.find((cat) => cat.id === activeCategory) ?? EMOJI_CATEGORIES[0];

  return (
    <>
      {/* Invisible backdrop to dismiss on outside click */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-label="Google Keyboard Emojis"
        className="absolute bottom-full right-0 sm:right-2 mb-2 w-[calc(100vw-1.5rem)] sm:w-88 max-w-sm rounded-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.12)] z-50 p-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
      >
        {/* Category Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
          <div className="flex items-center gap-1">
            {EMOJI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveCategory(cat.id);
                  }}
                  aria-label={cat.name}
                  title={cat.name}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors cursor-pointer touch-manipulation",
                    isActive
                      ? "bg-zinc-800 text-zinc-100 shadow-sm border border-white/15"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            aria-label="Close emoji picker"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Emojis Grid */}
        <div className="grid grid-cols-7 sm:grid-cols-8 gap-1 max-h-48 overflow-y-auto p-0.5 [scrollbar-width:thin] select-none">
          {currentCategory.emojis.map((emoji, idx) => (
            <button
              key={`${emoji}-${idx}`}
              type="button"
              onPointerDown={(e) => {
                // Prevent blurring the textarea so the mobile soft keyboard does NOT dismiss!
                e.preventDefault();
              }}
              onClick={() => {
                triggerHaptic("light");
                onSelectEmoji(emoji);
              }}
              aria-label={`Insert ${emoji}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-zinc-800/80 active:scale-90 transition-transform cursor-pointer touch-manipulation select-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
