import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { checkPreviewRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

function isPrivateIp(ip: string): boolean {
  const norm = ip.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (norm.startsWith("::ffff:")) {
    return isPrivateIp(norm.slice(7));
  }

  if (norm.includes(":")) {
    if (
      norm === "::1" ||
      norm === "::" ||
      norm.startsWith("fc") ||
      norm.startsWith("fd") ||
      norm.startsWith("fe80")
    ) {
      return true;
    }
    return false;
  }

  const parts = norm.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const nums = parts.map(Number);
  if (nums.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = nums;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 & 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51) return true; // 198.51.100.0/24
  if (a === 203 && b === 0) return true; // 203.0.113.0/24
  if (a !== undefined && a >= 224) return true; // 224.0.0.0/4 multicast & reserved

  return false;
}

interface PinnedHostResult {
  safe: boolean;
  pinnedIp?: string;
  family?: number;
}

async function validateAndPinHost(hostname: string): Promise<PinnedHostResult> {
  const lower = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".lan") ||
    lower.endsWith(".home") ||
    lower.endsWith(".corp") ||
    lower.endsWith(".arpa") ||
    lower === "0.0.0.0" ||
    lower === "::1"
  ) {
    return { safe: false };
  }

  if (isPrivateIp(lower)) {
    return { safe: false };
  }

  try {
    const lookupResults = await dns.promises.lookup(hostname, { all: true });
    if (!lookupResults || lookupResults.length === 0) {
      return { safe: false };
    }
    for (const record of lookupResults) {
      if (isPrivateIp(record.address)) {
        return { safe: false };
      }
    }
    return {
      safe: true,
      pinnedIp: lookupResults[0].address,
      family: lookupResults[0].family,
    };
  } catch {
    return { safe: false };
  }
}

async function validateHostSecurity(hostname: string): Promise<boolean> {
  const res = await validateAndPinHost(hostname);
  return res.safe;
}

function safeFetch(
  targetUrl: URL,
  pinnedIp: string,
  family: number,
  signal: AbortSignal,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    const finish = (result: { status: number; headers: Record<string, string>; body: string }) => {
      if (isResolved) return;
      isResolved = true;
      resolve(result);
    };
    const fail = (err: unknown) => {
      if (isResolved) return;
      isResolved = true;
      reject(err);
    };

    const isHttps = targetUrl.protocol === "https:";
    const transport = isHttps ? https : http;
    const port = targetUrl.port || (isHttps ? 443 : 80);

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port,
        path: targetUrl.pathname + targetUrl.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LunaBot/1.0; +https://luna.chat)",
          Accept: "text/html,application/xhtml+xml",
          Host: targetUrl.host,
        },
        lookup: (_hostname, options, callback) => {
          const cb = typeof options === "function" ? options : callback;
          const opts = typeof options === "object" ? options : {};
          if (opts && opts.all) {
            cb(null, [{ address: pinnedIp, family }]);
          } else {
            cb(null, pinnedIp, family);
          }
        },
        signal,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (typeof val === "string") headers[key.toLowerCase()] = val;
          else if (Array.isArray(val)) headers[key.toLowerCase()] = val.join(", ");
        }

        let body = "";
        let totalBytes = 0;
        res.setEncoding("utf8");

        res.on("data", (chunk: string) => {
          totalBytes += Buffer.byteLength(chunk, "utf8");
          body += chunk;
          if (totalBytes >= 102400 || body.includes("</head>")) {
            res.destroy();
            finish({ status: res.statusCode ?? 200, headers, body });
          }
        });

        res.on("end", () => {
          finish({ status: res.statusCode ?? 200, headers, body });
        });

        res.on("error", (err) => {
          if (body.length > 0) {
            finish({ status: res.statusCode ?? 200, headers, body });
          } else {
            fail(err);
          }
        });
      },
    );

    req.on("error", fail);
    req.end();
  });
}

