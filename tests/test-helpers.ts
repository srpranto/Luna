import fs from "node:fs";
import path from "node:path";

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
  status: "pending" | "passed" | "failed";
  duration: number;
  error: Error | null;
}

export interface Suite {
  name: string;
  tests: TestCase[];
  beforeEachFns: Array<() => void | Promise<void>>;
  afterEachFns: Array<() => void | Promise<void>>;
}

export interface TestRegistry {
  currentSuite: Suite | null;
  suites: Suite[];
  totalPass: number;
  totalFail: number;
  failures: string[];
}

// Global test registry
export const testRegistry: TestRegistry = {
  currentSuite: null,
  suites: [],
  totalPass: 0,
  totalFail: 0,
  failures: [],
};

export function describe(name: string, fn: () => void): void {
  const suite: Suite = {
    name,
    tests: [],
    beforeEachFns: [],
    afterEachFns: [],
  };
  testRegistry.suites.push(suite);
  const prevSuite = testRegistry.currentSuite;
  testRegistry.currentSuite = suite;
  try {
    fn();
  } finally {
    testRegistry.currentSuite = prevSuite;
  }
}

export function it(name: string, fn: () => void | Promise<void>): void {
  if (!testRegistry.currentSuite) {
    throw new Error(`Test '${name}' must be inside a describe block`);
  }
  testRegistry.currentSuite.tests.push({
    name,
    fn,
    status: "pending",
    duration: 0,
    error: null,
  });
}

export const test = it;

export interface ExpectResult<T = unknown> {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeDefined(): void;
  toBeNull(): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toContain(expected: unknown): void;
  toMatch(regex: RegExp | string): void;
  toThrow(expectedMessage?: string): void;
  actual?: T;
}

