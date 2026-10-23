"use client";

import { useEffect, useState } from "react";
import { Star, Send, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlackHoleIcon } from "@/components/luna/black-hole-icon";
import { LunaMoon } from "@/components/luna/luna-moon";
import type { VoidLetter } from "@/lib/luna/types";
import { castVoidLetter, listVoidLetters, starVoidLetter } from "@/lib/luna/client";
import { triggerHaptic } from "@/lib/luna/sound";
import { cn } from "@/lib/utils";

function formatAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return "yesterday";
}

export function VoidLetters({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const [letters, setLetters] = useState<VoidLetter[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVoidLetters(deviceId)
      .then((items) => {
        if (!cancelled) {
          setLetters(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load thoughts.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleCast() {
    if (!draft.trim() || submitting) return;
    triggerHaptic("medium");
    setSubmitting(true);
    setError(null);
    try {
      const res = await castVoidLetter({ deviceId, text: draft.trim() });
      if (res.ok && res.letter) {
        const letter = res.letter;
        setLetters((prev) => [letter, ...prev]);
        setDraft("");
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cast thought.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStar(letterId: string) {
    triggerHaptic("selection");
    setLetters((prev) =>
      prev.map((l) => {
        if (l.id === letterId) {
          const nextStarred = !l.hasStarred;
          return {
            ...l,
            hasStarred: nextStarred,
            stars: nextStarred ? l.stars + 1 : Math.max(0, l.stars - 1),
          };
        }
        return l;
      }),
    );

    try {
      const res = await starVoidLetter({ deviceId, letterId });
      setLetters((prev) =>
        prev.map((l) => {
          if (l.id === letterId) {
            return {
              ...l,
              stars: res.stars,
              hasStarred: res.hasStarred,
            };
          }
          return l;
        }),
      );
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative flex flex-col w-full max-w-xl max-h-[92dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl border-t sm:border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden animate-sheet-up sm:animate-none pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0">
        <div className="w-10 h-1 bg-zinc-700/60 rounded-full mx-auto my-2.5 sm:hidden" />
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4 bg-zinc-900/40">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-100 shrink-0">
              <BlackHoleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div>
              <h2 id="void-modal-title" className="text-xs sm:text-sm font-semibold text-zinc-100 flex items-center gap-1.5 sm:gap-2">
                <span>The Midnight Void</span>
                <span className="text-[10px] sm:text-[11px] font-mono text-zinc-500">
                  24h Orbit
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-zinc-400">
                Anonymous thoughts cast by strangers wandering the dark.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors touch-manipulation cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/10 p-3 sm:p-4 bg-zinc-950/60">
          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 280))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleCast();
                }
              }}
              placeholder="Cast a quiet midnight thought into the void… (Ctrl+Enter to cast)"
              rows={2}
              maxLength={280}
              className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900/60 p-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:outline-none transition-colors"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">{draft.length}/280</span>
              <Button
                type="button"
                size="sm"
                onClick={handleCast}
                disabled={submitting || !draft.trim()}
                className="h-8 px-3.5 text-xs bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-medium touch-manipulation cursor-pointer active:scale-95"
              >
                <Send className="h-3 w-3 mr-1" />
                <span>Cast to Void</span>
              </Button>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-400 leading-tight">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Listening to cosmic background…
            </div>
          ) : letters.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              <LunaMoon className="h-6 w-6 mx-auto mb-2 text-zinc-600 opacity-60" />
              <span>The void is quiet tonight. Be the first to leave a message.</span>
            </div>
          ) : (
            letters.map((letter, idx) => (
              <div
                key={letter.id}
                style={{ animationDelay: `${Math.min(idx * 60, 480)}ms` }}
                className="animate-fade-up group relative rounded-xl border border-white/5 bg-zinc-900/40 p-4 transition-all hover:border-white/10 hover:bg-zinc-900/60"
              >
                <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-2">
                  <span className="font-mono text-zinc-400">@{letter.callsign}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{formatAgo(letter.createdAt)}</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed break-words whitespace-pre-wrap">
                  {letter.text}
                </p>
                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => handleToggleStar(letter.id)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors touch-manipulation active:scale-95 cursor-pointer",
                      letter.hasStarred
                        ? "bg-white/10 text-white font-medium border border-white/20 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
                    )}
                  >
                    <Star
                      className={cn(
                        "h-3 w-3",
                        letter.hasStarred && "fill-white text-white",
                      )}
                    />
                    <span className="font-mono text-[11px]">{letter.stars}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
