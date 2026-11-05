import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { runPeriodicCleanup } from "@/lib/chat-server";

export const dynamic = "force-dynamic";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const querySecret = req.nextUrl.searchParams.get("secret");
  const providedSecret = bearerSecret || querySecret;

  if (process.env.NODE_ENV === "production" && !cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured on server" }, { status: 401 });
  }

  if (cronSecret && (!providedSecret || !safeCompare(providedSecret, cronSecret))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runPeriodicCleanup(undefined, true);
    return NextResponse.json({ ok: true, cleanedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Cleanup failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
