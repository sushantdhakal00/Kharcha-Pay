/**
 * QuickBooks CDC (Change Data Capture) backfill.
 * Compensates for missed webhook events; run daily.
 */
import { prisma } from "../db";
import { qboQuery } from "../qbo/client";
import { getValidQboAccessToken } from "../qbo/get-valid-token";

const ENTITIES = ["Bill", "BillPayment", "Vendor", "Account"] as const;

export async function runQboCdcSync(
  orgId: string,
  _jobId: string,
  log: (level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) => Promise<void>
): Promise<void> {
  const token = await getValidQboAccessToken(orgId);
  if (!token) throw new Error("No QBO connection");

  for (const entity of ENTITIES) {
    const cursorEntity = entity === "Bill" ? "BILLS" : entity === "BillPayment" ? "PAYMENTS" : entity === "Vendor" ? "VENDORS" : "ACCOUNTS";
    const cursorRec = await prisma.accountingSyncCursor.findUnique({
      where: {
        orgId_provider_entity: { orgId, provider: "QUICKBOOKS_ONLINE", entity: cursorEntity },
      },
    });
    const parsed = cursorRec?.cursor ? (JSON.parse(cursorRec.cursor) as { lastUpdated?: string }) : null;
    const lastUpdated = parsed?.lastUpdated ?? null;

    const whereClause = lastUpdated ? ` WHERE MetaData.LastUpdatedTime > '${lastUpdated.replace(/'/g, "''")}'` : "";
    const queryStr = `SELECT * FROM ${entity}${whereClause} MAXRESULTS 1000`;

    try {
      const qboRes = await qboQuery<{ QueryResponse?: Record<string, unknown[]> }>({
        realmId: token.realmId,
        accessToken: token.accessToken,
        query: queryStr,
      });

      const key = entity === "Bill" ? "Bill" : entity === "BillPayment" ? "BillPayment" : entity === "Vendor" ? "Vendor" : "Account";
      const rows = (qboRes?.QueryResponse?.[key] ?? []) as Array<{
        Id?: string;
        DocNumber?: string;
        TotalAmt?: number;
        Balance?: number;
        MetaData?: { LastUpdatedTime?: string };
        VendorRef?: { value?: string };
        Line?: Array<{ LinkedTxn?: Array<{ TxnId?: string }> }>;
      }>;

      let lastTime = lastUpdated;
      for (const row of rows) {
        const lut = (row as { MetaData?: { LastUpdatedTime?: string } }).MetaData?.LastUpdatedTime;
        if (lut && (!lastTime || lut > lastTime)) lastTime = lut;

        if (entity === "Vendor") {
          await prisma.orgExternalVendor.upsert({
            where: {
              orgId_provider_qboVendorId: { orgId, provider: "QUICKBOOKS_ONLINE", qboVendorId: String(row.Id) },
            },
            create: {
              orgId,
              provider: "QUICKBOOKS_ONLINE",
              qboVendorId: String(row.Id),
              displayName: (row as { DisplayName?: string }).DisplayName ?? "Unknown",
              currency: (row as { CurrencyRef?: { value?: string } }).CurrencyRef?.value ?? null,
              lastUpdatedTime: lut ?? null,
            },
            update: {
              displayName: (row as { DisplayName?: string }).DisplayName ?? "Unknown",
              currency: (row as { CurrencyRef?: { value?: string } }).CurrencyRef?.value ?? null,
              lastUpdatedTime: lut ?? null,
            },
          });
        } else if (entity === "Bill") {
          await prisma.orgExternalBill.upsert({
            where: {
              orgId_provider_qboBillId: { orgId, provider: "QUICKBOOKS_ONLINE", qboBillId: String(row.Id) },
            },
            create: {
              orgId,
              provider: "QUICKBOOKS_ONLINE",
              qboBillId: String(row.Id),
              docNumber: row.DocNumber ?? null,
              vendorId: row.VendorRef?.value ?? null,
              total: row.TotalAmt != null ? String(row.TotalAmt) : null,
              currency: (row as { CurrencyRef?: { value?: string } }).CurrencyRef?.value ?? null,
              lastUpdatedTime: lut ?? null,
            },
            update: {
              docNumber: row.DocNumber ?? null,
              vendorId: row.VendorRef?.value ?? null,
              total: row.TotalAmt != null ? String(row.TotalAmt) : null,
              currency: (row as { CurrencyRef?: { value?: string } }).CurrencyRef?.value ?? null,
              lastUpdatedTime: lut ?? null,
            },
          });
        } else if (entity === "Account") {
          await prisma.orgExternalGLAccount.upsert({
            where: { orgId_provider_remoteId: { orgId, provider: "QUICKBOOKS_ONLINE", remoteId: String(row.Id) } },
            create: {
              orgId,
              provider: "QUICKBOOKS_ONLINE",
              remoteId: String(row.Id),
              remoteName: (row as { Name?: string }).Name ?? "Unknown",
              accountType: (row as { AccountType?: string }).AccountType ?? null,
            },
            update: {
              remoteName: (row as { Name?: string }).Name ?? "Unknown",
              accountType: (row as { AccountType?: string }).AccountType ?? null,
            },
          });
        } else if (entity === "BillPayment") {
          const linked = row.Line?.flatMap((l) => l.LinkedTxn?.map((t) => t.TxnId) ?? []).filter(Boolean).join(",") ?? null;
          await prisma.orgExternalBillPayment.upsert({
            where: {
              orgId_provider_qboBillPaymentId: { orgId, provider: "QUICKBOOKS_ONLINE", qboBillPaymentId: String(row.Id) },
            },
            create: {
              orgId,
              provider: "QUICKBOOKS_ONLINE",
              qboBillPaymentId: String(row.Id),
              linkedBillIds: linked,
              total: row.TotalAmt != null ? String(row.TotalAmt) : null,
              currency: (row as { CurrencyRef?: { value?: string } }).CurrencyRef?.value ?? null,
              lastUpdatedTime: lut ?? null,
            },
            update: {
              linkedBillIds: linked,
              total: row.TotalAmt != null ? String(row.TotalAmt) : null,
              currency: (row as { CurrencyRef?: { value?: string } }).CurrencyRef?.value ?? null,
              lastUpdatedTime: lut ?? null,
            },
          });
        }
        // Account: already in OrgExternalGLAccount via sync-reference
      }

      if (lastTime) {
        await prisma.accountingSyncCursor.upsert({
          where: {
            orgId_provider_entity: { orgId, provider: "QUICKBOOKS_ONLINE", entity: cursorEntity },
          },
          create: {
            orgId,
            provider: "QUICKBOOKS_ONLINE",
            entity: cursorEntity,
            cursor: JSON.stringify({ lastUpdated: lastTime }),
          },
          update: { cursor: JSON.stringify({ lastUpdated: lastTime }) },
        });
      }
      await log("INFO", `CDC ${entity}: upserted ${rows.length}`, { entity, count: rows.length });
    } catch (e) {
      await log("ERROR", `CDC ${entity} failed: ${(e as Error).message}`, { entity });
      throw e;
    }
  }
}
