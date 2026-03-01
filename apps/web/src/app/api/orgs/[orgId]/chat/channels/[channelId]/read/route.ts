import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { publish } from "@/lib/chat-pubsub";

/**
 * POST /api/orgs/[orgId]/chat/channels/[channelId]/read
 * Body: { lastReadMessageId: string }
 * Marks channel as read up to the given message.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, channelId } = await params;

    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const lastReadMessageId = typeof body.lastReadMessageId === "string" ? body.lastReadMessageId.trim() : null;

    let lastReadMessageCreatedAt: Date | null = null;
    if (lastReadMessageId) {
      const msg = await prisma.chatMessage.findFirst({
        where: { id: lastReadMessageId, channelId, orgId, deletedAt: null },
      });
      if (!msg) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      lastReadMessageCreatedAt = msg.createdAt;
    } else {
      lastReadMessageCreatedAt = new Date();
    }

    const now = new Date();
    await prisma.chatChannelReadState.upsert({
      where: {
        orgId_channelId_userId: { orgId, channelId, userId: user.id },
      },
      create: {
        orgId,
        channelId,
        userId: user.id,
        lastReadMessageId: lastReadMessageId ?? undefined,
        lastReadAt: now,
        lastReadMessageCreatedAt,
      },
      update: {
        lastReadMessageId: lastReadMessageId ?? undefined,
        lastReadAt: now,
        lastReadMessageCreatedAt,
      },
    });

    publish(orgId, channelId, { type: "unread.updated", payload: { userId: user.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
