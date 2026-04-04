import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id: invoiceId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const attachments = await prisma.invoiceAttachment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: "desc" },
    });

    return jsonResponse({
      attachments: attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
