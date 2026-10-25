import { NextRequest } from "next/server";
import { subscribeDevice, type LunaEvent } from "@/lib/luna/events";
import { touchLastSeen } from "@/lib/luna/server";
import { getSql } from "@/lib/luna/db";

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

  const queryLastId = searchParams.get("lastEventId");
  const headerLastId = req.headers.get("last-event-id");
  let lastEventId = 0;
  const parsedCursor = Number(queryLastId || headerLastId);
  if (!Number.isNaN(parsedCursor) && parsedCursor > 0) {
    lastEventId = parsedCursor;
  } else {
    try {
      const sql = await getSql();
      const rows = await sql<{ max_id: number | null }>`
        select max(id) as max_id from device_events where device_id = ${deviceId}
      `;
      if (rows[0]?.max_id) {
        lastEventId = Number(rows[0].max_id);
      }
    } catch {}
  }

  const encoder = new TextEncoder();

  let pingInterval: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const cleanup = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`),
      );

      if (parsedCursor > 0) {
        try {
          const sql = await getSql();
          const catchupRows = await sql<{ id: number; type: string; data: string }>`
            select id, type, data from device_events
            where device_id = ${deviceId} and id > ${parsedCursor}
            order by id asc
            limit 100
          `;
          for (const row of catchupRows) {
            lastEventId = Math.max(lastEventId, Number(row.id));
            controller.enqueue(
              encoder.encode(`id: ${row.id}\nevent: ${row.type}\ndata: ${row.data}\n\n`),
            );
          }
        } catch {}
      }

      unsubscribe = subscribeDevice(deviceId, (event: LunaEvent) => {
        try {
          if (typeof event.id === "number" && event.id > 0) {
            lastEventId = Math.max(lastEventId, event.id);
          }
          const idPrefix = typeof event.id === "number" && event.id > 0 ? `id: ${event.id}\n` : "";
          controller.enqueue(
            encoder.encode(`${idPrefix}event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`),
          );
        } catch {}
      });

      void touchLastSeen(deviceId).catch(() => {});

      pingInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: "${new Date().toISOString()}"\n\n`),
          );
          void touchLastSeen(deviceId).catch(() => {});
        } catch {
          if (pingInterval) clearInterval(pingInterval);
        }
      }, 5000);

      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
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
