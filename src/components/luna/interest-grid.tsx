"use client";

import { useState, type KeyboardEvent, type ChangeEvent } from "react";
import { X, Plus, Hash, Sparkles, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeInterests } from "@/lib/luna/constants";
import { cn } from "@/lib/utils";

const POPULAR_TAGS = [
  "philosophy",
  "sleeplessness",
  "lo-fi & ambient",
  "quiet thoughts",
  "coding & tech",
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

interface InterestInputProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function InterestGrid({ value, onChange }: InterestInputProps) {
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function commitWords(text: string) {
    if (!text.trim()) return;
    const combined = [...value, ...text.split(",")];
    const sanitized = sanitizeInterests(combined);
    onChange(sanitized);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitWords(draft);
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
    onChange(value.filter((entry) => entry !== item));
  }

  function handleToggleTag(tag: string) {
    if (value.includes(tag)) {
      handleRemove(tag);
    } else {
      if (value.length < 10) {
        onChange([...value, tag]);
      }
    }
  }

  function handleClear() {
    onChange([]);
    setDraft("");
  }

  const reachedMax = value.length >= 10;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-tight text-zinc-200">What do you like?</span>
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-[11px] font-mono">
            {value.length > 0 ? `${value.length}/10` : "optional"}
          </span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors cursor-pointer text-[11px]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={reachedMax}
            placeholder={reachedMax ? "10 topics max" : "Type a topic (e.g. philosophy, lo-fi)…"}
            className="lowercase text-xs sm:text-sm pr-9 bg-zinc-900/80 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-white/30 rounded-xl h-10"
          />
          <Hash className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => commitWords(draft)}
          disabled={!draft.trim() || reachedMax}
          className="shrink-0 h-10 px-3.5 rounded-xl border border-white/10 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 text-xs cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          <span>Add</span>
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {value.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="gap-1.5 py-1 px-3 text-xs lowercase rounded-full bg-zinc-900 border border-white/15 text-zinc-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:border-white/25 transition-all"
            >
              <span>#{item}</span>
              <button
                type="button"
                onClick={() => handleRemove(item)}
                aria-label={`Remove ${item}`}
                className="rounded-full hover:bg-white/10 p-0.5 transition-colors cursor-pointer text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setShowSuggestions(!showSuggestions)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-0.5"
        >
          <Sparkles className="h-3 w-3 text-indigo-400" />
          <span>Browse popular topics</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              showSuggestions && "rotate-180",
            )}
          />
        </button>

        {showSuggestions && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 p-2.5 sm:p-3 rounded-xl border border-white/10 bg-zinc-900/60 max-h-48 sm:max-h-none overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {POPULAR_TAGS.map((tag, idx) => {
              const isSelected = value.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  style={{ animationDelay: `${idx * 25}ms` }}
                  onClick={() => handleToggleTag(tag)}
                  className={cn(
                    "animate-fade-up rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                    isSelected
                      ? "bg-zinc-100 text-zinc-950 shadow-sm"
                      : "bg-zinc-900/90 text-zinc-400 border border-white/10 hover:bg-zinc-800 hover:text-zinc-200 hover:border-white/20",
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
