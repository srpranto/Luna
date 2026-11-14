"use client";

import { useState, useRef, useEffect, memo, Fragment, type ReactNode, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/sound-effects";

// =============================================================================
// Re-export Pure Lexical & URL Utilities from @/lib/markdown
// =============================================================================

export {
  URL_REGEX,
  isSafeHttpUrl,
  extractFirstUrl,
  type ContentBlock,
  splitIntoBlocks,
} from "@/lib/markdown";

import {
  isSafeHttpUrl,
  splitIntoBlocks,
} from "@/lib/markdown";

// =============================================================================
// React UI Components (Owns Browser DOM & Clipboard Interactions)
// =============================================================================

export function renderTextWithLinks(text: string, isMine: boolean): (string | ReactNode)[] {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  const parts: (string | ReactNode)[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const url = match[0];
    if (isSafeHttpUrl(url)) {
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic("selection");
          }}
          className={cn(
            "underline underline-offset-4 break-all font-medium transition-colors",
            isMine
              ? "text-zinc-950 underline-offset-4 decoration-zinc-950/40 hover:decoration-zinc-950 font-semibold"
              : "text-zinc-100 underline-offset-4 decoration-white/40 hover:decoration-white font-medium",
          )}
        >
          {url}
        </a>,
      );
    } else {
      parts.push(url);
    }
    lastIdx = match.index + url.length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length > 0 ? parts : [text];
}

export function CodeBlock({
  code,
  language,
  isMine,
}: {
  code: string;
  language?: string;
  isMine?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      triggerHaptic("light");
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={cn(
        "my-2 rounded-xl overflow-hidden border font-mono text-xs select-text shadow-sm text-left bg-[#090b12] text-zinc-100 max-w-full min-w-0",
        isMine ? "border-zinc-300/40" : "border-white/[0.08]",
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d101a] border-b border-white/[0.06] text-[10px] text-zinc-400">
        <span className="font-semibold uppercase tracking-wider font-mono text-zinc-400">{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-300 font-medium font-sans text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span className="font-sans text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] sm:text-xs leading-relaxed font-mono text-zinc-200">
        <code>{code.replace(/\r?\n$/, "")}</code>
      </pre>
    </div>
  );
}

export function renderFormattedBody(body: string, isMine: boolean) {
  const blocks = splitIntoBlocks(body);

  return blocks.map((block, blockIdx) => {
    if (block.type === "code") {
      return (
        <CodeBlock
          key={`code-${blockIdx}`}
          code={block.code ?? ""}
          language={block.language}
          isMine={isMine}
        />
      );
    }

    const lines = (block.text ?? "").split("\n");

    return lines.map((line, lineIdx) => {
      const isQuote = line.startsWith("> ");
      const content = isQuote ? line.slice(2) : line;

      const parts: (string | ReactNode)[] = [];
      const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          parts.push(...renderTextWithLinks(content.slice(lastIndex, match.index), isMine));
        }
        const token = match[0];
        if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
          parts.push(
            <strong key={`${blockIdx}-${lineIdx}-${match.index}`} className="font-semibold text-inherit">
              {token.slice(2, -2)}
            </strong>,
          );
        } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
          parts.push(
            <em key={`${blockIdx}-${lineIdx}-${match.index}`} className="italic text-inherit">
              {token.slice(1, -1)}
            </em>,
          );
        } else if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
          parts.push(
            <code
              key={`${blockIdx}-${lineIdx}-${match.index}`}
              className={cn(
                "px-1.5 py-0.5 rounded text-[11px] font-mono",
                isMine
                  ? "bg-zinc-200 text-zinc-900 border border-zinc-300"
                  : "bg-zinc-800 text-zinc-200 border border-white/10",
              )}
            >
              {token.slice(1, -1)}
            </code>,
          );
        } else {
          parts.push(...renderTextWithLinks(token, isMine));
        }
        lastIndex = match.index + token.length;
      }

      if (lastIndex < content.length) {
        parts.push(...renderTextWithLinks(content.slice(lastIndex), isMine));
      }

      if (isQuote) {
        const colonIdx = content.indexOf(": ");
        if (colonIdx > 0 && colonIdx < 32) {
          const quoteAuthor = content.slice(0, colonIdx);
          const quoteSnippet = content.slice(colonIdx + 2);
          return (
            <div
              key={`${blockIdx}-${lineIdx}`}
              className={cn(
                "rounded-lg border-l-2 px-2.5 py-1.5 mb-2 text-xs select-none transition-colors",
                isMine
                  ? "border-l-[#6382ff] border-y border-r border-zinc-300/80 bg-zinc-200/80 text-zinc-800"
                  : "border-l-[#6382ff] border-y border-r border-white/[0.08] bg-[#0c0f18]/80 text-zinc-300",
              )}
            >
              <div
                className={cn(
                  "text-[10px] font-semibold tracking-wide uppercase font-mono flex items-center gap-1",
                  isMine ? "text-indigo-900" : "text-[#8aa2ff]",
                )}
              >
                <span>{quoteAuthor}</span>
              </div>
              <div className="line-clamp-2 italic text-[11px] opacity-90 mt-0.5">{quoteSnippet}</div>
            </div>
          );
        }

        return (
          <blockquote
            key={`${blockIdx}-${lineIdx}`}
            className={cn(
              "border-l-2 pl-2.5 my-1.5 italic text-xs",
              isMine ? "border-indigo-400/80 text-zinc-700" : "border-[#6382ff]/80 text-zinc-300",
            )}
          >
            {parts}
          </blockquote>
        );
      }

      if (lines.length === 1 && blocks.length === 1) {
        return <Fragment key={`${blockIdx}-${lineIdx}`}>{parts.length > 0 ? parts : " "}</Fragment>;
      }

      return (
        <span key={`${blockIdx}-${lineIdx}`} className="block min-h-[1.2em]">
          {parts.length > 0 ? parts : " "}
        </span>
      );
    });
  });
}

export const MessageBody = memo(function MessageBody({
  body,
  isMine,
}: {
  body: string;
  isMine: boolean;
}) {
  return (
    <div className="w-full text-left font-sans select-text leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]">
      {renderFormattedBody(body, isMine)}
    </div>
  );
});
MessageBody.displayName = "MessageBody";
