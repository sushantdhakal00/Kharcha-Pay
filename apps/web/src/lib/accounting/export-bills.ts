/**
 * Export verified/approved invoices to QBO Bills.
 * Day 28: multi-currency guards, attachment links in memo, error mapping.
 */
import { prisma } from "../db";
import { qboRequest } from "../qbo/client";
import { getValidQboAccessToken } from "../qbo/get-valid-token";
import { mapQboErrorToGuidance } from "./map-qbo-error";
import { InvoiceStatus } from "@prisma/client";
import { env } from "../env";

export async function exportBills(
  orgId: string,
  _jobId: string,
  log: (level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) => Promise<void>
): Promise<{ exported: number; skipped: number }> {
  const token = await getValidQboAccessToken(orgId);
  if (!token) throw new Error("No QBO connection");

  const conn = await prisma.accountingConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
  });
  const homeCurrency = conn?.homeCurrency ?? "USD";
  const multiCurrencyEnabled = conn?.multiCurrencyEnabled ?? false;
  const includeAttachmentLinks = conn?.includeAttachmentLinksInExport ?? true;

  const invoices = await prisma.invoice.findMany({
    where: {
      orgId,
      status: { in: [InvoiceStatus.VERIFIED, InvoiceStatus.APPROVED] },
    },
    include: {
      vendor: true,
      lineItems: true,
      po: { select: { poNumber: true } },
    },
  });

  let exported = 0;
  let skipped = 0;

  for (const inv of invoices) {
    if (inv.vendor.status !== "ACTIVE") {
      await log("WARN", `Skipping invoice ${inv.invoiceNumber}: vendor not active`, { invoiceId: inv.id });
      skipped++;
      continue;
    }

    // Check if already linked to QBO bill
    const existing = await prisma.externalIdLink.findUnique({
      where: {
        orgId_provider_localEntityType_localEntityId: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "INVOICE",
          localEntityId: inv.id,
        },
      },
    });
    if (existing) {
      skipped++;
      continue; // v1: skip updates to avoid unintended edits
    }

    // Get QBO vendor (create or find)
    let vendorRef: { value: string };
    const vendorLink = await prisma.externalIdLink.findUnique({
      where: {
        orgId_provider_localEntityType_localEntityId: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "VENDOR",
          localEntityId: inv.vendorId,
        },
      },
    });
    if (vendorLink) {
      vendorRef = { value: vendorLink.remoteEntityId };
    } else {
      const qboVendor = await ensureQboVendor(orgId, token, inv.vendor, log);
      if (!qboVendor) {
        await log("WARN", `Skipping invoice ${inv.invoiceNumber}: could not map vendor`, { invoiceId: inv.id });
        skipped++;
        continue;
      }
      vendorRef = { value: qboVendor };
    }

    // Get GL account mapping (invoice-level glCode)
    const glCode = inv.glCode;
    let accountRef: { value: string } | null = null;
    if (glCode) {
      const mapping = await prisma.accountingMapping.findUnique({
        where: {
          orgId_provider_localType_localId: {
            orgId,
            provider: "QUICKBOOKS_ONLINE",
            localType: "GL_CODE",
            localId: glCode,
          },
        },
      });
      if (mapping) accountRef = { value: mapping.remoteId };
    }
    if (!accountRef) {
      await log("WARN", `Skipping invoice ${inv.invoiceNumber}: no GL code mapping`, { invoiceId: inv.id, glCode });
      skipped++;
      continue;
    }

    // Multi-currency guard (Day 28)
    const invCurrency = inv.currency ?? "USD";
    if (invCurrency !== homeCurrency && !multiCurrencyEnabled) {
      const guidance = "Enable multi-currency in QuickBooks or export invoices in home currency (" + homeCurrency + ").";
      await log("ERROR", `Blocked: invoice ${inv.invoiceNumber} currency ${invCurrency} != QBO home ${homeCurrency}. ${guidance}`, {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        reason: "CURRENCY_MISMATCH",
        fixHint: guidance,
      });
      skipped++;
      continue;
    }

    const lineItems = inv.lineItems.length > 0
      ? inv.lineItems.map((line) => ({
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: Number(line.totalMinor) / 100,
          Description: line.description,
          AccountBasedExpenseLineDetail: { AccountRef: accountRef! },
        }))
      : [{
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: Number(inv.totalMinor) / 100,
          Description: "Invoice total",
          AccountBasedExpenseLineDetail: { AccountRef: accountRef },
        }];

    const baseMemo = inv.type === "PO_INVOICE" && inv.po
      ? `PO: ${inv.po.poNumber} | KharchaPay Invoice ${inv.id}`
      : `KharchaPay Invoice ${inv.id}`;
    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
    const attachmentLink = includeAttachmentLinks && appUrl
      ? ` Attachments: ${appUrl}/app/invoices/${inv.id} (requires login)`
      : "";
    const memo = baseMemo + attachmentLink;

    const bill = {
      VendorRef: vendorRef,
      TxnDate: inv.issuedAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      DueDate: inv.dueAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      PrivateNote: memo,
      Line: lineItems,
    };

    try {
      const res = (await qboRequest<{ Bill?: { Id: string } }>({
        ...token,
        method: "POST",
        path: "/bill",
        body: bill,
      })) as { Bill?: { Id: string } };
      const qboBillId = res?.Bill?.Id;
      if (qboBillId) {
        await prisma.externalIdLink.create({
          data: {
            orgId,
            provider: "QUICKBOOKS_ONLINE",
            localEntityType: "INVOICE",
            localEntityId: inv.id,
            remoteEntityType: "QBO_BILL",
            remoteEntityId: String(qboBillId),
          },
        });
        const now = new Date();
        await prisma.orgExternalBill.upsert({
          where: { orgId_provider_qboBillId: { orgId, provider: "QUICKBOOKS_ONLINE", qboBillId } },
          create: {
            orgId,
            provider: "QUICKBOOKS_ONLINE",
            qboBillId,
            docNumber: inv.invoiceNumber,
            vendorId: vendorRef.value,
            total: String(Number(inv.totalMinor) / 100),
            currency: invCurrency,
            lastUpdatedTime: now.toISOString(),
            updatedAt: now,
          },
          update: {
            docNumber: inv.invoiceNumber,
            vendorId: vendorRef.value,
            total: String(Number(inv.totalMinor) / 100),
            currency: invCurrency,
            lastUpdatedTime: now.toISOString(),
            updatedAt: now,
          },
        });
        exported++;
        await log("INFO", `Exported invoice ${inv.invoiceNumber} to QBO Bill`, { invoiceId: inv.id, qboBillId });
      }
    } catch (e) {
      const err = e as Error;
      const { message, fixHint } = mapQboErrorToGuidance(err);
      await log("ERROR", `Failed to export invoice ${inv.invoiceNumber}: ${message}`, {
        invoiceId: inv.id,
        fixHint,
      });
      throw e;
    }
  }

  return { exported, skipped };
}

