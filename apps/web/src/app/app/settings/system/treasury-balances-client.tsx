"use client";

import { useState, useEffect, useCallback } from "react";
import { useTreasuryStream, type TreasuryStreamEvent } from "./use-treasury-stream";

interface BalanceRow {
  account: string;
  currency: string;
  balanceMinor: string;
  balanceMajor: string;
  asOf: string;
}

interface DriftRow {
  account: string;
  currency: string;
  source: string;
  expectedMinor: string;
  observedMinor: string;
  deltaMinor: string;
  severity: string;
  reason: string;
}

const ACCOUNT_LABELS: Record<string, string> = {
  TREASURY_WALLET: "Treasury Wallet",
  PROVIDER_WALLET: "Provider Wallet",
  VENDOR_PAYABLE: "Vendor Payable",
  CLEARING: "Clearing",
  FEES_EXPENSE: "Fees Expense",
  SUSPENSE: "Suspense",
};

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-green-100 text-green-700",
  WARN: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-700",
};

const BALANCE_COLORS: Record<string, string> = {
  TREASURY_WALLET: "border-indigo-200 bg-indigo-50",
  PROVIDER_WALLET: "border-purple-200 bg-purple-50",
  VENDOR_PAYABLE: "border-amber-200 bg-amber-50",
  CLEARING: "border-cyan-200 bg-cyan-50",
  FEES_EXPENSE: "border-red-200 bg-red-50",
  SUSPENSE: "border-slate-200 bg-slate-50",
};

export function TreasuryBalancesClient({ orgId }: { orgId: string }) {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [balanceSource, setBalanceSource] = useState<string>("");
  const [balanceAsOf, setBalanceAsOf] = useState<string>("");
  const [loadingBal, setLoadingBal] = useState(true);

  const [hasCheck, setHasCheck] = useState(false);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [maxSeverity, setMaxSeverity] = useState<string | null>(null);
  const [topDrifts, setTopDrifts] = useState<DriftRow[]>([]);
  const [loadingRecon, setLoadingRecon] = useState(true);

  const fetchBalances = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/ledger-balances`);
      const json = await res.json();
      if (res.ok) {
        setBalances(json.balances ?? []);
        setBalanceSource(json.source ?? "");
        setBalanceAsOf(json.asOf ?? "");
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const fetchReconciliation = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/treasury/reconciliation/latest`
      );
      const json = await res.json();
      if (res.ok) {
        setHasCheck(json.hasCheck ?? false);
        setLastCheckAt(json.lastCheckAt ?? null);
        setMaxSeverity(json.maxSeverity ?? null);
        setTopDrifts(json.topDrifts ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const handleStreamEvent = useCallback(
    (event: TreasuryStreamEvent) => {
      if (
        event.type === "BALANCE_SNAPSHOT_WRITTEN" ||
        event.type === "RECONCILIATION_DRIFT_DETECTED"
      ) {
        fetchBalances();
        fetchReconciliation();
      }
    },
    [fetchBalances, fetchReconciliation]
  );

  useTreasuryStream(orgId, handleStreamEvent);

  useEffect(() => {
    setLoadingBal(true);
    setLoadingRecon(true);
    Promise.all([fetchBalances(), fetchReconciliation()]).finally(() => {
      setLoadingBal(false);
      setLoadingRecon(false);
    });
  }, [fetchBalances, fetchReconciliation]);

  return (
    <div className="mt-4 space-y-4">
      {/* Balances Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-slate-900">Treasury Balances</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Ledger-derived balances per account.
              {balanceSource && (
                <span className="ml-1 text-xs text-slate-400">
                  ({balanceSource}
                  {balanceAsOf &&
                    ` as of ${new Date(balanceAsOf).toLocaleString()}`}
                  )
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoadingBal(true);
              fetchBalances().finally(() => setLoadingBal(false));
            }}
            className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
          >
            Refresh
          </button>
        </div>

        {loadingBal ? (
          <p className="mt-3 text-sm text-slate-500">Loading balances...</p>
        ) : balances.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No ledger entries yet.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {balances.map((b) => (
              <div
                key={`${b.account}-${b.currency}`}
                className={`rounded-lg border p-3 ${BALANCE_COLORS[b.account] ?? "border-slate-200 bg-slate-50"}`}
              >
                <p className="text-xs font-medium text-slate-500">
                  {ACCOUNT_LABELS[b.account] ?? b.account}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 font-mono">
                  {b.balanceMajor}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {b.currency}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reconciliation Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-slate-900">Reconciliation</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Compare ledger vs provider/on-chain balances.
            </p>
          </div>
          {maxSeverity && (
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[maxSeverity] ?? "bg-slate-100 text-slate-700"}`}
            >
              {maxSeverity}
            </span>
          )}
        </div>

        {loadingRecon ? (
          <p className="mt-3 text-sm text-slate-500">Loading...</p>
        ) : !hasCheck ? (
          <p className="mt-3 text-sm text-slate-500">
            No reconciliation checks yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-500">
              Last check:{" "}
              {lastCheckAt
                ? new Date(lastCheckAt).toLocaleString()
                : "—"}
            </p>

            {topDrifts.length === 0 ? (
              <p className="text-sm text-green-700">
                All balances in sync.
              </p>
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-2 py-1.5 text-left font-medium">
                        Account
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Currency
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Source
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        Delta
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">
                        Severity
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDrifts.map((d, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">
                          {ACCOUNT_LABELS[d.account] ?? d.account}
                        </td>
                        <td className="px-2 py-1.5">{d.currency}</td>
                        <td className="px-2 py-1.5">{d.source}</td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {(Number(d.deltaMinor) / 100).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_COLORS[d.severity] ?? "bg-slate-100"}`}
                          >
                            {d.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
