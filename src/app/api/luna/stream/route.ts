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
  const deliveredLocalEvents = new Set<string>();

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

      const unsubscribe = subscribeDevice(deviceId, (event: LunaEvent) => {
        try {
          const eventKey = `${event.type}:${JSON.stringify(event.data)}`;
          deliveredLocalEvents.add(eventKey);
          if (deliveredLocalEvents.size > 200) {
            const first = deliveredLocalEvents.values().next().value;
            if (first) deliveredLocalEvents.delete(first);
          }
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`),
          );
        } catch {}
      });

      void touchLastSeen(deviceId).catch(() => {});

      const pollInterval = setInterval(async () => {
        try {
          const sql = await getSql();
          const rows = await sql<{ id: number; type: string; data: string }>`
            select id, type, data from device_events
            where device_id = ${deviceId}
              and id > ${lastEventId}
            order by id asc
            limit 50
          `;
          for (const row of rows) {
            lastEventId = Math.max(lastEventId, Number(row.id));
            const eventKey = `${row.type}:${row.data}`;
            if (deliveredLocalEvents.has(eventKey)) {
              continue;
            }
            try {
              controller.enqueue(
                encoder.encode(`id: ${row.id}\nevent: ${row.type}\ndata: ${row.data}\n\n`),
              );
            } catch {
              clearInterval(pollInterval);
              return;
            }
          }

          if (Math.random() < 0.02) {
            void sql`delete from device_events where created_at < now() - interval '5 minutes'`.catch(() => {});
          }
        } catch {}
      }, 1000);

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: "${new Date().toISOString()}"\n\n`),
          );
          void touchLastSeen(deviceId).catch(() => {});
        } catch {
          clearInterval(pingInterval);
        }
      }, 5000);

      req.signal.addEventListener("abort", () => {
        clearInterval(pollInterval);
        clearInterval(pingInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {}
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
