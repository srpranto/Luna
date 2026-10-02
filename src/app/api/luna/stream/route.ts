import { NextRequest } from "next/server";
import { subscribeDevice, type LunaEvent } from "@/lib/luna/events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");

  if (!deviceId) {
    return new Response(JSON.stringify({ error: "Missing deviceId." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`),
      );

      const unsubscribe = subscribeDevice(deviceId, (event: LunaEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`),
          );
        } catch {
          return;
        }
      });

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: "${new Date().toISOString()}"\n\n`),
          );
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          return;
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
