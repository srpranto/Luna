import { describe, it, expect } from "./test-helpers.ts";
import { isSafeHttpUrl, extractFirstUrl, splitIntoBlocks } from "../src/lib/markdown.ts";
import { formatUserFacingError, ApiClientError } from "../src/lib/errors.ts";

export function registerCodeQualityTests(): void {
  describe("Tier 5: Code Quality & Architectural Hardening Regression Suite", () => {
    // =========================================================================
    // 1. Safe HTTP/HTTPS URL Scheme Verification (Anti-XSS / Anti-Injection)
    // =========================================================================
    it("TC-5.1.1: isSafeHttpUrl accepts standard http and https URLs", () => {
      expect(isSafeHttpUrl("https://example.com")).toBe(true);
      expect(isSafeHttpUrl("http://localhost:3000")).toBe(true);
      expect(isSafeHttpUrl("https://sanctuary.luna.app/room?id=42#intro")).toBe(true);
    });

    it("TC-5.1.2: isSafeHttpUrl strictly rejects javascript:, data:, file:, and vbscript: URIs", () => {
      expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    });

    it("TC-5.1.3: isSafeHttpUrl rejects relative paths, schemeless strings, and empty input", () => {
      expect(isSafeHttpUrl("/api/chat")).toBe(false);
      expect(isSafeHttpUrl("//example.com")).toBe(false);
      expect(isSafeHttpUrl("")).toBe(false);
      // @ts-expect-error test invalid runtime input
      expect(isSafeHttpUrl(null)).toBe(false);
      // @ts-expect-error test invalid runtime input
      expect(isSafeHttpUrl(undefined)).toBe(false);
    });

    // =========================================================================
    // 2. Pure Markdown First-URL Extraction (Fenced Code & Inline Code Immunity)
    // =========================================================================
    it("TC-5.2.1: extractFirstUrl finds raw URLs in prose", () => {
      const text = "Check out this calm space at https://luna.chat for quiet thinking.";
      expect(extractFirstUrl(text)).toBe("https://luna.chat");
    });

    it("TC-5.2.2: extractFirstUrl ignores URLs enclosed in fenced code blocks", () => {
      const text = "Here is the backend API URL:\n```typescript\nconst endpoint = 'https://internal-api.secret.internal';\n```\nVisit our docs at https://docs.luna.chat instead.";
      expect(extractFirstUrl(text)).toBe("https://docs.luna.chat");
    });

    it("TC-5.2.3: extractFirstUrl ignores URLs enclosed in inline backticks", () => {
      const text = "Do not ping `https://api.internal/health`, use https://public.luna.chat instead.";
      expect(extractFirstUrl(text)).toBe("https://public.luna.chat");
    });

    it("TC-5.2.4: extractFirstUrl returns null if all URLs are contained in code blocks", () => {
      const text = "```bash\ncurl https://api.secret.example.com\n```";
      expect(extractFirstUrl(text)).toBeNull();
    });

    it("TC-5.2.5: extractFirstUrl returns null if candidate URL has an unsafe scheme", () => {
      const text = "Check out javascript:evil() for details.";
      expect(extractFirstUrl(text)).toBeNull();
    });

    // =========================================================================
    // 3. Pure Markdown Tokenizer (Fenced Code Block & Text Slicing)
    // =========================================================================
    it("TC-5.3.1: splitIntoBlocks preserves plain text without code fences", () => {
      const blocks = splitIntoBlocks("Hello stranger, the night is quiet tonight.");
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe("text");
      expect(blocks[0].text).toBe("Hello stranger, the night is quiet tonight.");
    });

    it("TC-5.3.2: splitIntoBlocks extracts fenced code block with language identifier", () => {
      const input = "Here is Python:\n```python\nprint('hello luna')\n```\nPeaceful coding.";
      const blocks = splitIntoBlocks(input);
      expect(blocks.length).toBe(3);
      expect(blocks[0].type).toBe("text");
      expect(blocks[0].text).toBe("Here is Python:");
      expect(blocks[1].type).toBe("code");
      expect(blocks[1].language).toBe("python");
      expect(blocks[1].code).toBe("print('hello luna')\n");
      expect(blocks[2].type).toBe("text");
      expect(blocks[2].text).toBe("Peaceful coding.");
    });

    it("TC-5.3.3: splitIntoBlocks handles consecutive code blocks seamlessly", () => {
      const input = "```ts\nconst a = 1;\n```\n```rust\nlet a = 1;\n```";
      const blocks = splitIntoBlocks(input);
      expect(blocks.length).toBe(2);
      expect(blocks[0].type).toBe("code");
      expect(blocks[0].language).toBe("ts");
      expect(blocks[1].type).toBe("code");
      expect(blocks[1].language).toBe("rust");
    });

    // =========================================================================
    // 4. User-Facing Error Formatter & Contextual Normalization
    // =========================================================================
    it("TC-5.4.1: formatUserFacingError correctly formats SESSION_NOT_FOUND in session context", () => {
      const err = new ApiClientError("Session missing", 404, "SESSION_NOT_FOUND");
      const msg = formatUserFacingError(err, "session");
      expect(msg).toBe("This conversation has ended or is no longer available.");
    });

    it("TC-5.4.2: formatUserFacingError suppresses 404 during background_poll (returns null)", () => {
      const err = new ApiClientError("Desk not found", 404, "NOT_FOUND");
      const msg = formatUserFacingError(err, "background_poll");
      expect(msg).toBeNull();
    });

    it("TC-5.4.3: formatUserFacingError keeps 404 observable in general context (does not swallow)", () => {
      const err = new ApiClientError("Resource not found", 404, "NOT_FOUND");
      const msg = formatUserFacingError(err, "general");
      expect(msg).toBe("The requested sanctuary resource was not found.");
    });

    it("TC-5.4.4: formatUserFacingError formats 429 rate limit exceeded gracefully", () => {
      const err = new ApiClientError("Too fast", 429, "RATE_LIMIT_EXCEEDED");
      const msg = formatUserFacingError(err, "general");
      expect(msg).toBe("You are sending thoughts too quickly. Please pause a moment.");
    });

    it("TC-5.4.5: formatUserFacingError formats 401 unauthorized / credential expiration", () => {
      const err = new ApiClientError("Unauthorized", 401, "UNAUTHORIZED");
      const msg = formatUserFacingError(err, "auth");
      expect(msg).toBe("Session credentials out of sync. Reconnecting...");
    });

    it("TC-5.4.6: formatUserFacingError suppresses abort / cancellation errors without noise", () => {
      const abortErr = new Error("The operation was aborted");
      abortErr.name = "AbortError";
      expect(formatUserFacingError(abortErr, "general")).toBeNull();

      const domAbort = new DOMException("The user aborted a request.", "AbortError");
      expect(formatUserFacingError(domAbort, "general")).toBeNull();
    });

    it("TC-5.4.7: formatUserFacingError sanitizes 500 internal server errors without leaking SQL or stack traces", () => {
      const raw500 = new ApiClientError("SELECT * FROM stations WHERE id = 123 FAILED: SyntaxError", 500, "INTERNAL_ERROR");
      const msg = formatUserFacingError(raw500, "general");
      expect(msg).toBe("Sanctuary server encountered a quiet hitch. Please try again.");
      expect(msg?.includes("SELECT")).toBe(false);
      expect(msg?.includes("SyntaxError")).toBe(false);
    });

    it("TC-5.4.8: formatUserFacingError handles null, undefined, or empty string gracefully", () => {
      expect(formatUserFacingError(null)).toBeNull();
      expect(formatUserFacingError(undefined)).toBeNull();
      expect(formatUserFacingError("")).toBeNull();
    });
  });
}
