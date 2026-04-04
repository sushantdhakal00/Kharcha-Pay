import { NextResponse } from "next/server";
import { requestPatchSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { RequestStatus } from "@prisma/client";
import { bigIntToString } from "@/lib/bigint";
import { logAuditEvent } from "@/lib/audit";

function serializeRequest(req: {
  id: string;
  orgId: string;
  departmentId: string;
  vendorId: string;
  requesterUserId: string;
  title: string;
  purpose: string;
  category: string;
  amountMinor: bigint;
  currency: string;
  status: RequestStatus;
  requiredApprovals: number;
  submittedAt: Date | null;
  decidedAt: Date | null;
  paidAt?: Date | null;
  paidTxSig?: string | null;
  paidByUserId?: string | null;
  paidToTokenAccount?: string | null;
  createdAt: Date;
  updatedAt: Date;
  department?: { name: string };
  vendor?: { name: string };
  requester?: { username: string };
  approvalActions?: Array<{
    id: string;
    actorUserId: string;
    decision: string;
    note: string | null;
    createdAt: Date;
    actor?: { username: string };
  }>;
  receiptFiles?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }>;
}) {
  const approvalsReceived = req.approvalActions?.filter((a) => a.decision === "APPROVE").length ?? 0;
  return {
    id: req.id,
    orgId: req.orgId,
    departmentId: req.departmentId,
    vendorId: req.vendorId,
    requesterUserId: req.requesterUserId,
    title: req.title,
    purpose: req.purpose,
    category: req.category,
    amountMinor: bigIntToString(req.amountMinor),
    currency: req.currency,
    status: req.status,
    requiredApprovals: req.requiredApprovals,
    approvalsReceived,
    submittedAt: req.submittedAt?.toISOString() ?? null,
    decidedAt: req.decidedAt?.toISOString() ?? null,
    paidAt: req.paidAt?.toISOString() ?? null,
    paidTxSig: req.paidTxSig ?? null,
    paidByUserId: req.paidByUserId ?? null,
    paidToTokenAccount: req.paidToTokenAccount ?? null,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    departmentName: req.department?.name,
    vendorName: req.vendor?.name,
    requesterUsername: req.requester?.username,
    approvalActions:
      req.approvalActions?.map((a) => ({
        id: a.id,
        actorUserId: a.actorUserId,
        actorUsername: a.actor?.username,
        decision: a.decision,
        note: a.note,
        createdAt: a.createdAt.toISOString(),
      })) ?? [],
    receiptFiles:
      req.receiptFiles?.map((r) => ({
        id: r.id,
        downloadUrl: `/api/receipts/${r.id}`,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
      })) ?? [],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; requestId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, requestId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const req = await prisma.expenseRequest.findFirst({
      where: { id: requestId, orgId },
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        requester: { select: { username: true } },
        approvalActions: { include: { actor: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
        receiptFiles: true,
      },
    });
    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ request: serializeRequest(req) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PATCH(
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
    });
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (existing.status !== RequestStatus.DRAFT) {
      return NextResponse.json({ error: "Only draft requests can be edited" }, { status: 400 });
    }
    if (existing.requesterUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = requestPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    if (data.departmentId) {
      const dept = await prisma.department.findFirst({ where: { id: data.departmentId, orgId } });
      if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 400 });
    }
    if (data.vendorId) {
      const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, orgId } });
      if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (data.departmentId !== undefined) update.departmentId = data.departmentId;
    if (data.vendorId !== undefined) update.vendorId = data.vendorId;
    if (data.title !== undefined) update.title = data.title.trim();
    if (data.purpose !== undefined) update.purpose = data.purpose.trim();
    if (data.category !== undefined) update.category = data.category.trim();
    if (data.amountMinor !== undefined) update.amountMinor = BigInt(data.amountMinor);
    if (data.currency !== undefined) update.currency = data.currency;

    const updated = await prisma.expenseRequest.update({
      where: { id: requestId },
      data: update as never,
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        requester: { select: { username: true } },
        approvalActions: { include: { actor: { select: { username: true } } } },
        receiptFiles: true,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "REQUEST_UPDATED",
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
      },
    });

    return NextResponse.json({ request: serializeRequest(updated) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
