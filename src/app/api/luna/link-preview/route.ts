import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower === "0.0.0.0" ||
    lower === "::1"
  ) {
    return true;
  }

  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }

  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
    return true;
  }

  return false;
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

    if (isPrivateHost(parsedUrl.hostname)) {
      return NextResponse.json({ ok: false, error: "Restricted host" }, { status: 403 });
    }

    const domain = parsedUrl.hostname.replace(/^www\./, "");
    const defaultFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    let html = "";
    try {
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; LunaBot/1.0; +https://luna.chat)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      const contentType = response.headers.get("content-type") || "";
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
              "Cache-Control":
                "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
            },
          },
        );
      }

      const reader = response.body?.getReader();
      if (reader) {
        let total = 0;
        const decoder = new TextDecoder();
        while (total < 262144) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          total += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (html.includes("</head>")) break;
        }
        reader.cancel().catch(() => {});
      }
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
            "Cache-Control":
              "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
        },
      );
    } finally {
      clearTimeout(timer);
    }

    const ogTitleMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const ogDescMatch = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    ) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
    const metaDescMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    let rawImage = ogImageMatch ? ogImageMatch[1] : null;
    if (rawImage && rawImage.startsWith("/")) {
      try {
        rawImage = new URL(rawImage, parsedUrl.origin).toString();
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
          "Cache-Control":
            "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
