import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { publish } from "@/lib/chat-pubsub";

const MAX_CONTENT_LENGTH = 4000;
const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string; messageId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, messageId } = await params;

    const msg = await prisma.chatMessage.findFirst({
      where: { id: messageId, orgId },
      include: { channel: true },
    });
    if (!msg || msg.deletedAt) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const auth = await getChannelWithAuth(orgId, msg.channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canEdit =
      auth.perms.canManageMessages ||
      (msg.senderUserId === user.id &&
        Date.now() - msg.createdAt.getTime() < EDIT_WINDOW_MS);

    if (!canEdit) {
      return NextResponse.json(
        { error: "Cannot edit: either not sender within 10 min or lack permission" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const contentText = String(body.contentText ?? "").trim();
    if (!contentText || contentText.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be 1–${MAX_CONTENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { contentText, editedAt: new Date() },
    });

    publish(orgId, msg.channelId, {
      type: "message.updated",
      payload: {
        id: updated.id,
        contentText: updated.contentText,
        editedAt: updated.editedAt?.toISOString() ?? null,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "MESSAGE_EDITED",
      entityType: "ChatMessage",
      entityId: messageId,
      before: { contentText: msg.contentText },
      after: { contentText: updated.contentText },
    });

    return NextResponse.json({
      message: {
        id: updated.id,
        contentText: updated.contentText,
        editedAt: updated.editedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; messageId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, messageId } = await params;

    const msg = await prisma.chatMessage.findFirst({
      where: { id: messageId, orgId },
    });
    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const auth = await getChannelWithAuth(orgId, msg.channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canDelete =
      auth.perms.canManageMessages ||
      (msg.senderUserId === user.id &&
        Date.now() - msg.createdAt.getTime() < EDIT_WINDOW_MS);

    if (!canDelete) {
      return NextResponse.json(
        { error: "Cannot delete: either not sender within 10 min or lack permission" },
        { status: 403 }
      );
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });

    publish(orgId, msg.channelId, {
      type: "message.deleted",
      payload: { id: messageId },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "MESSAGE_DELETED",
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
