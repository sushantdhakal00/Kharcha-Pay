import { NextResponse } from "next/server";
import { requestCreateSchema } from "@kharchapay/shared";
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
  createdAt: Date;
  department?: { name: string };
  vendor?: { name: string };
  requester?: { username: string };
  approvalActions?: Array<{ decision: string }>;
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
    createdAt: req.createdAt.toISOString(),
    departmentName: req.department?.name,
    vendorName: req.vendor?.name,
    requesterUsername: req.requester?.username,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const mine = searchParams.get("mine") === "1";
    const status = searchParams.get("status") as RequestStatus | null;
    const departmentId = searchParams.get("department") ?? searchParams.get("departmentId");

    const where: { orgId: string; requesterUserId?: string; status?: RequestStatus; departmentId?: string } = { orgId };
    if (mine) where.requesterUserId = user.id;
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    const requests = await prisma.expenseRequest.findMany({
      where,
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        requester: { select: { username: true } },
        approvalActions: { select: { decision: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      requests: requests.map(serializeRequest),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const body = await request.json();
    const parsed = requestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const [department, vendor] = await Promise.all([
      prisma.department.findFirst({ where: { id: data.departmentId, orgId } }),
      prisma.vendor.findFirst({ where: { id: data.vendorId, orgId } }),
    ]);
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 400 });
    }
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
    }
    if (vendor.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only active vendors can be used for new requests", code: "VENDOR_INACTIVE" },
        { status: 400 }
      );
    }

    const req = await prisma.expenseRequest.create({
      data: {
        orgId,
        departmentId: data.departmentId,
        vendorId: data.vendorId,
        requesterUserId: user.id,
        title: data.title.trim(),
        purpose: data.purpose.trim(),
        category: data.category.trim(),
        amountMinor: BigInt(data.amountMinor),
        currency: data.currency ?? "NPR",
        status: RequestStatus.DRAFT,
      },
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        requester: { select: { username: true } },
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "REQUEST_CREATED",
      entityType: "ExpenseRequest",
      entityId: req.id,
      after: {
        status: req.status,
        amountMinor: req.amountMinor.toString(),
        vendorId: req.vendorId,
        departmentId: req.departmentId,
      },
    });

    return NextResponse.json({ request: serializeRequest(req) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
