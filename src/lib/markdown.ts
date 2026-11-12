// =============================================================================
// Luna Markdown & URL Tokenizer (Pure Lexical Analysis)
// Zero React or DOM dependencies - independently testable across runtimes
// =============================================================================

export const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/i;

/**
 * Validates that a candidate URL strictly uses the safe http: or https: scheme.
 * Prevents javascript:, data:, vbscript:, or file: URI injection attacks.
 */
export function isSafeHttpUrl(candidate: string): boolean {
  if (!candidate || typeof candidate !== "string") return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extracts the first safe http(s) URL in a message body outside code blocks or inline code.
 */
export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, "");
  const match = withoutInlineCode.match(URL_REGEX);
  if (!match) return null;
  const url = match[0];
  return isSafeHttpUrl(url) ? url : null;
}

export interface ContentBlock {
  type: "code" | "text";
  language?: string;
  code?: string;
  text?: string;
}

/**
 * Pure lexical tokenizer separating markdown fenced code blocks from prose blocks.
 */
export function splitIntoBlocks(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      let textChunk = body.slice(lastIndex, match.index);
      if (textChunk.endsWith("\n")) {
        textChunk = textChunk.replace(/\r?\n$/, "");
      }
      if (textChunk.length > 0) {
        blocks.push({
          type: "text",
          text: textChunk,
        });
      }
    }
    blocks.push({
      type: "code",
      language: match[1]?.trim() || "",
      code: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    let textChunk = body.slice(lastIndex);
    if (textChunk.startsWith("\n") || textChunk.startsWith("\r\n")) {
      textChunk = textChunk.replace(/^\r?\n/, "");
    }
    if (textChunk.length > 0) {
      blocks.push({
        type: "text",
        text: textChunk,
      });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text: body }];
}
