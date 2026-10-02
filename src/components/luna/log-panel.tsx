"use client";

import { HeartHandshake, Check, X, MessageSquare } from "lucide-react";
import type { DeskView } from "@/lib/luna/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LunaMoon } from "@/components/luna/luna-moon";

export function LogPanel({
  desk,
  onOpenFriend,
  onRespond,
  busy,
}: {
  desk: DeskView;
  onOpenFriend: (friendId: string) => void;
  onRespond: (requestId: string, accept: boolean) => void;
  busy?: boolean;
}) {
  const empty = desk.friends.length === 0 && desk.inboundQsl.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6 overflow-y-auto">
      <div className="animate-fade-up">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
            <HeartHandshake className="h-4 w-4 text-zinc-100" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-100">
              People you&apos;ve connected with
            </h2>
            <p className="text-xs text-zinc-400">Strangers who passed you a note. Chat anytime.</p>
          </div>
        </div>
      </div>

      {desk.inboundQsl.length > 0 && (
        <div className="animate-fade-up stagger-1 flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 font-mono">
            Waiting for you ({desk.inboundQsl.length})
          </h3>
          <ul className="flex flex-col gap-2.5">
            {desk.inboundQsl.map((card) => (
              <li key={card.id}>
                <Card className="border-white/10 bg-zinc-900/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-800 text-xs font-mono font-bold text-zinc-100">
                          {card.fromCallsign.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold font-mono text-zinc-100">
                            {card.fromCallsign}
                          </p>
                          <p className="text-xs text-zinc-400">wants to stay connected</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        NOTE
                      </Badge>
                    </div>
                    <div className="mt-3.5 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => onRespond(card.id, true)}
                        className="gap-1.5 h-8 bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Accept</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onRespond(card.id, false)}
                        className="gap-1.5 h-8 text-zinc-400 hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Decline</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 font-mono">
          Friends ({desk.friends.length})
        </h3>
        {empty ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center bg-zinc-900/20">
            <LunaMoon className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm font-medium text-zinc-200">No connections yet</p>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              While chatting, tap &ldquo;Add contact&rdquo; on someone you&apos;d like to talk to
              again.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 rounded-xl border border-white/10 bg-zinc-950/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            {desk.friends.map((friend) => (
              <li key={friend.deviceId} className="flex items-center justify-between gap-4 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-200 font-mono font-semibold text-xs shadow-inner">
                    {friend.callsign.slice(0, 2)}
                  </div>
                  <div>
                    <span className="text-sm font-semibold font-mono text-zinc-100">
                      {friend.callsign}
                    </span>
                    <span className="block text-[11px] text-emerald-400">● available</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || Boolean(desk.activeSession)}
                  onClick={() => onOpenFriend(friend.deviceId)}
                  className="gap-1.5 h-8"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Chat</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
