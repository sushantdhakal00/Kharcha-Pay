/**
 * GET /api/orgs/[orgId]/accounting/quickbooks
 * Connection status, last sync, jobs, external accounts for mapping.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  const { orgId } = await params;
  await requireOrgReadAccess(orgId, user.id);

  const conn = await prisma.accountingConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
  });
  const externalAccounts = await prisma.orgExternalGLAccount.findMany({
    where: { orgId, provider: "QUICKBOOKS_ONLINE" },
    orderBy: { remoteName: "asc" },
  });
  const mappings = await prisma.accountingMapping.findMany({
    where: { orgId, provider: "QUICKBOOKS_ONLINE" },
  });
  const lastJobs = await prisma.accountingSyncJob.findMany({
    where: { orgId, provider: "QUICKBOOKS_ONLINE" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const glCodes = await prisma.orgGLCode.findMany({
    where: { orgId, isActive: true },
    orderBy: { code: "asc" },
  });

  const remoteChanges = await prisma.accountingRemoteChange.findMany({
    where: { orgId, provider: "QUICKBOOKS_ONLINE" },
    orderBy: { detectedAt: "desc" },
    take: 20,
  });
  const recentErrorLogs = await prisma.accountingSyncLog.findMany({
    where: { orgId, provider: "QUICKBOOKS_ONLINE", level: "ERROR" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const blockedInvoices = recentErrorLogs
    .filter((l) => (l.meta as { reason?: string })?.reason === "CURRENCY_MISMATCH")
    .map((l) => (l.meta as { invoiceId?: string })?.invoiceId)
    .filter(Boolean) as string[];

  return NextResponse.json({
    connection: conn
      ? {
          status: conn.status,
          realmId: conn.realmId,
          connectedByUserId: conn.connectedByUserId,
          lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
          errorMessage: conn.errorMessage,
          homeCurrency: conn.homeCurrency,
          multiCurrencyEnabled: conn.multiCurrencyEnabled,
          includeAttachmentLinksInExport: conn.includeAttachmentLinksInExport,
        }
      : null,
    externalAccounts,
    mappings,
    lastJobs,
    glCodes,
    remoteChanges,
    blockedInvoices,
  });
}
