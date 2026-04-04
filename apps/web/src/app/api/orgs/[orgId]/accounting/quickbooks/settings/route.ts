/**
 * PATCH /api/orgs/[orgId]/accounting/quickbooks/settings
 * Update includeAttachmentLinksInExport.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const body = await req.json().catch(() => ({}));
  const { includeAttachmentLinksInExport } = body as { includeAttachmentLinksInExport?: boolean };
  if (typeof includeAttachmentLinksInExport !== "boolean") {
    return NextResponse.json({ error: "includeAttachmentLinksInExport must be boolean" }, { status: 400 });
  }

  const conn = await prisma.accountingConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
  });
  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 400 });

  await prisma.accountingConnection.update({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
    data: { includeAttachmentLinksInExport },
  });
  return NextResponse.json({ ok: true, includeAttachmentLinksInExport });
}
