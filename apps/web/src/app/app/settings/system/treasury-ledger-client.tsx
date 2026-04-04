"use client";

import { useState, useEffect, useCallback } from "react";
import { useTreasuryStream, type TreasuryStreamEvent } from "./use-treasury-stream";

interface LedgerEntry {
  id: string;
  type: string;
  account: string;
  direction: string;
  amount: number;
  amountMinor: number;
  currency: string;
  intentId: string | null;
  provider: string | null;
  payoutRail: string | null;
  externalRef: string | null;
  createdAt: string;
}

interface LedgerSummary {
  outstandingVendorPayable: number;
  inFlightClearing: number;
  fees30d: number;
}

const ACCOUNT_OPTIONS = [
  { value: "", label: "All accounts" },
  { value: "TREASURY_WALLET", label: "Treasury Wallet" },
  { value: "PROVIDER_WALLET", label: "Provider Wallet" },
  { value: "VENDOR_PAYABLE", label: "Vendor Payable" },
  { value: "FEES_EXPENSE", label: "Fees Expense" },
  { value: "CLEARING", label: "Clearing" },
  { value: "SUSPENSE", label: "Suspense" },
] as const;

const ACCOUNT_COLORS: Record<string, string> = {
  TREASURY_WALLET: "bg-emerald-50 text-emerald-700",
  PROVIDER_WALLET: "bg-purple-50 text-purple-700",
  VENDOR_PAYABLE: "bg-amber-50 text-amber-700",
  FEES_EXPENSE: "bg-red-50 text-red-700",
  CLEARING: "bg-blue-50 text-blue-700",
  SUSPENSE: "bg-gray-100 text-gray-600",
};

const TYPE_LABELS: Record<string, string> = {
  PAYOUT_CREATED: "Created",
  PAYOUT_FUNDED_ONCHAIN: "Funded",
  PAYOUT_PROVIDER_SUBMITTED: "Submitted",
  PAYOUT_COMPLETED: "Completed",
  PAYOUT_FAILED: "Failed",
  PAYOUT_CANCELED: "Canceled",
  FEE_ASSESSED: "Fee",
  FX_CONVERSION: "FX",
};

function shortenId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function TreasuryLedgerClient({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      const qs = accountFilter ? `?account=${accountFilter}&limit=50` : "?limit=50";
      const res = await fetch(`/api/orgs/${orgId}/treasury/ledger${qs}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.entries)) {
        setEntries(json.entries);
      }
    } catch {
      /* ignore */
    }
  }, [orgId, accountFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/ledger/summary`);
      const json = await res.json();
      if (res.ok) {
        setSummary(json);
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const handleStreamEvent = useCallback(
    (event: TreasuryStreamEvent) => {
      const ledgerEvents = [
        "LEDGER_ENTRY_WRITTEN",
        "PAYOUT_COMPLETED",
        "PAYOUT_FAILED",
        "PAYOUT_CREATED",
      ];
      if (ledgerEvents.includes(event.type)) {
        fetchEntries();
        fetchSummary();
      }
    },
    [fetchEntries, fetchSummary]
  );

  useTreasuryStream(orgId, handleStreamEvent);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEntries(), fetchSummary()]).finally(() => setLoading(false));
  }, [fetchEntries, fetchSummary]);

  if (loading) return <p className="mt-4 text-sm text-slate-500">Loading ledger…</p>;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-slate-900">Treasury Ledger</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Double-entry accounting entries for payouts.
          </p>
        </div>
      </div>

      {summary && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Outstanding Payable</p>
            <p className="text-lg font-semibold text-amber-700">
              ${summary.outstandingVendorPayable.toFixed(2)}
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="text-xs text-slate-500">In-Flight (Clearing)</p>
            <p className="text-lg font-semibold text-blue-700">
              ${summary.inFlightClearing.toFixed(2)}
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Fees (30d)</p>
            <p className="text-lg font-semibold text-red-700">
              ${summary.fees30d.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3">
        <label htmlFor="ledger-account-filter" className="text-sm text-slate-600">
          Filter by account
        </label>
        <select
          id="ledger-account-filter"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {ACCOUNT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {entries.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-2 py-1.5 text-left font-medium">Time</th>
                <th className="px-2 py-1.5 text-left font-medium">Type</th>
                <th className="px-2 py-1.5 text-left font-medium">Account</th>
                <th className="px-2 py-1.5 text-left font-medium">D/C</th>
                <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                <th className="px-2 py-1.5 text-left font-medium">Intent</th>
                <th className="px-2 py-1.5 text-left font-medium">Ext Ref</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      {TYPE_LABELS[e.type] ?? e.type}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${ACCOUNT_COLORS[e.account] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {e.account}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                        e.direction === "DEBIT"
                          ? "bg-orange-50 text-orange-700"
                          : "bg-teal-50 text-teal-700"
                      }`}
                    >
                      {e.direction === "DEBIT" ? "DR" : "CR"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {e.amount.toFixed(2)} {e.currency}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-slate-500">
                    {e.intentId ? shortenId(e.intentId) : "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-slate-500">
                    {e.externalRef ? shortenId(e.externalRef) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && !loading && (
        <p className="mt-3 text-sm text-slate-500">No ledger entries yet.</p>
      )}
    </div>
  );
}
