/**
 * POST /api/orgs/[orgId]/accounting/quickbooks/sync
 * Enqueue a sync job (reference import or export). Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueAccountingSyncJob } from "@/lib/accounting/enqueue-job";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  await requireCsrf(req);
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const body = await req.json().catch(() => ({}));
  const validTypes = ["IMPORT_REFERENCE", "EXPORT_BILLS", "EXPORT_PAYMENTS", "FULL_SYNC", "RECONCILE_BILLS", "QBO_CDC_SYNC"];
  const type = validTypes.includes(body.type) ? body.type : "IMPORT_REFERENCE";

  await prisma.accountingSyncJob.create({
    data: { orgId, provider: "QUICKBOOKS_ONLINE", type, status: "PENDING" },
  });
  return NextResponse.json({ ok: true, type });
}
