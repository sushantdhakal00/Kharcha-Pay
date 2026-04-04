/**
 * Invoice matching engine: 2-way (PO vs Invoice) and 3-way (PO vs Receipt vs Invoice).
 * Key internal control to prevent incorrect/fraudulent payments and strengthen audit trail.
 */
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

const DEFAULT_TOLERANCE = {
  qty: 2,
  price: 1,
  amount: 1,
};

export type MatchDiff = {
  lineIndex: number;
  poLineItemId?: string;
  description?: string;
  qtyOrdered?: number;
  qtyInvoiced?: number;
  qtyReceived?: number;
  qtyDiff?: number;
  priceOrderedMinor?: string;
  priceInvoicedMinor?: string;
  priceDiffPct?: number;
  amountOrderedMinor?: string;
  amountInvoicedMinor?: string;
  amountDiffPct?: number;
  reason?: string;
};

export type MatchResultPayload = {
  matchType: "TWO_WAY" | "THREE_WAY";
  status: "MATCHED" | "MISMATCH" | "PARTIAL" | "NO_PO" | "NO_RECEIPT";
  diffs: MatchDiff[];
  toleranceApplied: {
    qtyTolerancePct: number;
    priceTolerancePct: number;
    amountTolerancePct: number;
  };
};

function getTolerance(orgId: string): Promise<{ qty: number; price: number; amount: number }> {
  return prisma.orgMatchTolerance
    .findUnique({ where: { orgId } })
    .then((t) =>
      t
        ? {
            qty: Number(t.qtyTolerancePct),
            price: Number(t.priceTolerancePct),
            amount: Number(t.amountTolerancePct),
          }
        : DEFAULT_TOLERANCE
    );
}

/** Exported for unit tests */
export function withinTolerancePct(actual: number, expected: number, pct: number): boolean {
  if (expected === 0) return actual === 0;
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  return diffPct <= pct;
}

