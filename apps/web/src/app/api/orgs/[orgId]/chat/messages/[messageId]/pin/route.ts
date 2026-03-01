import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { publish } from "@/lib/chat-pubsub";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string; messageId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, messageId } = await params;

    const msg = await prisma.chatMessage.findFirst({
      where: { id: messageId, orgId },
    });
    if (!msg || msg.deletedAt) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const auth = await getChannelWithAuth(orgId, msg.channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!auth.perms.canPin) {
      return NextResponse.json({ error: "Forbidden: cannot pin" }, { status: 403 });
    }

    await prisma.chatPinnedMessage.upsert({
      where: { channelId_messageId: { channelId: msg.channelId, messageId } },
      create: {
        orgId,
        channelId: msg.channelId,
        messageId,
        pinnedByUserId: user.id,
      },
      update: { pinnedByUserId: user.id, pinnedAt: new Date() },
    });

    publish(orgId, msg.channelId, { type: "pinned.updated", payload: { messageId } });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "MESSAGE_PINNED",
      entityType: "ChatMessage",
      entityId: messageId,
      metadata: { channelId: msg.channelId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
