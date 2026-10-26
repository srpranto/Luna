import { NextRequest } from "next/server";
import { subscribeDevice, type LunaEvent } from "@/lib/events";
import { touchLastSeen, verifyStationAuth } from "@/lib/chat-server";
import { getSql } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");
  const secretParam = searchParams.get("secret");

  if (!deviceId) {
    return new Response(JSON.stringify({ error: "Missing deviceId." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!secretParam) {
    return new Response(JSON.stringify({ error: "Missing stream credentials." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isAuthed = await verifyStationAuth(deviceId, secretParam);
  if (!isAuthed) {
    return new Response(JSON.stringify({ error: "Unauthorized device." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const queryLastId = searchParams.get("lastEventId");
  const headerLastId = req.headers.get("last-event-id");
  let lastEventId = 0;
  const parsedCursor = Number(queryLastId || headerLastId);
  if (!Number.isNaN(parsedCursor) && parsedCursor > 0) {
    lastEventId = parsedCursor;
  }

  const encoder = new TextEncoder();
  const deliveredIds = new Set<number>();

  let pingInterval: NodeJS.Timeout | null = null;
  let pollInterval: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const cleanup = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
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

      const buffer: LunaEvent[] = [];
      let isCatchingUp = true;

      const sendEvent = (event: LunaEvent) => {
        const eventId = typeof event.id === "number" && event.id > 0 ? event.id : undefined;
        if (eventId) {
          if (deliveredIds.has(eventId)) return;
          deliveredIds.add(eventId);
          lastEventId = Math.max(lastEventId, eventId);
        }
        const idPrefix = eventId ? `id: ${eventId}\n` : "";
        controller.enqueue(
          encoder.encode(`${idPrefix}event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`),
        );
      };

      // 1. Subscribe immediately to local in-memory bus to eliminate race gaps
      unsubscribe = subscribeDevice(deviceId, (event: LunaEvent) => {
        try {
          if (isCatchingUp) {
            buffer.push(event);
          } else {
            sendEvent(event);
          }
        } catch (err) {
          console.error("[Luna Stream Local Dispatch Error]", {
            deviceId,
            type: event.type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      // 2. Catch up from database with pagination (no 100-event drop)
      if (parsedCursor > 0) {
        try {
          let cursor = parsedCursor;
          let hasMore = true;
          while (hasMore) {
            const sql = await getSql();
            const rows = await sql<{ id: number; type: string; data: string }>`
              select id, type, data from device_events
              where device_id = ${deviceId} and id > ${cursor}
              order by id asc
              limit 100
            `;
            if (rows.length === 0) {
              hasMore = false;
              break;
            }
            for (const row of rows) {
              const rowId = Number(row.id);
              cursor = Math.max(cursor, rowId);
              if (!deliveredIds.has(rowId)) {
                deliveredIds.add(rowId);
                lastEventId = Math.max(lastEventId, rowId);
                let parsedData: unknown = row.data;
                try {
                  parsedData = JSON.parse(row.data);
                } catch {}
                controller.enqueue(
                  encoder.encode(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(parsedData)}\n\n`),
                );
              }
            }
            if (rows.length < 100) {
              hasMore = false;
            }
          }
        } catch (err) {
          console.error("[Luna Stream DB Catchup Error]", {
            deviceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        try {
          const sql = await getSql();
          const rows = await sql<{ max_id: number | null }>`
            select max(id) as max_id from device_events where device_id = ${deviceId}
          `;
          if (rows[0]?.max_id) {
            lastEventId = Number(rows[0].max_id);
          }
        } catch (err) {
          console.error("[Luna Stream Max ID Error]", {
            deviceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 3. Drain in-memory buffer, de-duplicating against DB events
      isCatchingUp = false;
      for (const buffered of buffer) {
        sendEvent(buffered);
      }
      buffer.length = 0;

      // 4. Cross-instance realtime delivery via adaptive 800ms DB cursor poll
      let isPolling = false;
      pollInterval = setInterval(async () => {
        if (isPolling) return;
        isPolling = true;
        try {
          const sql = await getSql();
          const rows = await sql<{ id: number; type: string; data: string }>`
            select id, type, data from device_events
            where device_id = ${deviceId} and id > ${lastEventId}
            order by id asc
            limit 50
          `;
          for (const row of rows) {
            const rowId = Number(row.id);
            if (!deliveredIds.has(rowId)) {
              deliveredIds.add(rowId);
              lastEventId = Math.max(lastEventId, rowId);
              let parsedData: unknown = row.data;
              try {
                parsedData = JSON.parse(row.data);
              } catch {}
              controller.enqueue(
                encoder.encode(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(parsedData)}\n\n`),
              );
            }
          }

          if (deliveredIds.size > 1500) {
            const pruneFloor = lastEventId - 200;
            for (const id of deliveredIds) {
              if (id < pruneFloor) {
                deliveredIds.delete(id);
              }
            }
          }
        } catch (err) {
          console.error("[Luna Stream Cross-Instance Poll Error]", {
            deviceId,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          isPolling = false;
        }
      }, 800);

      // Initial last seen touch
      void touchLastSeen(deviceId).catch(() => {});

      let lastSeenCounter = 0;
      pingInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: "${new Date().toISOString()}"\n\n`),
          );
          lastSeenCounter += 1;
          // Touch last-seen every 15 seconds (every 3 pings) instead of every 5 seconds
          if (lastSeenCounter >= 3) {
            lastSeenCounter = 0;
            void touchLastSeen(deviceId).catch(() => {});
          }
        } catch {
          cleanup();
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
