/**
 * GET /api/orgs/[orgId]/vendors/[vendorId]/detail
 * Vendor 360 detail: profile, contacts, payment methods, documents, onboarding, activity.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; vendorId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, vendorId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, orgId },
      include: {
        contacts: { orderBy: { isPrimary: "desc" } },
        paymentMethods: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        onboardingCases: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [spend30, invoices, pos, requests] = await Promise.all([
      prisma.expenseRequest.aggregate({
        where: {
          orgId,
          vendorId,
          status: "PAID",
          paidAt: { gte: thirtyDaysAgo },
        },
        _sum: { amountMinor: true },
      }),
      prisma.invoice.count({ where: { vendorId } }),
      prisma.purchaseOrder.count({ where: { vendorId } }),
      prisma.expenseRequest.count({ where: { vendorId } }),
    ]);

    const totalOrgSpend = await prisma.expenseRequest.aggregate({
      where: { orgId, status: "PAID", paidAt: { gte: thirtyDaysAgo } },
      _sum: { amountMinor: true },
    });
    const total = totalOrgSpend._sum.amountMinor ?? BigInt(0);
    const vendorSpend = spend30._sum.amountMinor ?? BigInt(0);
    const concentrationPct =
      total > BigInt(0) ? Number((vendorSpend * BigInt(10000) / total)) / 100 : 0;

    const auditEvents = await prisma.auditEvent.findMany({
      where: { orgId, entityType: "Vendor", entityId: vendorId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        displayName: vendor.displayName ?? vendor.name,
        legalName: vendor.legalName ?? null,
        taxId: vendor.taxId ?? null,
        registrationId: vendor.registrationId ?? null,
        contactEmail: vendor.contactEmail ?? null,
        contactPhone: vendor.contactPhone ?? null,
        notes: vendor.notes ?? null,
        category: vendor.category ?? null,
        status: vendor.status,
        riskLevel: vendor.riskLevel ?? "LOW",
        ownerPubkey: vendor.ownerPubkey ?? null,
        tokenAccount: vendor.tokenAccount ?? null,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      },
      contacts: vendor.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        roleTitle: c.roleTitle ?? null,
        isPrimary: c.isPrimary,
      })),
      paymentMethods: vendor.paymentMethods.map((p) => ({
        id: p.id,
        type: p.type,
        bankAccountMasked: p.bankAccountMasked ?? null,
        bankName: p.bankName ?? null,
        country: p.country ?? null,
        currency: p.currency ?? null,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
      documents: vendor.documents.map((d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        status: d.status,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      onboardingCases: vendor.onboardingCases.map((c) => ({
        id: c.id,
        status: c.status,
        ownerUserId: c.ownerUserId ?? null,
        dueAt: c.dueAt?.toISOString() ?? null,
        checklist: c.checklist,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      spend: {
        last30Minor: vendorSpend.toString(),
        concentrationPct,
      },
      counts: { invoices, purchaseOrders: pos, requests },
      auditEvents: auditEvents.map((e) => ({
        id: e.id,
        action: e.action,
        actorUserId: e.actorUserId ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
