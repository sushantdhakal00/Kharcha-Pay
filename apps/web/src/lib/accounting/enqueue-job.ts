/**
 * Enqueue accounting sync jobs. Call from invoice verify, payment record, etc.
 */
import { prisma } from "../db";
import type { AccountingSyncJobType } from "@prisma/client";

export async function enqueueAccountingSyncJob(
  orgId: string,
  type: AccountingSyncJobType,
  meta?: { invoiceId?: string; paymentId?: string }
): Promise<void> {
  const conn = await prisma.accountingConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
  });
  if (!conn || conn.status !== "CONNECTED") return;

  await prisma.accountingSyncJob.create({
    data: { orgId, provider: "QUICKBOOKS_ONLINE", type, status: "PENDING", meta: meta ?? undefined },
  });
}
