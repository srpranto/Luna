"use client";

import { useState, useMemo, type KeyboardEvent, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Hash, Sparkles, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeInterests } from "@/lib/constants";
import { triggerHaptic } from "@/lib/sound-effects";
import { springTactile, springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { TopicStat } from "@/lib/types";

const POPULAR_TAGS = [
  "philosophy",
  "sleeplessness",
  "lo-fi & ambient",
  "coding & tech",
  "quiet thoughts",
  "astrophysics",
  "rainy nights",
  "nostalgia",
  "music",
  "coffee & tea",
  "overthinking",
  "writing",
  "life questions",
  "just listening",
];

export interface TopicSelectorProps {
  value: string[];
  onChange: (next: string[]) => void;
  onSubmit?: () => void;
  activeQueueTopics?: string[];
  activeTopicStats?: TopicStat[];
}

export function TopicSelector({
  value,
  onChange,
  onSubmit,
  activeQueueTopics,
  activeTopicStats,
}: TopicSelectorProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Map of active counts for live badges
  const statsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (activeTopicStats && activeTopicStats.length > 0) {
      for (const item of activeTopicStats) {
        map.set(item.topic.toLowerCase(), item.count);
      }
    } else if (activeQueueTopics && activeQueueTopics.length > 0) {
      for (const t of activeQueueTopics) {
        map.set(t.toLowerCase(), (map.get(t.toLowerCase()) ?? 0) + 1);
      }
    }
    return map;
  }, [activeTopicStats, activeQueueTopics]);

  // Construct combined topic list: live active queue topics first, then nocturnal baseline
  const cloudTopics = useMemo(() => {
    const liveKeys = Array.from(statsMap.keys());
    const combined = Array.from(new Set([...liveKeys, ...POPULAR_TAGS]));
    return combined;
  }, [statsMap]);

  const visibleTopics = expanded ? cloudTopics : cloudTopics.slice(0, 8);
  const hasLiveTopics = statsMap.size > 0;

  function commitWords(text: string) {
    if (!text.trim()) return;
    const combined = [...value, ...text.split(",")];
    const sanitized = sanitizeInterests(combined);
    triggerHaptic("light");
    onChange(sanitized);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) {
        commitWords(draft);
      } else if (e.key === "Enter" && onSubmit) {
        onSubmit();
      }
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw.includes(",")) {
      commitWords(raw);
    } else {
      setDraft(raw.toLowerCase());
    }
  }

  function handleBlur() {
    if (draft.trim()) {
      commitWords(draft);
    }
  }

  function handleRemove(item: string) {
    triggerHaptic("light");
    onChange(value.filter((entry) => entry !== item));
  }

  function handleToggleTag(tag: string) {
    triggerHaptic("selection");
    const set = new Set(value);
    if (set.has(tag)) {
      set.delete(tag);
      onChange([...set]);
    } else if (set.size < 10) {
      set.add(tag);
      onChange([...set]);
    }
  }

  function handleClear() {
    triggerHaptic("light");
    onChange([]);
    setDraft("");
  }

  const reachedMax = value.length >= 10;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Header with status and count */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-tight text-zinc-200">What do you like?</span>
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-[11px] font-mono tabular-nums">
            {value.length > 0 ? `${value.length}/10` : "optional"}
          </span>
          {value.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={handleClear}
              className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors cursor-pointer text-[11px] p-1 -m-1"
            >
              Clear
            </motion.button>
          )}
        </div>
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={reachedMax}
            placeholder={reachedMax ? "10 topics max" : "Add topics (e.g. philosophy, coding)..."}
            className="lowercase text-base sm:text-sm pr-9 bg-[#080b18]/90 border-indigo-500/25 text-white placeholder:text-zinc-500 focus-visible:border-indigo-400/60 focus-visible:ring-1 focus-visible:ring-indigo-400/30 rounded-xl h-10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
          />
          <Hash className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400/50 pointer-events-none" />
        </div>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => commitWords(draft)}
            disabled={!draft.trim() || reachedMax}
            className="h-10 px-3.5 rounded-xl border border-indigo-400/25 bg-[#141a32] hover:bg-[#1a2242] text-indigo-100 text-xs cursor-pointer touch-manipulation shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span>Add</span>
          </Button>
        </motion.div>
      </div>

      {/* Selected tags chip container */}
      {value.length > 0 && (
        <motion.div layout className="flex flex-wrap gap-1.5 pt-0.5">
          <AnimatePresence>
            {value.map((item) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, scale: 0.8, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -4 }}
                transition={springTactile}
                layout
              >
                <Badge
                  variant="secondary"
                  className="gap-1.5 py-1 px-3 text-xs lowercase rounded-full bg-[#3b5bfd]/20 border border-[#3b5bfd]/40 text-blue-100 shadow-[0_0_10px_rgba(59,91,253,0.2)] hover:border-[#3b5bfd]/60 transition-colors touch-manipulation"
                >
                  <span>#{item}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    aria-label={`Remove ${item}`}
                    className="rounded-full hover:bg-white/10 p-1 -mr-1 transition-colors cursor-pointer text-indigo-200/70 hover:text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Live Celestial Topic Cloud */}
      <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.05]">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            {hasLiveTopics ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              </span>
            ) : (
              <Sparkles className="h-3 w-3 text-indigo-400/80" />
            )}
            <span className="font-medium text-zinc-300">
              {hasLiveTopics ? "Live in queue now" : "Trending under the stars"}
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              setExpanded(!expanded);
            }}
            className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <span>{expanded ? "Fewer" : "Show all"}</span>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-3 w-3" />
            </motion.div>
          </motion.button>
        </div>

        <motion.div
          layout
          className={cn(
            "flex flex-wrap gap-1.5",
            expanded && "max-h-40 sm:max-h-52 overflow-y-auto pr-0.5"
          )}
        >
          <AnimatePresence>
            {visibleTopics.map((topic) => {
              const isSelected = value.includes(topic);
              const count = statsMap.get(topic.toLowerCase());

              return (
                <motion.button
                  key={topic}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={springSmooth}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleToggleTag(topic)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-all cursor-pointer touch-manipulation border flex items-center gap-1 select-none",
                    isSelected
                      ? "bg-[#3b5bfd] text-white border-blue-400/50 shadow-[0_0_20px_rgba(59,91,253,0.4),0_2px_8px_rgba(0,0,0,0.4)] font-semibold"
                      : count && count > 0
                        ? "bg-[#0d1428]/95 text-cyan-300 border-cyan-400/35 hover:border-cyan-300/60 hover:bg-[#121c38] shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                        : "bg-[#0b1022]/85 text-zinc-300 border-indigo-400/15 hover:border-indigo-400/40 hover:text-white hover:bg-[#121832] hover:shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                  )}
                >
                  <span className="font-mono text-[11px]">#{topic}</span>
                  {count && count > 0 && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded-full text-[9px] font-mono tabular-nums leading-none",
                        isSelected
                          ? "bg-white/20 text-white font-bold"
                          : "bg-cyan-950/80 border border-cyan-400/35 text-cyan-300"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
