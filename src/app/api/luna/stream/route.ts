import { NextRequest } from "next/server";
import { subscribeDevice, type LunaEvent, SERVER_INSTANCE_ID } from "@/lib/luna/events";
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

  const encoder = new TextEncoder();
  let lastEventId = 0;

  try {
    const sql = await getSql();
    const rows = await sql<{ max_id: number | null }>`
      select max(id) as max_id from device_events where device_id = ${deviceId}
    `;
    if (rows[0]?.max_id) {
      lastEventId = Number(rows[0].max_id);
    }
  } catch {}

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

      void touchLastSeen(deviceId).catch(() => {});

      // Cross-instance polling loop: polls for events dispatched by other server instances
      const pollInterval = setInterval(async () => {
        try {
          const sql = await getSql();
          const rows = await sql<{ id: number; type: string; data: string }>`
            select id, type, data from device_events
            where device_id = ${deviceId}
              and id > ${lastEventId}
              and (instance_id is null or instance_id <> ${SERVER_INSTANCE_ID})
            order by id asc
            limit 25
          `;
          for (const row of rows) {
            lastEventId = Math.max(lastEventId, Number(row.id));
            try {
              controller.enqueue(
                encoder.encode(`event: ${row.type}\ndata: ${row.data}\n\n`),
              );
            } catch {
              clearInterval(pollInterval);
              return;
            }
          }

          // Opportunistic cleanup of stale events (> 2 min)
          if (Math.random() < 0.05) {
            void sql`delete from device_events where created_at < now() - interval '2 minutes'`.catch(() => {});
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
