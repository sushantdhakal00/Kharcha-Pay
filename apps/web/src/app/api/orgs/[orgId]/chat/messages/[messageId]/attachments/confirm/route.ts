import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { getChannelWithAuth } from "@/lib/chat-auth";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ALLOWED_MIME_TYPES,
} from "@/lib/chat-attachment-upload";
import { z } from "zod";

const confirmSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().refine((m) =>
    CHAT_ALLOWED_MIME_TYPES.includes(m as (typeof CHAT_ALLOWED_MIME_TYPES)[number])
  ),
  sizeBytes: z.number().int().min(1).max(CHAT_ATTACHMENT_MAX_BYTES),
});

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
    if (!auth.perms.canUpload) {
      return NextResponse.json({ error: "Forbidden: cannot upload" }, { status: 403 });
    }
    if (msg.senderUserId !== user.id) {
      return NextResponse.json(
        { error: "Can only add attachments to your own messages" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const attachment = await prisma.chatMessageAttachment.create({
      data: {
        orgId,
        messageId,
        storageKey: parsed.data.storageKey,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
      },
    });

    return NextResponse.json({
      attachment: {
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl: `/api/orgs/${orgId}/chat/attachments/${attachment.id}/download-url`,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