export async function matchInvoice(invoiceId: string): Promise<MatchResultPayload> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: true,
      po: { include: { lineItems: true } },
      org: true,
    },
  });
  if (!invoice) throw new Error("Invoice not found");

  const tolerance = await getTolerance(invoice.orgId);

  const toToleranceApplied = (t: { qty: number; price: number; amount: number }) => ({
    qtyTolerancePct: t.qty,
    priceTolerancePct: t.price,
    amountTolerancePct: t.amount,
  });

  if (invoice.type === "NON_PO_INVOICE") {
    const payload: MatchResultPayload = {
      matchType: "TWO_WAY",
      status: "NO_PO",
      diffs: [],
      toleranceApplied: toToleranceApplied(tolerance),
    };
    await upsertMatchResult(invoiceId, null, null, payload);
    return payload;
  }

  if (!invoice.poId || !invoice.po) {
    const payload: MatchResultPayload = {
      matchType: "TWO_WAY",
      status: "NO_PO",
      diffs: [{ lineIndex: 0, reason: "PO required for PO_INVOICE but not linked" }],
      toleranceApplied: toToleranceApplied(tolerance),
    };
    await upsertMatchResult(invoiceId, null, null, payload);
    return payload;
  }

  const po = invoice.po;
  const poLines = po.lineItems;

  // Get latest accepted/submitted GRN for this PO
  const grn = await prisma.goodsReceipt.findFirst({
    where: { poId: po.id, status: { in: ["SUBMITTED", "ACCEPTED"] } },
    include: { lineItems: true },
    orderBy: { receivedAt: "desc" },
  });

  if (!grn) {
    const payload: MatchResultPayload = {
      matchType: "THREE_WAY",
      status: "NO_RECEIPT",
      diffs: [{ lineIndex: 0, reason: "No goods receipt for PO" }],
      toleranceApplied: toToleranceApplied(tolerance),
    };
    await upsertMatchResult(invoiceId, po.id, null, payload);
    return payload;
  }

  const invLines = invoice.lineItems;
  const grnLines = grn.lineItems;
  const poLineMap = new Map(poLines.map((l) => [l.id, l]));
  const grnByPoLine = new Map(grnLines.map((g) => [g.poLineItemId, g.qtyReceived]));

  const diffs: MatchDiff[] = [];
  let hasMismatch = false;
  let hasPartial = false;

  for (let i = 0; i < invLines.length; i++) {
    const invLine = invLines[i];
    const poLine = invLine.poLineItemId ? poLineMap.get(invLine.poLineItemId) : poLines[i];
    const diff: MatchDiff = { lineIndex: i, description: invLine.description };

    if (!poLine) {
      diff.reason = "No matching PO line";
      diffs.push(diff);
      hasMismatch = true;
      continue;
    }

    diff.poLineItemId = poLine.id;
    diff.qtyOrdered = poLine.qtyOrdered;
    diff.qtyInvoiced = invLine.qty;
    diff.priceOrderedMinor = poLine.unitPriceMinor.toString();
    diff.priceInvoicedMinor = invLine.unitPriceMinor.toString();
    diff.amountOrderedMinor = (Number(poLine.totalMinor) * (invLine.qty / poLine.qtyOrdered || 1)).toString();
    diff.amountInvoicedMinor = invLine.totalMinor.toString();

    const qtyReceived = grnByPoLine.get(poLine.id) ?? 0;

    // Two-way: qty and price
    const qtyOk = withinTolerancePct(invLine.qty, poLine.qtyOrdered, tolerance.qty);
    const unitPriceExpected = Number(poLine.unitPriceMinor);
    const unitPriceActual = Number(invLine.unitPriceMinor);
    const priceOk = withinTolerancePct(unitPriceActual, unitPriceExpected, tolerance.price);
    const amountExpected = invLine.qty * unitPriceExpected;
    const amountActual = Number(invLine.totalMinor);
    const amountOk = withinTolerancePct(amountActual, amountExpected, tolerance.amount);

    diff.qtyReceived = qtyReceived;
    diff.qtyDiff = invLine.qty - poLine.qtyOrdered;
    if (unitPriceExpected > 0) {
      diff.priceDiffPct = Math.abs((unitPriceActual - unitPriceExpected) / unitPriceExpected) * 100;
    }
    if (amountExpected > 0) {
      diff.amountDiffPct = Math.abs((amountActual - amountExpected) / amountExpected) * 100;
    }

    if (!qtyOk || !priceOk || !amountOk) {
      hasMismatch = true;
      if (!qtyOk) diff.reason = `Qty diff beyond ${tolerance.qty}%`;
      else if (!priceOk) diff.reason = `Price diff beyond ${tolerance.price}%`;
      else diff.reason = `Amount diff beyond ${tolerance.amount}%`;
    }

    // Three-way: invoice qty vs received qty
    if (!withinTolerancePct(invLine.qty, qtyReceived, tolerance.qty)) {
      hasPartial = true;
      if (!diff.reason) diff.reason = `Invoiced qty (${invLine.qty}) vs received qty (${qtyReceived}) beyond ${tolerance.qty}%`;
    }

    diffs.push(diff);
  }

  const matchType: "TWO_WAY" | "THREE_WAY" = "THREE_WAY";
  let status: MatchResultPayload["status"] = "MATCHED";
  if (hasMismatch) status = "MISMATCH";
  else if (hasPartial) status = "PARTIAL";

  const payload: MatchResultPayload = {
    matchType,
    status,
    diffs,
    toleranceApplied: toToleranceApplied(tolerance),
  };

  await upsertMatchResult(invoiceId, po.id, grn.id, payload);
  return payload;
}

async function upsertMatchResult(
  invoiceId: string,
  poId: string | null,
  grnId: string | null,
  payload: MatchResultPayload
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { orgId: true } });
  if (!invoice) return;

  const diffsJson = payload.diffs as unknown as Prisma.InputJsonValue;
  const toleranceJson = payload.toleranceApplied as unknown as Prisma.InputJsonValue;

  await prisma.matchResult.upsert({
    where: { invoiceId },
    create: {
      orgId: invoice.orgId,
      invoiceId,
      poId,
      grnId,
      matchType: payload.matchType,
      status: payload.status,
      diffsJson,
      toleranceAppliedJson: toleranceJson,
    },
    update: {
      poId,
      grnId,
      matchType: payload.matchType,
      status: payload.status,
      diffsJson,
      toleranceAppliedJson: toleranceJson,
      computedAt: new Date(),
    },
  });

  // Set invoice status to EXCEPTION when mismatch beyond tolerance
  if (payload.status === "MISMATCH" || payload.status === "PARTIAL") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "EXCEPTION" },
    });
  }
}
