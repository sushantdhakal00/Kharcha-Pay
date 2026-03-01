import { NextResponse } from "next/server";
import { vendorPatchSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";

/**
 * PATCH /api/orgs/[orgId]/vendors/[vendorId]
 * ADMIN: full. APPROVER: status=BLOCKED. STAFF: basic info when vendor ONBOARDING.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string; vendorId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    await requireRecentAuth(REAUTH_MAX_AGE_SECONDS);
    const { orgId, vendorId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, orgId },
    });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const body = await request.json();
    const parsed = vendorPatchSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const msg = flat.fieldErrors?.contactEmail?.[0]
        ?? flat.fieldErrors?.ownerPubkey?.[0]
        ?? flat.fieldErrors?.name?.[0]
        ?? Object.values(flat.fieldErrors ?? {}).flat().find(Boolean)
        ?? "Validation failed";
      return NextResponse.json(
        { error: String(msg), details: flat },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const updatePayload: {
      name?: string;
      legalName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      notes?: string | null;
      status?: "DRAFT" | "ACTIVE" | "ARCHIVED" | "ONBOARDING" | "BLOCKED" | "INACTIVE";
      ownerPubkey?: string | null;
    } = {};

    if (membership.role === OrgRole.ADMIN) {
      if (data.name !== undefined) updatePayload.name = data.name.trim();
      if (data.legalName !== undefined) updatePayload.legalName = data.legalName;
      if (data.contactEmail !== undefined) updatePayload.contactEmail = data.contactEmail;
      if (data.contactPhone !== undefined) updatePayload.contactPhone = data.contactPhone;
      if (data.notes !== undefined) updatePayload.notes = data.notes;
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.ownerPubkey !== undefined) updatePayload.ownerPubkey = data.ownerPubkey;
    } else if (membership.role === OrgRole.APPROVER) {
      if ((data.status as string) === "BLOCKED") updatePayload.status = "BLOCKED";
      else return NextResponse.json({ error: "Approver can only set status to BLOCKED" }, { status: 403 });
    } else if (membership.role === OrgRole.STAFF && vendor.status === "ONBOARDING") {
      if (data.name !== undefined) updatePayload.name = data.name.trim();
      if (data.legalName !== undefined) updatePayload.legalName = data.legalName;
      if (data.contactEmail !== undefined) updatePayload.contactEmail = data.contactEmail;
      if (data.contactPhone !== undefined) updatePayload.contactPhone = data.contactPhone;
      if (data.notes !== undefined) updatePayload.notes = data.notes;
      if (data.status !== undefined || data.ownerPubkey !== undefined) {
        return NextResponse.json({ error: "Staff cannot change status or wallet" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: updatePayload,
    });

    const statusChanged = data.status !== undefined && data.status !== vendor.status;
    if (statusChanged) {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_STATUS_CHANGED",
        entityType: "Vendor",
        entityId: vendorId,
        before: { status: vendor.status },
        after: { status: updated.status },
      });
      if (updated.status === "BLOCKED") {
        await emitOutboxEvent({
          orgId,
          type: "VENDOR_BLOCKED",
          payload: { vendorId },
        });
      }
    }
    if (Object.keys(updatePayload).length > 0) {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_UPDATED",
        entityType: "Vendor",
        entityId: vendorId,
        before: {
          name: vendor.name,
          legalName: vendor.legalName ?? null,
          contactEmail: vendor.contactEmail ?? null,
          contactPhone: vendor.contactPhone ?? null,
          notes: vendor.notes ?? null,
          status: vendor.status,
          ownerPubkey: vendor.ownerPubkey ?? null,
        },
        after: {
          name: updated.name,
          legalName: updated.legalName ?? null,
          contactEmail: updated.contactEmail ?? null,
          contactPhone: updated.contactPhone ?? null,
          notes: updated.notes ?? null,
          status: updated.status,
          ownerPubkey: updated.ownerPubkey ?? null,
        },
      });
    }

    return NextResponse.json({
      vendor: {
        id: updated.id,
        name: updated.name,
        legalName: updated.legalName ?? null,
        contactEmail: updated.contactEmail ?? null,
        contactPhone: updated.contactPhone ?? null,
        notes: updated.notes ?? null,
        status: updated.status,
        ownerPubkey: updated.ownerPubkey ?? null,
        tokenAccount: updated.tokenAccount ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
