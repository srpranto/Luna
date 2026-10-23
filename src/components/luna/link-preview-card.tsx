"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/luna/sound";

export interface LinkPreviewData {
  url: string;
  domain: string;
  title: string;
  description: string | null;
  image: string | null;
  favicon: string | null;
}

const previewCache = new Map<string, LinkPreviewData>();
const pendingFetches = new Map<string, Promise<LinkPreviewData | null>>();

async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  if (previewCache.has(url)) {
    return previewCache.get(url)!;
  }
  if (pendingFetches.has(url)) {
    return pendingFetches.get(url)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`/api/luna/link-preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.ok && json.data) {
        previewCache.set(url, json.data);
        return json.data as LinkPreviewData;
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(url);
    }
  })();

  pendingFetches.set(url, promise);
  return promise;
}

export function LinkPreviewCard({
  url,
  isMine = false,
}: {
  url: string;
  isMine?: boolean;
}) {
  const [data, setData] = useState<LinkPreviewData | null>(() => previewCache.get(url) || null);
  const [loading, setLoading] = useState(() => !previewCache.has(url));
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageError = failedUrl === url;

  useEffect(() => {
    if (previewCache.has(url)) {
      return;
    }

    let active = true;

    fetchLinkPreview(url).then((result) => {
      if (active) {
        setData(result);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [url]);

  if (loading && !data) {
    let domain = "";
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      domain = url;
    }
    return (
      <div
        className={cn(
          "mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-opacity animate-pulse",
          isMine
            ? "border-zinc-300/40 bg-zinc-200/50 text-zinc-700"
            : "border-white/10 bg-zinc-900/40 text-zinc-400",
        )}
      >
        <Globe className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="truncate font-mono text-[11px]">{domain}</span>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => triggerHaptic("selection")}
      className={cn(
        "group mt-2 block overflow-hidden rounded-xl border text-left transition-all duration-200 cursor-pointer touch-manipulation active:scale-[0.98]",
        isMine
          ? "border-zinc-300 bg-zinc-100 hover:bg-zinc-200/90 text-zinc-900 shadow-sm"
          : "border-white/10 bg-zinc-900/70 hover:border-white/20 hover:bg-zinc-850/90 text-zinc-100 shadow-md backdrop-blur-md",
      )}
    >
      {data.image && !imageError && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/40 border-b border-inherit/20">
          <img
            src={data.image}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedUrl(url)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}

      <div className="p-2.5 sm:p-3">
        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono tracking-wide opacity-75">
          {data.favicon ? (
            <img
              src={data.favicon}
              alt=""
              width={12}
              height={12}
              className="h-3 w-3 rounded-xs shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <Globe className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate uppercase font-medium">{data.domain}</span>
          <ExternalLink className="h-2.5 w-2.5 ml-auto opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>

        <div
          className={cn(
            "text-xs font-semibold line-clamp-1 leading-snug tracking-tight",
            isMine ? "text-zinc-900" : "text-zinc-100",
          )}
        >
          {data.title}
        </div>

        {data.description && (
          <div
            className={cn(
              "mt-1 text-[11px] line-clamp-2 leading-relaxed opacity-85",
              isMine ? "text-zinc-700" : "text-zinc-400",
            )}
          >
            {data.description}
          </div>
        )}
      </div>
    </a>
  );
}
