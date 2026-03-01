/**
 * Memoized selectors for invoice inbox (performance).
 * Use with useMemo on the client when computing from raw invoice list.
 */

export interface InvoiceSummary {
  id: string;
  status: string;
  matchStatus: string | null;
  glCode: string | null;
  totalMinor: string;
  submittedAt: string | null;
  type: string;
}

export function inboxCountsByFilter(invoices: InvoiceSummary[]): {
  needsVerification: number;
  exceptions: number;
  overdue: number;
  noReceipt: number;
  uncoded: number;
} {
  const now = Date.now();
  const OVERDUE_DAYS = 5;
  const overdueCutoff = now - OVERDUE_DAYS * 24 * 60 * 60 * 1000;

  let needsVerification = 0;
  let exceptions = 0;
  let overdue = 0;
  let noReceipt = 0;
  let uncoded = 0;

  for (const inv of invoices) {
    if (inv.status === "NEEDS_VERIFICATION") needsVerification++;
    if (inv.status === "EXCEPTION") exceptions++;
    if (inv.submittedAt) {
      const sub = new Date(inv.submittedAt).getTime();
      if (sub <= overdueCutoff && ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"].includes(inv.status)) {
        overdue++;
      }
    }
    if (inv.type === "PO_INVOICE" && inv.matchStatus === "NO_RECEIPT") noReceipt++;
    if (!inv.glCode && ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"].includes(inv.status)) uncoded++;
  }

  return { needsVerification, exceptions, overdue, noReceipt, uncoded };
}

export function overdueInvoices(
  invoices: InvoiceSummary[],
  overdueDays = 5
): InvoiceSummary[] {
  const cutoff = Date.now() - overdueDays * 24 * 60 * 60 * 1000;
  return invoices.filter((inv) => {
    if (!inv.submittedAt) return false;
    const sub = new Date(inv.submittedAt).getTime();
    return sub <= cutoff && ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"].includes(inv.status);
  });
}

export function uncodedInvoices(invoices: InvoiceSummary[]): InvoiceSummary[] {
  return invoices.filter(
    (inv) =>
      !inv.glCode && ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"].includes(inv.status)
  );
}
