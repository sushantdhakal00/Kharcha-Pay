/**
 * POST /api/orgs/[orgId]/vendors/[vendorId]/onboarding
 * Create or update onboarding case. Approver can activate vendor.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";

const DEFAULT_CHECKLIST = [
  { id: "details", label: "Collect vendor details", completedAt: null as string | null, completedBy: null as string | null },
  { id: "banking", label: "Collect banking details", completedAt: null as string | null, completedBy: null as string | null },
  { id: "docs", label: "Collect tax/compliance docs", completedAt: null as string | null, completedBy: null as string | null },
  { id: "verify_bank", label: "Verify banking (manual)", completedAt: null as string | null, completedBy: null as string | null },
  { id: "approve", label: "Approve vendor activation", completedAt: null as string | null, completedBy: null as string | null },
];

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

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, orgId },
      include: {
        documents: { where: { status: "VERIFIED" } },
        paymentMethods: { where: { status: "VERIFIED" } },
      },
    });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const action = body.action as "start" | "update_checklist" | "activate" | undefined;

    if (action === "start") {
      if (membership.role !== OrgRole.ADMIN && membership.role !== OrgRole.STAFF) {
        return NextResponse.json({ error: "Only Admin or Staff can start onboarding" }, { status: 403 });
      }
      const existing = await prisma.vendorOnboardingCase.findFirst({
        where: { vendorId, status: { in: ["OPEN", "IN_REVIEW", "WAITING_VENDOR"] } },
      });
      if (existing) {
        return NextResponse.json({
          case: {
            id: existing.id,
            status: existing.status,
            checklist: existing.checklist,
          },
        });
      }

      await prisma.vendor.update({
        where: { id: vendorId },
        data: { status: "ONBOARDING", riskLevel: body.riskLevel ?? "LOW" },
      });

      const c = await prisma.vendorOnboardingCase.create({
        data: {
          orgId,
          vendorId,
          createdByUserId: user.id,
          ownerUserId: body.ownerUserId ?? user.id,
          status: "OPEN",
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          riskLevelSnapshot: body.riskLevel ?? "LOW",
          checklist: DEFAULT_CHECKLIST as object,
        },
      });

      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_ONBOARDING_STARTED",
        entityType: "VendorOnboardingCase",
        entityId: c.id,
        after: { vendorId, status: c.status },
      });
      await emitOutboxEvent({
        orgId,
        type: "VENDOR_ONBOARDING_STARTED",
        payload: { vendorId, caseId: c.id },
      });

      return NextResponse.json({
        case: {
          id: c.id,
          status: c.status,
          checklist: c.checklist,
          dueAt: c.dueAt?.toISOString() ?? null,
        },
      });
    }

    if (action === "update_checklist" && body.checklist) {
      const existing = await prisma.vendorOnboardingCase.findFirst({
        where: { vendorId, orgId },
        orderBy: { createdAt: "desc" },
      });
      if (!existing) return NextResponse.json({ error: "No onboarding case" }, { status: 404 });

      await prisma.vendorOnboardingCase.update({
        where: { id: existing.id },
        data: { checklist: body.checklist as object },
      });

      return NextResponse.json({ updated: true });
    }

    if (action === "activate") {
      if (membership.role !== OrgRole.ADMIN && membership.role !== OrgRole.APPROVER) {
        return NextResponse.json({ error: "Only Admin or Approver can activate vendor" }, { status: 403 });
      }

      const policy = await prisma.orgVendorPolicy.findUnique({ where: { orgId } });
      const allowApprover = policy?.allowApproverToActivateVendor ?? true;
      if (membership.role === OrgRole.APPROVER && !allowApprover) {
        return NextResponse.json({ error: "Policy does not allow Approver to activate vendor" }, { status: 403 });
      }

      const requireDocs = policy?.requireVendorDocsBeforeActivation ?? true;
      if (requireDocs && vendor.documents.length === 0) {
        return NextResponse.json(
          { error: "Vendor must have at least one verified doc before activation (policy)" },
          { status: 400 }
        );
      }

      const existing = await prisma.vendorOnboardingCase.findFirst({
        where: { vendorId, orgId },
        orderBy: { createdAt: "desc" },
      });

      await prisma.vendor.update({
        where: { id: vendorId },
        data: { status: "ACTIVE" },
      });

      if (existing) {
        await prisma.vendorOnboardingCase.update({
          where: { id: existing.id },
          data: { status: "CLOSED", checklist: existing.checklist as object },
        });
      }

      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_ACTIVATED",
        entityType: "Vendor",
        entityId: vendorId,
        before: { status: vendor.status },
        after: { status: "ACTIVE" },
      });
      await emitOutboxEvent({
        orgId,
        type: "VENDOR_ACTIVATED",
        payload: { vendorId },
      });

      return NextResponse.json({ activated: true, status: "ACTIVE" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
