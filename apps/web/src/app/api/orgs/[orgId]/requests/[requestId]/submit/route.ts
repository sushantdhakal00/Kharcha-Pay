import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { RequestStatus } from "@prisma/client";
import { bigIntToString } from "@/lib/bigint";
import { getRequiredApprovalsFromTiers } from "@/lib/approval-policy";
import { logAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { OrgRole } from "@prisma/client";

function serializeRequest(req: {
  id: string;
  status: RequestStatus;
  requiredApprovals: number;
  submittedAt: Date | null;
  department?: { name: string };
  vendor?: { name: string };
  amountMinor: bigint;
  createdAt: Date;
}) {
  return {
    id: req.id,
    status: req.status,
    requiredApprovals: req.requiredApprovals,
    submittedAt: req.submittedAt?.toISOString() ?? null,
    departmentName: req.department?.name,
    vendorName: req.vendor?.name,
    amountMinor: bigIntToString(req.amountMinor),
    createdAt: req.createdAt.toISOString(),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; requestId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId, requestId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const existing = await prisma.expenseRequest.findFirst({
      where: { id: requestId, orgId },
      include: { department: { select: { name: true } }, vendor: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (existing.status !== RequestStatus.DRAFT) {
      return NextResponse.json({ error: "Only draft requests can be submitted" }, { status: 400 });
    }
    if (existing.requesterUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const policy = await prisma.approvalPolicy.findUnique({
      where: { orgId },
      include: { tiers: { orderBy: { minAmountMinor: "asc" } } },
    });
    const tiers = policy?.tiers ?? [];
    const requiredApprovals = getRequiredApprovalsFromTiers(
      existing.amountMinor,
      tiers.map((t) => ({ minAmountMinor: t.minAmountMinor, requiredApprovals: t.requiredApprovals }))
    );

    const now = new Date();
    const updated = await prisma.expenseRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.PENDING,
        submittedAt: now,
        requiredApprovals,
      },
      include: { department: { select: { name: true } }, vendor: { select: { name: true } } },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "REQUEST_SUBMITTED",
      entityType: "ExpenseRequest",
      entityId: requestId,
      before: {
        status: existing.status,
        amountMinor: existing.amountMinor.toString(),
        vendorId: existing.vendorId,
        departmentId: existing.departmentId,
      },
      after: {
        status: updated.status,
        amountMinor: updated.amountMinor.toString(),
        vendorId: updated.vendorId,
        departmentId: updated.departmentId,
        requiredApprovals: updated.requiredApprovals,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
      },
    });

    const approvers = await prisma.membership.findMany({
      where: {
        orgId,
        userId: { not: user.id },
        role: { in: [OrgRole.ADMIN, OrgRole.APPROVER] },
      },
      select: { userId: true },
    });
    const link = `/app/requests/${requestId}`;
    const title = "Request needs approval";
    const body = `Request "${existing.title}" (${existing.vendor?.name}) for ${existing.amountMinor.toString()} needs your approval.`;
    await Promise.all(
      approvers.map((m) =>
        createNotification({
          orgId,
          userId: m.userId,
          type: "REQUEST_NEEDS_APPROVAL",
          title,
          body,
          link,
        })
      )
    );

    return NextResponse.json({ request: serializeRequest(updated) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
