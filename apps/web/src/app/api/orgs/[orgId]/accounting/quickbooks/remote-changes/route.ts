/**
 * GET/PATCH /api/orgs/[orgId]/accounting/quickbooks/remote-changes
 * List remote changes, acknowledge or resolve.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status"); // OPEN, ACKNOWLEDGED, RESOLVED
  const validStatuses = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
  const status = validStatuses.includes(statusParam as (typeof validStatuses)[number])
    ? (statusParam as (typeof validStatuses)[number])
    : undefined;

  const where = {
    orgId,
    provider: "QUICKBOOKS_ONLINE" as const,
    ...(status && { status }),
  };
  if (status) where.status = status;

  const changes = await prisma.accountingRemoteChange.findMany({
    where,
    orderBy: { detectedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ remoteChanges: changes });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const body = await req.json().catch(() => ({}));
  const { changeId, action } = body as { changeId?: string; action?: "acknowledge" | "resolve" };
  if (!changeId || !action) {
    return NextResponse.json({ error: "changeId and action required" }, { status: 400 });
  }

  const change = await prisma.accountingRemoteChange.findFirst({
    where: { id: changeId, orgId },
  });
  if (!change) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newStatus = action === "acknowledge" ? "ACKNOWLEDGED" : "RESOLVED";
  await prisma.accountingRemoteChange.update({
    where: { id: changeId },
    data: { status: newStatus },
  });
  return NextResponse.json({ ok: true, status: newStatus });
}
