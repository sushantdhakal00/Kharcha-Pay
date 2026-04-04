/**
 * Memoized selectors for vendor concentration, onboarding overdue, unverified payment methods.
 */
import { prisma } from "./db";

export interface VendorConcentration {
  vendorId: string;
  vendorName: string;
  spendMinor: bigint;
  totalMinor: bigint;
  concentrationPct: number;
}

export async function getVendorConcentration(
  orgId: string,
  from: Date,
  to: Date
): Promise<VendorConcentration[]> {
  const paid = await prisma.expenseRequest.groupBy({
    by: ["vendorId"],
    where: {
      orgId,
      status: "PAID",
      paidAt: { gte: from, lte: to },
    },
    _sum: { amountMinor: true },
  });

  const totalMinor = paid.reduce((acc, r) => acc + (r._sum.amountMinor ?? BigInt(0)), BigInt(0));
  if (totalMinor === BigInt(0)) return [];

  const vendorIds = paid.map((p) => p.vendorId);
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));

  return paid.map((r) => {
    const spend = r._sum.amountMinor ?? BigInt(0);
    const pct = Number((spend * BigInt(10000) / totalMinor)) / 100;
    return {
      vendorId: r.vendorId,
      vendorName: nameMap[r.vendorId] ?? r.vendorId,
      spendMinor: spend,
      totalMinor,
      concentrationPct: pct,
    };
  });
}

/** Top vendor concentration (any vendor > 25% of spend) */
export async function getVendorConcentrationAlerts(
  orgId: string,
  from: Date,
  to: Date,
  thresholdPct = 25
): Promise<VendorConcentration[]> {
  const all = await getVendorConcentration(orgId, from, to);
  return all.filter((v) => v.concentrationPct >= thresholdPct);
}

/** Count of onboarding cases OPEN > 7 days */
export async function getOnboardingOverdueCount(orgId: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return prisma.vendorOnboardingCase.count({
    where: {
      orgId,
      status: "OPEN",
      createdAt: { lte: cutoff },
    },
  });
}

/** Count of vendors with no verified payment method (ACTIVE or ONBOARDING) */
export async function getUnverifiedPaymentMethodCount(orgId: string): Promise<number> {
  const vendors = await prisma.vendor.findMany({
    where: {
      orgId,
      status: { in: ["ACTIVE", "ONBOARDING"] },
    },
    select: { id: true },
  });
  const vendorIds = vendors.map((v) => v.id);
  const verifiedCount = await prisma.vendorPaymentMethod.count({
    where: {
      vendorId: { in: vendorIds },
      status: "VERIFIED",
    },
  });
  // Vendors with at least one verified method
  const withVerified = await prisma.vendorPaymentMethod.findMany({
    where: {
      vendorId: { in: vendorIds },
      status: "VERIFIED",
    },
    select: { vendorId: true },
    distinct: ["vendorId"],
  });
  const vendorIdsWithVerified = new Set(withVerified.map((v) => v.vendorId));
  return vendorIds.filter((id) => !vendorIdsWithVerified.has(id)).length;
}