async function ensureQboVendor(
  orgId: string,
  token: { accessToken: string; realmId: string },
  vendor: { id: string; name: string; displayName: string | null; legalName: string | null },
  log: (level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) => Promise<void>
): Promise<string | null> {
  try {
    const res = (await qboRequest<{ Vendor?: { Id: string } }>({
      ...token,
      method: "POST",
      path: "/vendor",
      body: {
        DisplayName: vendor.displayName || vendor.name,
        CompanyName: vendor.legalName || vendor.name,
      },
    })) as { Vendor?: { Id: string } };
    const qboId = res?.Vendor?.Id;
    if (qboId) {
      await prisma.externalIdLink.create({
        data: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "VENDOR",
          localEntityId: vendor.id,
          remoteEntityType: "QBO_VENDOR",
          remoteEntityId: String(qboId),
        },
      });
      const now = new Date();
      await prisma.orgExternalVendor.upsert({
        where: { orgId_provider_qboVendorId: { orgId, provider: "QUICKBOOKS_ONLINE", qboVendorId: String(qboId) } },
        create: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          qboVendorId: String(qboId),
          displayName: vendor.displayName || vendor.name,
          updatedAt: now,
        },
        update: { displayName: vendor.displayName || vendor.name, updatedAt: now },
      });
      return String(qboId);
    }
  } catch (e) {
    await log("WARN", `Could not create QBO vendor for ${vendor.name}: ${(e as Error).message}`);
  }
  return null;
}