function extractClientIp(req: Request): string {
  // Only trust edge proxy headers when supplied by a verified deployment proxy
  if (process.env.VERCEL === "1") {
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    const vercelForwarded = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (vercelForwarded) return vercelForwarded;
  }
  const forwarded = req.headers.get("x-forwarded-for");
  return (
    req.headers.get("x-real-ip")?.trim() ||
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "127.0.0.1"
  );
}

function cleanMeta(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const decoded = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return decoded.length > 0 ? decoded.slice(0, 300) : null;
}

export async function GET(req: NextRequest) {
  try {
    const ip = extractClientIp(req);
    const rateCheck = checkPreviewRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
      );
    }

    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ ok: false, error: "Missing url parameter" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json({ ok: false, error: "Unsupported protocol" }, { status: 400 });
    }

    if (parsedUrl.port && ![80, 443, 8080, 8443].includes(Number(parsedUrl.port))) {
      return NextResponse.json({ ok: false, error: "Unsupported port" }, { status: 400 });
    }

    const domain = parsedUrl.hostname.replace(/^www\./, "");
    const defaultFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    let html = "";
    try {
      let currentUrl = parsedUrl;
      let finalResponse: { status: number; headers: Record<string, string>; body: string } | null = null;

      // Manual redirect follow with strict SSRF re-validation on every hop (max 3 hops)
      for (let hop = 0; hop <= 3; hop++) {
        const hostCheck = await validateAndPinHost(currentUrl.hostname);
        if (!hostCheck.safe || !hostCheck.pinnedIp) {
          return NextResponse.json({ ok: false, error: "Restricted host" }, { status: 403 });
        }

        const resp = await safeFetch(
          currentUrl,
          hostCheck.pinnedIp,
          hostCheck.family ?? 4,
          controller.signal,
        );

        if ([301, 302, 303, 307, 308].includes(resp.status)) {
          const location = resp.headers["location"];
          if (!location || hop === 3) break;
          currentUrl = new URL(location, currentUrl);
          if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
            return NextResponse.json({ ok: false, error: "Unsupported protocol" }, { status: 400 });
          }
          continue;
        }

        finalResponse = resp;
        break;
      }

      if (!finalResponse || finalResponse.status < 200 || finalResponse.status >= 400) {
        throw new Error("Fetch failed");
      }

      const contentType = finalResponse.headers["content-type"] || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        return NextResponse.json(
          {
            ok: true,
            data: {
              url: targetUrl,
              domain,
              title: domain,
              description: null,
              image: null,
              favicon: defaultFavicon,
            },
          },
          {
            headers: {
              "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
            },
          },
        );
      }

      html = finalResponse.body;
    } catch {
      return NextResponse.json(
        {
          ok: true,
          data: {
            url: targetUrl,
            domain,
            title: domain,
            description: null,
            image: null,
            favicon: defaultFavicon,
          },
        },
        {
          headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
        },
      );
    } finally {
      clearTimeout(timer);
    }

    const ogTitleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const ogDescMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
    const metaDescMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

    const ogImageMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    let rawImage = ogImageMatch ? ogImageMatch[1] : null;
    if (rawImage) {
      try {
        const resolvedUrl = new URL(rawImage, parsedUrl);
        if (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:") {
          rawImage = null;
        } else {
          const isSafe = await validateHostSecurity(resolvedUrl.hostname);
          rawImage = isSafe ? resolvedUrl.toString() : null;
        }
      } catch {
        rawImage = null;
      }
    }

    const title = cleanMeta(ogTitleMatch ? ogTitleMatch[1] : titleMatch ? titleMatch[1] : domain) || domain;
    const description = cleanMeta(ogDescMatch ? ogDescMatch[1] : metaDescMatch ? metaDescMatch[1] : null);

    return NextResponse.json(
      {
        ok: true,
        data: {
          url: targetUrl,
          domain,
          title,
          description,
          image: rawImage,
          favicon: defaultFavicon,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
