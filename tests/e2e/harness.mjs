import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Global test registry
export const testRegistry = {
  currentSuite: null,
  suites: [],
  totalPass: 0,
  totalFail: 0,
  failures: [],
};

export function describe(name, fn) {
  const suite = {
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

export function it(name, fn) {
  if (!testRegistry.currentSuite) {
    throw new Error(`Test '${name}' must be inside a describe block`);
  }
  testRegistry.currentSuite.tests.push({
    name,
    fn,
    status: 'pending',
    duration: 0,
    error: null,
  });
}

export const test = it;

export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected) {
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
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
      }
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
      }
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string "${actual}" to contain "${expected}"`);
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
    toMatch(regex) {
      const re = typeof regex === 'string' ? new RegExp(regex) : regex;
      if (!re.test(String(actual))) {
        throw new Error(`Expected "${actual}" to match ${re.toString()}`);
      }
    },
    toThrow(expectedMessage) {
      if (typeof actual !== 'function') {
        throw new Error('toThrow requires a function');
      }
      let threw = false;
      let caughtError = null;
      try {
        actual();
      } catch (err) {
        threw = true;
        caughtError = err;
      }
      if (!threw) {
        throw new Error('Expected function to throw an error, but it did not throw');
      }
      if (expectedMessage && !caughtError.message.includes(expectedMessage)) {
        throw new Error(`Expected thrown message "${caughtError.message}" to include "${expectedMessage}"`);
      }
    },
  };
}

// Clean database state helper
export async function cleanDatabase() {
  try {
    const { getSql } = await import('@/lib/luna/db.ts');
    const sql = await getSql();
    await sql`delete from queue`;
    await sql`update sessions set closed_at = now() where closed_at is null`;
  } catch {}
}

// API and Domain Helpers
let postRouteHandler = null;
let streamRouteHandler = null;

export async function initApiHandlers() {
  if (!postRouteHandler) {
    const route = await import('@/app/api/luna/route.ts');
    postRouteHandler = route.POST;
  }
  if (!streamRouteHandler) {
    const streamRoute = await import('@/app/api/luna/stream/route.ts');
    streamRouteHandler = streamRoute.GET;
  }
}

export async function callApi(action, payload = {}, clientIp = null) {
  await initApiHandlers();
  const ip = clientIp || `10.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  const body = { action, ...payload };
  const req = new Request('http://localhost:3000/api/luna', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });

  const res = await postRouteHandler(req);
  const json = await res.json();
  return { status: res.status, ok: res.ok && json.ok, data: json.data, error: json.error, raw: json };
}

export async function createStation(customName = null) {
  const deviceId = crypto.randomUUID();
  const res = await callApi('registerStation', { deviceId });
  if (customName) {
    await callApi('updateCallsign', { deviceId, callsign: customName });
    const deskRes = await callApi('getDesk', { deviceId });
    return { deviceId, callsign: customName, desk: deskRes.data };
  }
  return { deviceId, callsign: res.data?.station?.callsign ?? 'Stranger', desk: res.data };
}

// Event SSE helper using events emitter
export async function listenDeviceEvents(deviceId, filterType = null, timeoutMs = 3000) {
  const { subscribeDevice } = await import('@/lib/luna/events.ts');
  const events = [];
  let unsub = null;

  const promise = new Promise((resolve) => {
    unsub = subscribeDevice(deviceId, (evt) => {
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
export function computeComposerHeight(scrollHeight) {
  return Math.min(200, Math.max(40, scrollHeight));
}

export function computeCounterWarning(charCount, maxChars = 280) {
  if (charCount <= 0) return { show: false, status: 'none', textClass: 'text-zinc-400' };
  if (charCount <= 250) return { show: true, status: 'normal', textClass: 'text-zinc-400' };
  if (charCount < maxChars) return { show: true, status: 'warning', textClass: 'text-amber-400' };
  return { show: true, status: 'danger', textClass: 'text-rose-400 font-bold' };
}

export function simulateComposerKeydown({
  key,
  shiftKey = false,
  isComposing = false,
  value = '',
  disabled = false,
  replyingTo = null,
}) {
  let submitted = false;
  let cancelledReply = false;
  let preventedDefault = false;

  if (key === 'Escape' && replyingTo) {
    preventedDefault = true;
    cancelledReply = true;
    return { submitted, cancelledReply, preventedDefault, reason: 'cancel_reply' };
  }

  if (key === 'Enter') {
    if (isComposing) {
      return { submitted: false, cancelledReply: false, preventedDefault: false, reason: 'ime_composing' };
    }
    if (!shiftKey) {
      preventedDefault = true;
      if (!disabled && value.trim().length > 0) {
        submitted = true;
        return { submitted, cancelledReply, preventedDefault, reason: 'submit' };
      }
      return { submitted: false, cancelledReply, preventedDefault, reason: 'empty_or_disabled' };
    }
    // Shift+Enter inserts newline
    return { submitted: false, cancelledReply, preventedDefault: false, reason: 'newline' };
  }

  return { submitted: false, cancelledReply: false, preventedDefault: false, reason: 'other_key' };
}

// Markdown parser & link preview extractor contract
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/i;

export function extractSanitizedFirstUrl(text) {
  if (!text) return null;
  // Strip fenced code blocks ```...```
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '');
  // Strip inline code `...`
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '');
  const match = withoutInlineCode.match(URL_REGEX);
  return match ? match[0] : null;
}

export function parseMarkdownTokens(text) {
  const tokens = [];
  // Detect fenced code blocks
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    tokens.push({
      type: 'code_block',
      language: match[1] || 'plaintext',
      code: match[2],
      hasCopyButton: true,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  // Parse inline elements within text tokens
  return tokens.flatMap((tok) => {
    if (tok.type !== 'text') return [tok];
    const subTokens = [];
    const inlineRegex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|> [^\n]+)/g;
    let idx = 0;
    let inMatch;
    while ((inMatch = inlineRegex.exec(tok.content)) !== null) {
      if (inMatch.index > idx) {
        subTokens.push({ type: 'plain', content: tok.content.slice(idx, inMatch.index) });
      }
      const val = inMatch[0];
      if (val.startsWith('**') && val.endsWith('**') && val.length >= 4) {
        subTokens.push({ type: 'bold', content: val.slice(2, -2) });
      } else if (val.startsWith('*') && val.endsWith('*') && val.length >= 3) {
        subTokens.push({ type: 'italic', content: val.slice(1, -1) });
      } else if (val.startsWith('`') && val.endsWith('`') && val.length >= 2) {
        subTokens.push({ type: 'inline_code', content: val.slice(1, -1) });
      } else if (val.startsWith('> ')) {
        subTokens.push({ type: 'blockquote', content: val.slice(2) });
      }
      idx = inMatch.index + val.length;
    }
    if (idx < tok.content.length) {
      subTokens.push({ type: 'plain', content: tok.content.slice(idx) });
    }
    return subTokens.length > 0 ? subTokens : [tok];
  });
}

export function readGlobalsCss() {
  const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
  return fs.readFileSync(cssPath, 'utf8');
}
