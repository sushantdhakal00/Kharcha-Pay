/**
 * POST /api/orgs/[orgId]/accounting/quickbooks/jobs/[jobId]/retry
 * Re-run a failed job by creating a new PENDING job with same type. Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; jobId: string }> }
) {
  const user = await requireUser();
  await requireCsrf(req);
  const { orgId, jobId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const job = await prisma.accountingSyncJob.findFirst({
    where: { id: jobId, orgId },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const newJob = await prisma.accountingSyncJob.create({
    data: { orgId, provider: "QUICKBOOKS_ONLINE", type: job.type, status: "PENDING", meta: job.meta as object },
  });
  return NextResponse.json({ ok: true, jobId: newJob.id });
}
