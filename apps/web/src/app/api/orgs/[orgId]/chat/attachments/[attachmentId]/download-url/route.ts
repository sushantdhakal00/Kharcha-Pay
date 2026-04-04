import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { getChannelWithAuth } from "@/lib/chat-auth";

export async function GET(
  req: NextRequest,
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const downloadUrl = `${baseUrl}/api/orgs/${orgId}/chat/attachments/${attachmentId}/download`;

    return NextResponse.json({ url: downloadUrl });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
