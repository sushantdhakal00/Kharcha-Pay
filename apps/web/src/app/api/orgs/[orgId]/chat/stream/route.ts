import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/require-user";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { subscribe, type ChatEvent } from "@/lib/chat-pubsub";

/**
 * GET /api/orgs/[orgId]/chat/stream?channelId=xxx
 * SSE stream for real-time chat updates. Uses Redis Pub/Sub when REDIS_URL set (multi-instance).
 * Headers: Last-Event-ID for reconnect (MVP: client refetches messages on reconnect).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    const channelId = req.nextUrl.searchParams.get("channelId");
    if (!channelId) {
      return new Response("channelId required", { status: 400 });
    }

    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return new Response("Forbidden", { status: 403 });
    }

    const lastEventId = req.headers.get("last-event-id") ?? undefined;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        function send(event: string, data: unknown, id?: string) {
          const evId = id ?? randomUUID();
          const lines = [`event: ${event}`, `id: ${evId}`, `data: ${JSON.stringify(data)}`];
          controller.enqueue(encoder.encode(lines.join("\n") + "\n\n"));
        }

        send("connected", { channelId, lastEventId: lastEventId || null });

        const unsub = subscribe(orgId, channelId, (event: ChatEvent) => {
          const payload = { ...(typeof event.payload === "object" ? event.payload : {}), _ts: Date.now() };
          switch (event.type) {
            case "message.created":
              send("message.created", payload);
              break;
            case "message.updated":
              send("message.updated", payload);
              break;
            case "message.deleted":
              send("message.deleted", payload);
              break;
            case "pinned.updated":
              send("pinned.updated", payload);
              break;
            case "unread.updated":
              send("unread.updated", payload);
              break;
          }
        });

        req.signal.addEventListener("abort", () => {
          unsub();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response("Stream failed", { status: 500 });
  }
}
