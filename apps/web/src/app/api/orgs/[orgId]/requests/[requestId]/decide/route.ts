import { NextResponse } from "next/server";
import { requestDecideSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { RequestStatus } from "@prisma/client";
import { ApprovalDecision } from "@prisma/client";
import { bigIntToString } from "@/lib/bigint";
import { logAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; requestId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId, requestId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const body = await request.json();
    const parsed = requestDecideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { decision, note } = parsed.data;

    const existing = await prisma.expenseRequest.findFirst({
      where: { id: requestId, orgId },
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        approvalActions: { where: { decision: "APPROVE" } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (existing.status !== RequestStatus.PENDING) {
      return NextResponse.json({ error: "Only pending requests can be approved or rejected" }, { status: 400 });
    }

    if (existing.requesterUserId === user.id) {
      return NextResponse.json(
        { error: "Requester cannot approve their own request (separation of duties)" },
        { status: 403 }
      );
    }

    const alreadyActed = await prisma.approvalAction.findUnique({
      where: { requestId_actorUserId: { requestId, actorUserId: user.id } },
    });
    if (alreadyActed) {
      return NextResponse.json(
        { error: "You have already submitted a decision on this request" },
        { status: 400 }
      );
    }

    const now = new Date();

    if (decision === "REJECT") {
      await prisma.$transaction([
        prisma.approvalAction.create({
          data: {
            requestId,
            actorUserId: user.id,
            decision: ApprovalDecision.REJECT,
            note: note ?? null,
          },
        }),
        prisma.expenseRequest.update({
          where: { id: requestId },
          data: { status: RequestStatus.REJECTED, decidedAt: now },
        }),
      ]);
      await createNotification({
        orgId,
        userId: existing.requesterUserId,
        type: "REQUEST_REJECTED",
        title: "Request rejected",
        body: `Your request "${existing.title}" was rejected.`,
        link: `/app/requests/${requestId}`,
      });
    } else {
      await prisma.approvalAction.create({
        data: {
          requestId,
          actorUserId: user.id,
          decision: ApprovalDecision.APPROVE,
          note: note ?? null,
        },
      });

      const approveCount = await prisma.approvalAction.count({
        where: { requestId, decision: "APPROVE" },
      });
      const requiredApprovals = existing.requiredApprovals;
      const becameApproved = approveCount >= requiredApprovals;
      if (becameApproved) {
        await prisma.expenseRequest.update({
          where: { id: requestId },
          data: { status: RequestStatus.APPROVED, decidedAt: now },
        });
        await createNotification({
          orgId,
          userId: existing.requesterUserId,
          type: "REQUEST_APPROVED",
          title: "Request approved",
          body: `Your request "${existing.title}" was approved.`,
          link: `/app/requests/${requestId}`,
        });
      }

      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: becameApproved ? "REQUEST_APPROVED" : "REQUEST_APPROVED",
        entityType: "ExpenseRequest",
        entityId: requestId,
        before: {
          status: existing.status,
          amountMinor: existing.amountMinor.toString(),
          vendorId: existing.vendorId,
          departmentId: existing.departmentId,
          approvalsReceived: approveCount - 1,
          requiredApprovals,
        },
        after: {
          status: becameApproved ? RequestStatus.APPROVED : RequestStatus.PENDING,
          amountMinor: existing.amountMinor.toString(),
          vendorId: existing.vendorId,
          departmentId: existing.departmentId,
          approvalsReceived: approveCount,
          requiredApprovals,
          decidedAt: becameApproved ? now.toISOString() : null,
        },
        metadata: { note: note ?? undefined },
      });
    }

    const updated = await prisma.expenseRequest.findUnique({
      where: { id: requestId },
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        approvalActions: { include: { actor: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!updated) throw new Error("Unexpected");

    const approvalsReceived = updated.approvalActions.filter((a) => a.decision === "APPROVE").length;

    return NextResponse.json({
      request: {
        id: updated.id,
        status: updated.status,
        requiredApprovals: updated.requiredApprovals,
        approvalsReceived,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        departmentName: updated.department?.name,
        vendorName: updated.vendor?.name,
        amountMinor: bigIntToString(updated.amountMinor),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: "You have already submitted a decision on this request" },
        { status: 400 }
      );
    }
    throw e;
  }
}
