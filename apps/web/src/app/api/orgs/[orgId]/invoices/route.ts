import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { jsonResponse } from "@/lib/json-response";

const OVERDUE_VERIFICATION_DAYS = 5;
const SLA_RISK_DAYS = 3;

function toStr(b: bigint): string {
  return b.toString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as InvoiceStatus | null;
    const type = searchParams.get("type") as InvoiceType | null;
    const vendorId = searchParams.get("vendorId");
    const poId = searchParams.get("poId");
    const overdueVerification = searchParams.get("overdueVerification") === "true";
    const noReceipt = searchParams.get("noReceipt") === "true";
    const highValue = searchParams.get("highValue") === "true";
    const search = searchParams.get("search")?.trim() || "";
    const sort = searchParams.get("sort") || "age";

    const where: Record<string, unknown> = { orgId };
    if (status) where.status = status;
    if (type) where.type = type;
    if (vendorId) where.vendorId = vendorId;
    if (poId) where.poId = poId;
    if (overdueVerification) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - OVERDUE_VERIFICATION_DAYS);
      where.submittedAt = { lte: cutoff };
      where.status = { in: [InvoiceStatus.SUBMITTED, InvoiceStatus.NEEDS_VERIFICATION, InvoiceStatus.EXCEPTION] };
    }
    if (noReceipt) {
      where.type = InvoiceType.PO_INVOICE;
      where.status = { in: [InvoiceStatus.SUBMITTED, InvoiceStatus.EXCEPTION] };
      where.matchResults = { some: { status: "NO_RECEIPT" } };
    }
    if (highValue) {
      const policy = await prisma.orgPolicy.findUnique({ where: { orgId } });
      const threshold = policy?.highValueThresholdMinor ?? BigInt(1000000);
      where.totalMinor = { gte: threshold };
      where.status = { in: [InvoiceStatus.SUBMITTED, InvoiceStatus.NEEDS_VERIFICATION, InvoiceStatus.EXCEPTION] };
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { po: { poNumber: { contains: search, mode: "insensitive" } } },
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        vendor: { select: { name: true } },
        po: { select: { poNumber: true } },
        department: { select: { name: true } },
        createdBy: { select: { username: true } },
        assignedTo: { select: { username: true } },
        matchResults: { take: 1, orderBy: { computedAt: "desc" } },
      },
      orderBy: { submittedAt: "desc" },
    });

    let sorted = invoices;
    if (sort === "age") {
      sorted = [...invoices].sort((a, b) => {
        const sa = a.submittedAt?.getTime() ?? a.createdAt.getTime();
        const sb = b.submittedAt?.getTime() ?? b.createdAt.getTime();
        return sa - sb;
      });
    } else if (sort === "amount") {
      sorted = [...invoices].sort((a, b) => Number(b.totalMinor - a.totalMinor));
    } else if (sort === "risk") {
      sorted = [...invoices].sort((a, b) => {
        const ar = a.status === "EXCEPTION" ? 2 : a.matchResults[0]?.status === "NO_RECEIPT" ? 1 : 0;
        const br = b.status === "EXCEPTION" ? 2 : b.matchResults[0]?.status === "NO_RECEIPT" ? 1 : 0;
        return br - ar;
      });
    }

    const now = Date.now();
    return jsonResponse({
      invoices: sorted.map((inv) => {
        const sub = inv.submittedAt ?? inv.createdAt;
        const ageMs = now - sub.getTime();
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        const slaRisk = ageDays >= SLA_RISK_DAYS && ageDays < OVERDUE_VERIFICATION_DAYS;
        const overdue = ageDays >= OVERDUE_VERIFICATION_DAYS;
        const matchStatus = inv.matchResults[0]?.status ?? null;
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          vendorId: inv.vendorId,
          vendorName: inv.vendor.name,
          type: inv.type,
          poId: inv.poId,
          poNumber: inv.po?.poNumber,
          currency: inv.currency,
          subtotalMinor: toStr(inv.subtotalMinor),
          taxMinor: toStr(inv.taxMinor),
          totalMinor: toStr(inv.totalMinor),
          status: inv.status,
          issuedAt: inv.issuedAt?.toISOString() ?? null,
          dueAt: inv.dueAt?.toISOString() ?? null,
          submittedAt: inv.submittedAt?.toISOString() ?? null,
          departmentName: inv.department?.name,
          glCode: inv.glCode,
          createdByUsername: inv.createdBy.username,
          assignedToUsername: inv.assignedTo?.username ?? null,
          matchStatus,
          ageDays,
          slaRisk,
          overdue,
          createdAt: inv.createdAt.toISOString(),
        };
      }),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const body = await request.json();
    const vendorId = body.vendorId as string;
    const type = (body.type as InvoiceType) || InvoiceType.NON_PO_INVOICE;
    const poId = (body.poId as string) || null;
    const invoiceNumber = (body.invoiceNumber as string)?.trim();
    const currency = (body.currency as string) || "NPR";
    const departmentId = (body.departmentId as string) || null;
    const costCenterId = (body.costCenterId as string) || null;
    const projectId = (body.projectId as string) || null;
    const glCode = (body.glCode as string) || null;
    const issuedAt = body.issuedAt ? new Date(body.issuedAt) : null;
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];

    if (!vendorId) {
      return NextResponse.json({ error: "vendorId required" }, { status: 400 });
    }
    if (!invoiceNumber) {
      return NextResponse.json({ error: "invoiceNumber required" }, { status: 400 });
    }
    if (type === InvoiceType.PO_INVOICE && !poId) {
      return NextResponse.json({ error: "poId required for PO_INVOICE" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, orgId } });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
    }
    const existing = await prisma.invoice.findUnique({
      where: { orgId_vendorId_invoiceNumber: { orgId, vendorId, invoiceNumber } },
    });
    if (existing) {
      return NextResponse.json({ error: "Invoice number already exists for this vendor" }, { status: 400 });
    }
    let resolvedDepartmentId = departmentId;
    let resolvedCostCenterId = costCenterId;
    let resolvedProjectId = projectId;
    if (poId) {
      const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, orgId } });
      if (!po) return NextResponse.json({ error: "PO not found" }, { status: 400 });
      if (type === InvoiceType.PO_INVOICE) {
        resolvedDepartmentId = resolvedDepartmentId ?? po.departmentId;
        resolvedCostCenterId = resolvedCostCenterId ?? po.costCenterId;
        resolvedProjectId = resolvedProjectId ?? po.projectId;
      }
    }

    let subtotalMinor = BigInt(0);
    const lineItemData = lineItems.map((li: { description: string; qty: number; unitPriceMinor: string; poLineItemId?: string }) => {
      const qty = Math.max(0, Number(li.qty) || 0);
      const unit = BigInt(li.unitPriceMinor ?? 0);
      const total = unit * BigInt(qty);
      subtotalMinor += total;
      return {
        description: String(li.description || "").trim() || "Line item",
        qty,
        unitPriceMinor: unit,
        totalMinor: total,
        poLineItemId: li.poLineItemId || null,
      };
    });

    const taxMinor = BigInt(0);
    const totalMinor = subtotalMinor + taxMinor;

    const inv = await prisma.invoice.create({
      data: {
        orgId,
        invoiceNumber,
        vendorId,
        source: "MANUAL",
        type,
        poId,
        currency,
        subtotalMinor,
        taxMinor,
        totalMinor,
        issuedAt,
        dueAt,
        status: InvoiceStatus.DRAFT,
        createdByUserId: user.id,
        departmentId: resolvedDepartmentId,
        costCenterId: resolvedCostCenterId,
        projectId: resolvedProjectId,
        glCode,
        lineItems: { create: lineItemData },
      },
      include: {
        vendor: { select: { name: true } },
        po: { select: { poNumber: true } },
        department: { select: { name: true } },
        lineItems: true,
      },
    });

    return jsonResponse({
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorId: inv.vendorId,
        vendorName: inv.vendor.name,
        type: inv.type,
        poId: inv.poId,
        poNumber: inv.po?.poNumber,
        currency: inv.currency,
        subtotalMinor: toStr(inv.subtotalMinor),
        taxMinor: toStr(inv.taxMinor),
        totalMinor: toStr(inv.totalMinor),
        status: inv.status,
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        dueAt: inv.dueAt?.toISOString() ?? null,
        departmentName: inv.department?.name,
        createdAt: inv.createdAt.toISOString(),
        lineItems: inv.lineItems.map((l) => ({
          id: l.id,
          description: l.description,
          qty: l.qty,
          unitPriceMinor: toStr(l.unitPriceMinor),
          totalMinor: toStr(l.totalMinor),
          poLineItemId: l.poLineItemId,
        })),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
