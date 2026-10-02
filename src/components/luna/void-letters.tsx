"use client";

import { useEffect, useState } from "react";
import { Star, Send, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlackHoleIcon } from "@/components/luna/black-hole-icon";
import { LunaMoon } from "@/components/luna/luna-moon";
import type { VoidLetter } from "@/lib/luna/types";
import { castVoidLetter, listVoidLetters, starVoidLetter } from "@/lib/luna/client";
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

  async function handleCast() {
    if (!draft.trim() || submitting) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-xl max-h-[92dvh] sm:max-h-[85vh] rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4 bg-zinc-900/40">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-950/40 text-indigo-300 shrink-0">
              <BlackHoleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-semibold text-zinc-100 flex items-center gap-1.5 sm:gap-2">
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
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/10 p-3 sm:p-4 bg-zinc-950/60">
          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 280))}
              placeholder="Cast a quiet midnight thought into the void…"
              rows={2}
              maxLength={280}
              className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900/60 p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/50 focus:outline-none transition-colors"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">{draft.length}/280</span>
              <Button
                type="button"
                size="sm"
                onClick={handleCast}
                disabled={submitting || !draft.trim()}
                className="h-7 px-3 text-xs bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-medium"
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
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                      letter.hasStarred
                        ? "bg-amber-500/15 text-amber-300 font-medium"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
                    )}
                  >
                    <Star
                      className={cn(
                        "h-3 w-3",
                        letter.hasStarred && "fill-amber-400 text-amber-400",
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
