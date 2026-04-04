import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { publish } from "@/lib/chat-pubsub";

const MAX_CONTENT_LENGTH = 4000;
const MESSAGES_LIMIT = 50;
const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

function getAvatarUrl(orgId: string, userId: string): string {
  return `/api/orgs/${orgId}/users/${userId}/avatar`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, channelId } = await params;
    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Number(searchParams.get("limit")) || MESSAGES_LIMIT, 100);

    const where = {
      channelId,
      orgId,
      deletedAt: null,
    };

    const messages = await prisma.chatMessage.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { id: true, username: true, displayName: true, imageUrl: true } },
        attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
        replyTo: {
          select: {
            id: true,
            contentText: true,
            sender: { select: { displayName: true, username: true } },
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    return NextResponse.json({
      messages: page.reverse().map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderUserId: m.senderUserId,
        replyToMessageId: m.replyToMessageId,
        replyTo: m.replyTo
          ? {
              id: m.replyTo.id,
              contentText: m.replyTo.contentText.slice(0, 80) + (m.replyTo.contentText.length > 80 ? "…" : ""),
              senderDisplayName: m.replyTo.sender.displayName || m.replyTo.sender.username || "Unknown",
            }
          : null,
        sender: {
          displayName: m.sender.displayName || m.sender.username,
          avatarUrl: m.sender.imageUrl
            ? getAvatarUrl(orgId, m.sender.id)
            : null,
        },
        contentText: m.contentText,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        deletedAt: m.deletedAt?.toISOString() ?? null,
        attachments: m.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          downloadUrl: `/api/orgs/${orgId}/chat/attachments/${a.id}/download-url`,
        })),
      })),
      nextCursor,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

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

    if (auth.channel.isArchived || auth.channel.isLocked) {
      return NextResponse.json(
        { error: "Channel is archived or locked" },
        { status: 403 }
      );
    }
    if (!auth.perms.canSend) {
      return NextResponse.json({ error: "Forbidden: cannot send messages" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const contentText = String(body.contentText ?? "").trim();
    const replyToMessageId = typeof body.replyToMessageId === "string" ? body.replyToMessageId.trim() || null : null;
    if (!contentText || contentText.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be 1–${MAX_CONTENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    const attachmentsInput = Array.isArray(body.attachments)
      ? body.attachments.filter(
          (a: unknown) =>
            a &&
            typeof a === "object" &&
            "storageKey" in a &&
            "fileName" in a &&
            "mimeType" in a &&
            "sizeBytes" in a
        )
      : [];

    const mentionsUserIds: string[] = Array.isArray(body.mentionsUserIds)
      ? body.mentionsUserIds.filter((id: unknown) => typeof id === "string")
      : [];

    // Slow mode
    if (auth.channel.slowModeSeconds > 0) {
      const state = await prisma.chatUserChannelState.findUnique({
        where: { channelId_userId: { channelId, userId: user.id } },
      });
      if (state) {
        const elapsed = (Date.now() - state.lastMessageAt.getTime()) / 1000;
        if (elapsed < auth.channel.slowModeSeconds) {
          return NextResponse.json(
            {
              error: `Slow mode: wait ${Math.ceil(auth.channel.slowModeSeconds - elapsed)} seconds`,
            },
            { status: 429 }
          );
        }
      }
    }

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          orgId,
          channelId,
          senderUserId: user.id,
          contentText,
          replyToMessageId: replyToMessageId || undefined,
          mentionsUserIds: mentionsUserIds.length ? mentionsUserIds : undefined,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, imageUrl: true } },
          attachments: true,
        },
      });
      await tx.chatUserChannelState.upsert({
        where: { channelId_userId: { channelId, userId: user.id } },
        create: {
          orgId,
          channelId,
          userId: user.id,
          lastMessageAt: new Date(),
        },
        update: { lastMessageAt: new Date() },
      });
      // Mark sender read so their own messages don't count as unread
      await tx.chatChannelReadState.upsert({
        where: { orgId_channelId_userId: { orgId, channelId, userId: user.id } },
        create: {
          orgId,
          channelId,
          userId: user.id,
          lastReadMessageId: msg.id,
          lastReadAt: new Date(),
          lastReadMessageCreatedAt: msg.createdAt,
        },
        update: {
          lastReadMessageId: msg.id,
          lastReadAt: new Date(),
          lastReadMessageCreatedAt: msg.createdAt,
        },
      });
      for (const a of attachmentsInput) {
        await tx.chatMessageAttachment.create({
          data: {
            orgId,
            messageId: msg.id,
            storageKey: String(a.storageKey),
            fileName: String(a.fileName).slice(0, 255),
            mimeType: String(a.mimeType),
            sizeBytes: Number(a.sizeBytes) || 0,
          },
        });
      }
      return msg;
    });

    const msgWithAttachments = await prisma.chatMessage.findUnique({
      where: { id: message.id },
      include: {
        sender: { select: { id: true, username: true, displayName: true, imageUrl: true } },
        attachments: true,
        replyTo: {
          select: {
            id: true,
            contentText: true,
            sender: { select: { displayName: true, username: true } },
          },
        },
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "MESSAGE_SENT",
      entityType: "ChatMessage",
      entityId: message.id,
      metadata: { channelId, channelName: auth.channel.name },
    });

    publish(orgId, channelId, {
      type: "message.created",
      payload: {
        id: (msgWithAttachments ?? message).id,
        channelId,
        senderUserId: user.id,
        sender: {
          displayName: (msgWithAttachments ?? message).sender.displayName || (msgWithAttachments ?? message).sender.username,
          avatarUrl: (msgWithAttachments ?? message).sender.imageUrl ? getAvatarUrl(orgId, (msgWithAttachments ?? message).sender.id) : null,
        },
        contentText: (msgWithAttachments ?? message).contentText,
        createdAt: (msgWithAttachments ?? message).createdAt.toISOString(),
        editedAt: null,
        attachments: ((msgWithAttachments ?? message) as { attachments?: { id: string; fileName: string; mimeType: string; sizeBytes: number }[] }).attachments?.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          downloadUrl: `/api/orgs/${orgId}/chat/attachments/${a.id}/download-url`,
        })) ?? [],
      },
    });

    const m = msgWithAttachments ?? message;
    const mWithReply = m as typeof m & { replyTo?: { id: string; contentText: string; sender: { displayName: string | null; username: string | null } } | null };
    return NextResponse.json({
      message: {
        id: m.id,
        channelId: m.channelId,
        senderUserId: m.senderUserId,
        replyToMessageId: m.replyToMessageId,
        replyTo: mWithReply.replyTo
          ? {
              id: mWithReply.replyTo.id,
              contentText: mWithReply.replyTo.contentText.slice(0, 80) + (mWithReply.replyTo.contentText.length > 80 ? "…" : ""),
              senderDisplayName: mWithReply.replyTo.sender.displayName || mWithReply.replyTo.sender.username || "Unknown",
            }
          : null,
        sender: {
          displayName: m.sender.displayName || m.sender.username,
          avatarUrl: m.sender.imageUrl
            ? getAvatarUrl(orgId, m.sender.id)
            : null,
        },
        contentText: m.contentText,
        createdAt: m.createdAt.toISOString(),
        editedAt: null,
        attachments: (m as { attachments?: { id: string; fileName: string; mimeType: string; sizeBytes: number }[] }).attachments?.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          downloadUrl: `/api/orgs/${orgId}/chat/attachments/${a.id}/download-url`,
        })) ?? [],
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
