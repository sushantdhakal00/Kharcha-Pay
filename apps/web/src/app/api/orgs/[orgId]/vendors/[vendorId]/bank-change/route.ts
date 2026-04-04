/**
 * POST /api/orgs/[orgId]/vendors/[vendorId]/bank-change
 * Create bank change request (Staff). Approve/Reject (Approver/Admin). Dual approval enforced by policy.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; vendorId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, vendorId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, orgId } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const action = body.action as "create" | "approve" | "reject" | "request_info" | undefined;

    if (action === "create") {
      if (membership.role !== OrgRole.ADMIN && membership.role !== OrgRole.STAFF) {
        return NextResponse.json({ error: "Only Admin or Staff can create bank change request" }, { status: 403 });
      }

      const request = await prisma.vendorBankChangeRequest.create({
        data: {
          vendorId,
          requestedByUserId: user.id,
          newPaymentMethodDraft: (body.draft ?? {}) as object,
          reason: body.reason ?? null,
          status: "SUBMITTED",
        },
      });

      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_BANK_CHANGE_REQUESTED",
        entityType: "VendorBankChangeRequest",
        entityId: request.id,
        after: { vendorId, status: "SUBMITTED" },
      });
      await emitOutboxEvent({
        orgId,
        type: "VENDOR_BANK_CHANGE_REQUESTED",
        payload: { vendorId, requestId: request.id },
      });

      return NextResponse.json({
        request: {
          id: request.id,
          status: request.status,
          requestedAt: request.requestedAt.toISOString(),
        },
      });
    }

    if (action === "approve" || action === "reject" || action === "request_info") {
      if (membership.role !== OrgRole.ADMIN && membership.role !== OrgRole.APPROVER) {
        return NextResponse.json({ error: "Only Admin or Approver can approve/reject bank changes" }, { status: 403 });
      }

      const requestId = body.requestId as string | undefined;
      if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

      const req = await prisma.vendorBankChangeRequest.findFirst({
        where: { id: requestId, vendorId, status: "SUBMITTED" },
      });
      if (!req) {
        const needInfo = await prisma.vendorBankChangeRequest.findFirst({
          where: { id: requestId, vendorId, status: "NEEDS_INFO" },
        });
        if (action === "request_info" && needInfo) {
          await prisma.vendorBankChangeRequest.update({
            where: { id: requestId },
            data: { status: "NEEDS_INFO" },
          });
          return NextResponse.json({ updated: true, status: "NEEDS_INFO" });
        }
        return NextResponse.json({ error: "Request not found or already processed" }, { status: 404 });
      }

      const policy = await prisma.orgVendorPolicy.findUnique({ where: { orgId } });
      const requireDual = policy?.requireDualApprovalForBankChanges ?? true;

      if (action === "reject") {
        await prisma.vendorBankChangeRequest.update({
          where: { id: requestId },
          data: {
            status: "REJECTED",
            approvedByUserId: user.id,
            approvedAt: new Date(),
          },
        });
        await logAuditEvent({
          orgId,
          actorUserId: user.id,
          action: "VENDOR_BANK_CHANGE_REJECTED",
          entityType: "VendorBankChangeRequest",
          entityId: requestId,
          after: { status: "REJECTED" },
        });
        return NextResponse.json({ updated: true, status: "REJECTED" });
      }

      if (action === "request_info") {
        await prisma.vendorBankChangeRequest.update({
          where: { id: requestId },
          data: { status: "NEEDS_INFO" },
        });
        return NextResponse.json({ updated: true, status: "NEEDS_INFO" });
      }

      if (action === "approve") {
        if (requireDual) {
          const firstApprover = req.approvedByUserId ?? null;
          if (!firstApprover) {
            await prisma.vendorBankChangeRequest.update({
              where: { id: requestId },
              data: {
                approvedByUserId: user.id,
                approvedAt: new Date(),
              },
            });
            await logAuditEvent({
              orgId,
              actorUserId: user.id,
              action: "VENDOR_BANK_CHANGE_APPROVED",
              entityType: "VendorBankChangeRequest",
              entityId: requestId,
              metadata: { step: "first_approval" },
            });
            return NextResponse.json({
              updated: true,
              status: "SUBMITTED",
              message: "First approval recorded; second approver required",
            });
          }
          if (firstApprover === user.id) {
            return NextResponse.json(
              { error: "Second approval must be from a different user" },
              { status: 400 }
            );
          }
        }

        const draft = req.newPaymentMethodDraft as Record<string, unknown> | null;
        const last4 = (draft?.last4 as string) ?? "****";
        await prisma.vendorPaymentMethod.updateMany({
          where: { vendorId },
          data: { status: "DISABLED" },
        });
        await prisma.vendorPaymentMethod.create({
          data: {
            vendorId,
            type: "BANK_TRANSFER",
            bankAccountMasked: `****${last4}`,
            bankName: (draft?.bankName as string) ?? null,
            country: (draft?.country as string) ?? null,
            currency: (draft?.currency as string) ?? null,
            status: "VERIFIED",
            createdByUserId: user.id,
          },
        });

        await prisma.vendorBankChangeRequest.update({
          where: { id: requestId },
          data: {
            status: "APPROVED",
            approvedByUserId: req.approvedByUserId ?? user.id,
            approvedAt: req.approvedAt ?? new Date(),
            secondApprovedByUserId: requireDual ? user.id : null,
            secondApprovedAt: requireDual ? new Date() : null,
          },
        });

        await logAuditEvent({
          orgId,
          actorUserId: user.id,
          action: "VENDOR_BANK_CHANGE_APPROVED",
          entityType: "VendorBankChangeRequest",
          entityId: requestId,
          after: { status: "APPROVED", vendorId },
        });
        await emitOutboxEvent({
          orgId,
          type: "VENDOR_BANK_CHANGE_APPROVED",
          payload: { vendorId, requestId },
        });

        return NextResponse.json({ updated: true, status: "APPROVED" });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
