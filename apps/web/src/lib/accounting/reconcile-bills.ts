/**
 * Reconcile bills: detect when QBO has changed bills we exported.
 * Creates AccountingRemoteChange for admin review; does NOT overwrite local data.
 */
import { prisma } from "../db";
import { qboQuery } from "../qbo/client";
import { getValidQboAccessToken } from "../qbo/get-valid-token";

export async function reconcileBills(
  orgId: string,
  _jobId: string,
  log: (level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) => Promise<void>
): Promise<void> {
  const token = await getValidQboAccessToken(orgId);
  if (!token) throw new Error("No QBO connection");

  // Get all invoices we've exported (have ExternalIdLink to QBO_BILL)
  const links = await prisma.externalIdLink.findMany({
    where: {
      orgId,
      provider: "QUICKBOOKS_ONLINE",
      remoteEntityType: "QBO_BILL",
    },
  });

  for (const link of links) {
    const qboBillId = link.remoteEntityId;
    try {
      const res = await qboQuery<{ QueryResponse?: { Bill?: Array<Record<string, unknown>> } }>({
        realmId: token.realmId,
        accessToken: token.accessToken,
        query: `SELECT * FROM Bill WHERE Id = '${qboBillId.replace(/'/g, "''")}'`,
      });
      const bills = res?.QueryResponse?.Bill ?? [];
      if (bills.length === 0) {
        // Bill was deleted in QBO
        await upsertRemoteChange(orgId, "BILL", qboBillId, "INVOICE", link.localEntityId, "DELETED", { deleted: true });
        await log("WARN", `QBO Bill ${qboBillId} was deleted`, { invoiceId: link.localEntityId });
        continue;
      }

      const bill = bills[0] as {
        TotalAmt?: number;
        Balance?: number;
        VendorRef?: { value?: string };
        DocNumber?: string;
        MetaData?: { LastUpdatedTime?: string };
      };
      const local = await prisma.orgExternalBill.findUnique({
        where: { orgId_provider_qboBillId: { orgId, provider: "QUICKBOOKS_ONLINE", qboBillId } },
      });

      const remoteTotal = bill.TotalAmt != null ? String(bill.TotalAmt) : null;
      const remoteVendor = bill.VendorRef?.value ?? null;
      const remoteDocNumber = bill.DocNumber ?? null;

      if (
        !local ||
        (local.total !== remoteTotal) ||
        (local.vendorId !== remoteVendor) ||
        (local.docNumber !== remoteDocNumber)
      ) {
        await upsertRemoteChange(orgId, "BILL", qboBillId, "INVOICE", link.localEntityId, "UPDATED", {
          total: remoteTotal,
          vendorId: remoteVendor,
          docNumber: remoteDocNumber,
          localTotal: local?.total,
          localVendorId: local?.vendorId,
        });
        await log("INFO", `Remote change detected for QBO Bill ${qboBillId}`, { invoiceId: link.localEntityId });
      }

      // Update cache
      await prisma.orgExternalBill.upsert({
        where: { orgId_provider_qboBillId: { orgId, provider: "QUICKBOOKS_ONLINE", qboBillId } },
        create: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          qboBillId,
          docNumber: remoteDocNumber,
          vendorId: remoteVendor,
          total: remoteTotal,
          lastUpdatedTime: bill.MetaData?.LastUpdatedTime ?? null,
        },
        update: {
          docNumber: remoteDocNumber,
          vendorId: remoteVendor,
          total: remoteTotal,
          lastUpdatedTime: bill.MetaData?.LastUpdatedTime ?? null,
        },
      });
    } catch (e) {
      await log("ERROR", `Failed to reconcile bill ${qboBillId}: ${(e as Error).message}`, { qboBillId });
    }
  }
}

async function upsertRemoteChange(
  orgId: string,
  entityType: "BILL" | "VENDOR" | "ACCOUNT",
  remoteId: string,
  localEntityType: string,
  localEntityId: string,
  changeType: "CREATED" | "UPDATED" | "DELETED",
  snapshot: object
): Promise<void> {
  const existing = await prisma.accountingRemoteChange.findFirst({
    where: { orgId, entityType, remoteId, status: "OPEN" },
  });
  if (existing) return;

  await prisma.accountingRemoteChange.create({
    data: {
      orgId,
      provider: "QUICKBOOKS_ONLINE",
      entityType,
      remoteId,
      localEntityType,
      localEntityId,
      changeType,
      snapshot: snapshot as object,
      status: "OPEN",
    },
  });
}
