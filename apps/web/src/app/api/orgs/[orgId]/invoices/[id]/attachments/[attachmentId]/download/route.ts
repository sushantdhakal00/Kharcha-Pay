import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { prisma } from "@/lib/db";
import { jwtVerify } from "jose";
import { readFile } from "fs/promises";
import path from "path";
import { env } from "@/lib/env";
import { getInvoiceAttachmentDir } from "@/lib/invoice-attachment-storage";

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string; attachmentId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id: invoiceId, attachmentId } = await params;

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    let payload: { attachmentId: string; userId: string };
    try {
      const { payload: p } = await jwtVerify(token, JWT_SECRET);
      payload = p as { attachmentId: string; userId: string };
    } catch {
      return NextResponse.json({ error: "Invalid or expired download link" }, { status: 400 });
    }

    if (payload.attachmentId !== attachmentId || payload.userId !== user.id) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const attachment = await prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId, invoice: { orgId } },
    });
    if (!attachment || !attachment.storageKey) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const dir = getInvoiceAttachmentDir(orgId);
    const filePath = path.join(dir, attachment.storageKey);
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, '\\"')}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
