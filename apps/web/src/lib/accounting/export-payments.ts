/**
 * Export invoice payments to QBO BillPayment.
 */
import { prisma } from "../db";
import { qboRequest } from "../qbo/client";
import { getValidQboAccessToken } from "../qbo/get-valid-token";

export async function exportPayments(
  orgId: string,
  jobId: string,
  log: (level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) => Promise<void>
): Promise<{ exported: number; skipped: number }> {
  const token = await getValidQboAccessToken(orgId);
  if (!token) throw new Error("No QBO connection");

  const payments = await prisma.payment.findMany({
    where: { orgId, status: "COMPLETED" },
    include: { invoice: { include: { vendor: true } } },
  });

  let exported = 0;
  let skipped = 0;

  for (const pay of payments) {
    const existing = await prisma.externalIdLink.findUnique({
      where: {
        orgId_provider_localEntityType_localEntityId: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "PAYMENT",
          localEntityId: pay.id,
        },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const billLink = await prisma.externalIdLink.findUnique({
      where: {
        orgId_provider_localEntityType_localEntityId: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "INVOICE",
          localEntityId: pay.invoiceId,
        },
      },
    });
    if (!billLink) {
      await log("WARN", `Skipping payment ${pay.id}: invoice not linked to QBO Bill`, { paymentId: pay.id });
      skipped++;
      continue;
    }

    const vendorLink = await prisma.externalIdLink.findUnique({
      where: {
        orgId_provider_localEntityType_localEntityId: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "VENDOR",
          localEntityId: pay.invoice.vendorId,
        },
      },
    });
    if (!vendorLink) {
      await log("WARN", `Skipping payment ${pay.id}: vendor not linked to QBO`, { paymentId: pay.id });
      skipped++;
      continue;
    }

    const amount = Number(pay.amountMinor) / 100;
    const billPayment = {
      VendorRef: { value: vendorLink.remoteEntityId },
      TxnDate: pay.paidAt.toISOString().slice(0, 10),
      TotalAmt: amount,
      PayType: "Check",
      Line: [{ Amount: amount, LinkedTxn: [{ TxnId: billLink.remoteEntityId, TxnType: "Bill" }] }],
    };

    try {
      const res = (await qboRequest<{ BillPayment?: { Id: string } }>({
        ...token,
        method: "POST",
        path: "/billpayment",
        body: billPayment,
      })) as { BillPayment?: { Id: string } };
      const qboId = res?.BillPayment?.Id;
      if (qboId) {
        await prisma.externalIdLink.create({
          data: {
            orgId,
            provider: "QUICKBOOKS_ONLINE",
            localEntityType: "PAYMENT",
            localEntityId: pay.id,
            remoteEntityType: "QBO_BILLPAYMENT",
            remoteEntityId: String(qboId),
          },
        });
        const now = new Date();
        await prisma.orgExternalBillPayment.upsert({
          where: { orgId_provider_qboBillPaymentId: { orgId, provider: "QUICKBOOKS_ONLINE", qboBillPaymentId: String(qboId) } },
          create: {
            orgId,
            provider: "QUICKBOOKS_ONLINE",
            qboBillPaymentId: String(qboId),
            linkedBillIds: billLink.remoteEntityId,
            total: String(amount),
            currency: pay.currency,
            lastUpdatedTime: now.toISOString(),
            updatedAt: now,
          },
          update: {
            linkedBillIds: billLink.remoteEntityId,
            total: String(amount),
            currency: pay.currency,
            lastUpdatedTime: now.toISOString(),
            updatedAt: now,
          },
        });
        exported++;
        await log("INFO", `Exported payment to QBO BillPayment`, { paymentId: pay.id, qboBillPaymentId: qboId });
      }
    } catch (e) {
      await log("ERROR", `Failed to export payment: ${(e as Error).message}`, { paymentId: pay.id });
      throw e;
    }
  }

  return { exported, skipped };
}
