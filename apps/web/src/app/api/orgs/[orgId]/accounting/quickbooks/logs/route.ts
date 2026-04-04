/**
 * GET /api/orgs/[orgId]/accounting/quickbooks/logs
 * Fetch AccountingSyncLog entries. Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 200);

  const logs = await prisma.accountingSyncLog.findMany({
    where: { orgId, provider: "QUICKBOOKS_ONLINE", ...(jobId && { jobId }) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ logs });
}
