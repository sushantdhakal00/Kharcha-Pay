import { NextRequest } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { formatSSEMessage, formatSSEPing } from "@/lib/fiat/treasury-events";

const POLL_INTERVAL_MS = 1500;
const PING_INTERVAL_MS = 15000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  let user;
  let orgId: string;
  try {
    user = await requireUser();
    orgId = (await params).orgId;
    await requireOrgReadAccess(orgId, user.id);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const sinceParam = req.nextUrl.searchParams.get("since");
  let cursor = sinceParam ? new Date(sinceParam) : new Date();

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      send(formatSSEPing());

      let lastPing = Date.now();

      const poll = async () => {
        if (closed) return;

        try {
          const events = await prisma.treasuryEvent.findMany({
            where: {
              orgId,
              createdAt: { gt: cursor },
            },
            orderBy: { createdAt: "asc" },
            take: 50,
          });

          for (const event of events) {
            send(
              formatSSEMessage({
                id: event.id,
                type: event.type,
                payload: event.payload,
                createdAt: event.createdAt,
              })
            );
            cursor = event.createdAt;
          }

          if (Date.now() - lastPing >= PING_INTERVAL_MS) {
            send(formatSSEPing());
            lastPing = Date.now();
          }
        } catch (e) {
          console.error("[treasury/stream] poll error:", e);
        }

        if (!closed) {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      setTimeout(poll, POLL_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
