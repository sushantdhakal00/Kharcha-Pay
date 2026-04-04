import { NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { getChatAttachmentDir } from "@/lib/chat-attachment-storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; attachmentId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, attachmentId } = await params;

    const attachment = await prisma.chatMessageAttachment.findFirst({
      where: { id: attachmentId, orgId },
      include: { message: true },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const auth = await getChannelWithAuth(orgId, attachment.message.channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dir = getChatAttachmentDir(orgId);
    const filePath = path.join(dir, attachment.storageKey);
    if (
      !path.resolve(filePath).startsWith(path.resolve(dir)) ||
      !existsSync(filePath)
    ) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const safeName = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