export function expect<T = unknown>(actual: T): ExpectResult<T> {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${a} to equal ${b}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined, got undefined`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be null`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!((actual as unknown as number) > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!((actual as unknown as number) >= expected)) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (!((actual as unknown as number) < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (!((actual as unknown as number) <= expected)) {
        throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
      }
    },
    toContain(expected: unknown) {
      if (typeof actual === "string") {
        if (!actual.includes(String(expected))) {
          throw new Error(`Expected string "${actual}" to contain "${String(expected)}"`);
        }
      } else if (Array.isArray(actual)) {
        const found = actual.some(
          (item) => item === expected || JSON.stringify(item) === JSON.stringify(expected),
        );
        if (!found) {
          throw new Error(`Expected array ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
        }
      } else {
        throw new Error(`toContain requires string or array, got ${typeof actual}`);
      }
    },
    toMatch(regex: RegExp | string) {
      const re = typeof regex === "string" ? new RegExp(regex) : regex;
      if (!re.test(String(actual))) {
        throw new Error(`Expected "${String(actual)}" to match ${re.toString()}`);
      }
    },
    toThrow(expectedMessage?: string) {
      if (typeof actual !== "function") {
        throw new Error("toThrow requires a function");
      }
      let threw = false;
      let caughtError: unknown = null;
      try {
        actual();
      } catch (err) {
        threw = true;
        caughtError = err;
      }
      if (!threw) {
        throw new Error("Expected function to throw an error, but it did not throw");
      }
      if (
        expectedMessage &&
        caughtError instanceof Error &&
        !caughtError.message.includes(expectedMessage)
      ) {
        throw new Error(
          `Expected thrown message "${caughtError.message}" to include "${expectedMessage}"`,
        );
      }
    },
  };
}

// Clean database state helper
export async function cleanDatabase(): Promise<void> {
  try {
    const { getSql } = await import("@/lib/database.ts");
    const sql = await getSql();
    await sql`delete from queue`;
    await sql`update sessions set closed_at = now() where closed_at is null`;
    await sql`delete from active_session_participants`;
  } catch {}
}

export interface ApiCallResult<T = any> {
  status: number;
  ok: boolean;
  data: T;
  error?: string;
  raw: unknown;
}

// API and Domain Helpers
let postRouteHandler: ((req: any) => Promise<Response>) | null = null;
let streamRouteHandler: ((req: any) => Promise<Response>) | null = null;

async function initApiHandlers(): Promise<void> {
  if (!postRouteHandler) {
    const route = await import("@/app/api/chat/route.ts");
    postRouteHandler = route.POST;
  }
  if (!streamRouteHandler) {
    const streamRoute = await import("@/app/api/chat/stream/route.ts");
    streamRouteHandler = streamRoute.GET;
  }
}

export async function callApi<T = any>(
  action: string,
  payload: Record<string, unknown> = {},
  clientIp: string | null = null,
): Promise<ApiCallResult<T>> {
  await initApiHandlers();
  const ip =
    clientIp ||
    `10.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  const body = { action, ...payload };
  const req = new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });

  const res = await postRouteHandler!(req);
  const json = (await res.json()) as { ok?: boolean; data?: T; error?: string };
  return {
    status: res.status,
    ok: Boolean(res.ok && json.ok),
    data: json.data as T,
    error: json.error,
    raw: json,
  };
}

export async function createStation(customName: string | null = null): Promise<{
  deviceId: string;
  callsign: string;
  desk: any;
}> {
  const deviceId = crypto.randomUUID();
  const res = await callApi("registerStation", { deviceId });
  if (customName) {
    await callApi("updateCallsign", { deviceId, callsign: customName });
    const deskRes = await callApi("getDesk", { deviceId });
    return { deviceId, callsign: customName, desk: deskRes.data };
  }
  return {
    deviceId,
    callsign: res.data?.station?.callsign ?? "Stranger",
    desk: res.data,
  };
}

// Event SSE helper using events emitter
export async function listenDeviceEvents(
  deviceId: string,
  filterType: string | null = null,
  timeoutMs = 3000,
): Promise<{
  waitForEvents: () => Promise<any[]>;
  getCollected: () => any[];
  close: () => void;
}> {
  const { subscribeDevice } = await import("@/lib/events.ts");
  const events: any[] = [];
  let unsub: (() => void) | null = null;

  const promise = new Promise<any[]>((resolve) => {
    unsub = subscribeDevice(deviceId, (evt: any) => {
      if (!filterType || evt.type === filterType) {
        events.push(evt);
        if (filterType) {
          resolve(events);
        }
      }
    });

    setTimeout(() => {
      resolve(events);
    }, timeoutMs);
  });

  return {
    waitForEvents: async () => {
      try {
        return await promise;
      } finally {
        if (unsub) unsub();
      }
    },
    getCollected: () => events,
    close: () => {
      if (unsub) unsub();
    },
  };
}

// UI Contract & Logic Pure Simulators
export function computeComposerHeight(scrollHeight: number): number {
  return Math.min(200, Math.max(40, scrollHeight));
}

export function computeCounterWarning(
  charCount: number,
  maxChars = 280,
): { show: boolean; status: "none" | "normal" | "warning" | "danger"; textClass: string } {
  if (charCount <= 0) return { show: false, status: "none", textClass: "text-zinc-400" };
  if (charCount <= 250) return { show: true, status: "normal", textClass: "text-zinc-400" };
  if (charCount < maxChars) return { show: true, status: "warning", textClass: "text-amber-400" };
  return { show: true, status: "danger", textClass: "text-rose-400 font-bold" };
}

export interface ComposerKeydownOptions {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  value?: string;
  disabled?: boolean;
  replyingTo?: unknown;
}

export function simulateComposerKeydown({
  key,
  shiftKey = false,
  isComposing = false,
  value = "",
  disabled = false,
  replyingTo = null,
}: ComposerKeydownOptions): {
  submitted: boolean;
  cancelledReply: boolean;
  preventedDefault: boolean;
  reason: string;
} {
  let submitted = false;
  let cancelledReply = false;
  let preventedDefault = false;

  if (key === "Escape" && replyingTo) {
    preventedDefault = true;
    cancelledReply = true;
    return { submitted, cancelledReply, preventedDefault, reason: "cancel_reply" };
  }

  if (key === "Enter") {
    if (isComposing) {
      return {
        submitted: false,
        cancelledReply: false,
        preventedDefault: false,
        reason: "ime_composing",
      };
    }
    if (!shiftKey) {
      preventedDefault = true;
      if (!disabled && value.trim().length > 0) {
        submitted = true;
        return { submitted, cancelledReply, preventedDefault, reason: "submit" };
      }
      return { submitted: false, cancelledReply, preventedDefault, reason: "empty_or_disabled" };
    }
    // Shift+Enter inserts newline
    return { submitted: false, cancelledReply, preventedDefault: false, reason: "newline" };
  }

  return { submitted: false, cancelledReply: false, preventedDefault: false, reason: "other_key" };
}

// Markdown parser & link preview extractor contract
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/i;

export function extractSanitizedFirstUrl(text: string): string | null {
  if (!text) return null;
  // Strip fenced code blocks ```...```
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, "");
  // Strip inline code `...`
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, "");
  const match = withoutInlineCode.match(URL_REGEX);
  return match ? match[0] : null;
}

export interface MarkdownToken {
  type: string;
  content?: string;
  language?: string;
  code?: string;
  hasCopyButton?: boolean;
}

export function parseMarkdownTokens(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  // Detect fenced code blocks
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    tokens.push({
      type: "code_block",
      language: match[1] || "plaintext",
      code: match[2],
      hasCopyButton: true,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: "text", content: text.slice(lastIndex) });
  }

  // Parse inline elements within text tokens
  return tokens.flatMap((tok) => {
    if (tok.type !== "text" || !tok.content) return [tok];
    const subTokens: MarkdownToken[] = [];
    const inlineRegex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|> [^\n]+)/g;
    let idx = 0;
    let inMatch: RegExpExecArray | null;
    while ((inMatch = inlineRegex.exec(tok.content)) !== null) {
      if (inMatch.index > idx) {
        subTokens.push({ type: "plain", content: tok.content.slice(idx, inMatch.index) });
      }
      const val = inMatch[0];
      if (val.startsWith("**") && val.endsWith("**") && val.length >= 4) {
        subTokens.push({ type: "bold", content: val.slice(2, -2) });
      } else if (val.startsWith("*") && val.endsWith("*") && val.length >= 3) {
        subTokens.push({ type: "italic", content: val.slice(1, -1) });
      } else if (val.startsWith("`") && val.endsWith("`") && val.length >= 2) {
        subTokens.push({ type: "inline_code", content: val.slice(1, -1) });
      } else if (val.startsWith("> ")) {
        subTokens.push({ type: "blockquote", content: val.slice(2) });
      }
      idx = inMatch.index + val.length;
    }
    if (idx < tok.content.length) {
      subTokens.push({ type: "plain", content: tok.content.slice(idx) });
    }
    return subTokens.length > 0 ? subTokens : [tok];
  });
}

export function readGlobalsCss(): string {
  const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
  return fs.readFileSync(cssPath, "utf8");
}
