import { NextResponse } from "next/server";
import { vendorCreateSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";
import { getVendorConcentration } from "@/lib/vendor-queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as string | null;
    const overdue = searchParams.get("overdue") === "true";
    const highRisk = searchParams.get("highRisk") === "true";
    const missingDocs = searchParams.get("missingDocs") === "true";
    const paymentUnverified = searchParams.get("paymentUnverified") === "true";

    const where: Record<string, unknown> = { orgId };
    if (
      statusFilter &&
      ["DRAFT", "ACTIVE", "ARCHIVED", "ONBOARDING", "BLOCKED", "INACTIVE"].includes(statusFilter)
    ) {
      where.status = statusFilter;
    }
    if (highRisk) {
      where.riskLevel = "HIGH";
    }

    const vendors = await prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        paymentMethods: { where: { status: "VERIFIED" }, take: 1 },
        documents: { where: { status: "VERIFIED" }, distinct: ["type"], select: { type: true } },
        onboardingCases: { where: { status: "OPEN" }, take: 1 },
      },
    });

    let vendorIdsToFilter = vendors.map((v) => v.id);
    if (overdue) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const overdueCases = await prisma.vendorOnboardingCase.findMany({
        where: { orgId, status: "OPEN", createdAt: { lte: cutoff } },
        select: { vendorId: true },
      });
      const overdueVendorIds = new Set(overdueCases.map((c) => c.vendorId));
      vendorIdsToFilter = vendorIdsToFilter.filter((id) => overdueVendorIds.has(id));
    }
    if (missingDocs) {
      const withVerifiedDocs = new Set(
        (
          await prisma.vendorDocument.groupBy({
            by: ["vendorId"],
            where: { status: "VERIFIED" },
          })
        ).map((d) => d.vendorId)
      );
      vendorIdsToFilter = vendorIdsToFilter.filter((id) => !withVerifiedDocs.has(id));
    }
    if (paymentUnverified) {
      const withVerifiedPm = await prisma.vendorPaymentMethod.findMany({
        where: { vendorId: { in: vendorIdsToFilter }, status: "VERIFIED" },
        select: { vendorId: true },
      });
      const vendorIdsWithVerified = new Set(withVerifiedPm.map((p) => p.vendorId));
      vendorIdsToFilter = vendorIdsToFilter.filter((id) => !vendorIdsWithVerified.has(id));
    }

    const filtered = vendors.filter((v) => vendorIdsToFilter.includes(v.id));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const paidByVendor = await prisma.expenseRequest.groupBy({
      by: ["vendorId"],
      where: {
        orgId,
        status: "PAID",
        paidAt: { gte: thirtyDaysAgo },
      },
      _sum: { amountMinor: true },
    });
    const spendMap = new Map(paidByVendor.map((r) => [r.vendorId, r._sum.amountMinor ?? BigInt(0)]));
    const totalSpend = paidByVendor.reduce((a, r) => a + (r._sum.amountMinor ?? BigInt(0)), BigInt(0));

    const concentration =
      totalSpend > BigInt(0)
        ? await getVendorConcentration(orgId, thirtyDaysAgo, new Date())
        : [];
    const concentrationMap = new Map(concentration.map((c) => [c.vendorId, c.concentrationPct]));

    return NextResponse.json({
      vendors: filtered.map((v) => {
        const spend30 = spendMap.get(v.id) ?? BigInt(0);
        const concPct = concentrationMap.get(v.id) ?? 0;
        const hasVerifiedPm = v.paymentMethods.length > 0;
        const verifiedDocCount = v.documents.length;
        const paymentMethodStatus = hasVerifiedPm ? "VERIFIED" : "PENDING_VERIFICATION";
        const docsStatus = verifiedDocCount > 0 ? "COMPLETE" : "MISSING";
        return {
          id: v.id,
          name: v.name,
          displayName: v.displayName ?? v.name,
          legalName: v.legalName ?? null,
          contactEmail: v.contactEmail ?? null,
          contactPhone: v.contactPhone ?? null,
          notes: v.notes ?? null,
          status: v.status,
          riskLevel: v.riskLevel ?? "LOW",
          ownerPubkey: v.ownerPubkey ?? null,
          tokenAccount: v.tokenAccount ?? null,
          spendLast30Minor: spend30.toString(),
          concentrationPct: concPct,
          paymentMethodStatus,
          docsStatus,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        };
      }),
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
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.STAFF]);

    const body = await request.json();
    const parsed = vendorCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name } = parsed.data;
    const nameTrim = name.trim();

    const existing = await prisma.vendor.findUnique({
      where: { orgId_name: { orgId, name: nameTrim } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Vendor with this name already exists" },
        { status: 409 }
      );
    }

    const vendor = await prisma.vendor.create({
      data: { orgId, name: nameTrim, createdByUserId: user.id },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "VENDOR_CREATED",
      entityType: "Vendor",
      entityId: vendor.id,
      after: { id: vendor.id, name: vendor.name, status: vendor.status },
    });
    await emitOutboxEvent({
      orgId,
      type: "VENDOR_CREATED",
      payload: { vendorId: vendor.id, name: vendor.name },
    });

    return NextResponse.json({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        status: vendor.status,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
