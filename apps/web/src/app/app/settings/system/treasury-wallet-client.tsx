"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface TreasuryData {
  orgId: string;
  chain: string;
  cluster: string;
  treasuryPubkey: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface TreasuryBalance {
  orgId: string;
  cluster: string;
  treasuryPubkey: string;
  solLamports: string;
  sol: string;
  tokens: Array<{
    program: "token" | "token2022";
    mint: string;
    ata: string;
    amountRaw: string;
    decimals: number;
    amount: string;
  }>;
  fetchedAt: string;
}

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

interface DepositResult {
  intentId: string;
  status: string;
  currency: string;
  amount: number;
  hostedUrl?: string;
  fundingInstructions?: unknown;
}

interface DepositIntentRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  reconciledTxSig?: string | null;
  reconciledTokenMint?: string | null;
  reconciledAt?: string | null;
  reconciliationNote?: string | null;
}

interface FundingSummary {
  currency: string;
  incomingAmount: string;
  available: {
    sol: string;
    tokens: Array<{ mint: string; program: string; amount: string }>;
  };
  reservedAmount?: string;
}

const STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  RECONCILED: "bg-emerald-100 text-emerald-800",
};

export function TreasuryWalletClient({ orgId }: { orgId: string }) {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [balances, setBalances] = useState<TreasuryBalance | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const [recentIntents, setRecentIntents] = useState<DepositIntentRow[]>([]);
  const [summary, setSummary] = useState<FundingSummary | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const fetchTreasury = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [treasuryRes, balancesRes, depositsRes, summaryRes] = await Promise.all([
        fetch(`/api/orgs/${orgId}/treasury`),
        fetch(`/api/orgs/${orgId}/treasury/balances`),
        fetch(`/api/orgs/${orgId}/treasury/deposits`),
        fetch(`/api/orgs/${orgId}/treasury/summary`),
      ]);
      const treasuryJson = await treasuryRes.json();
      if (!treasuryRes.ok) {
        setError(treasuryJson.error ?? "Failed to load treasury");
        return;
      }
      setData(treasuryJson);

      const balancesJson = await balancesRes.json();
      if (balancesRes.ok) {
        setBalances(balancesJson);
      }

      const depositsJson = await depositsRes.json();
      if (depositsRes.ok && Array.isArray(depositsJson.intents)) {
        setRecentIntents(depositsJson.intents);
      }

      const summaryJson = await summaryRes.json();
      if (summaryRes.ok && summaryJson.currency) {
        setSummary(summaryJson);
      }
    } catch {
      setError("Failed to load treasury");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchTreasury();
  }, [fetchTreasury]);

  async function handleAddFunds(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setDepositSubmitting(true);
    setError("");
    setDepositResult(null);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/treasury/deposits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "USD" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create deposit intent");
        return;
      }
      setDepositResult(json);
    } catch {
      setError("Failed to create deposit intent");
    } finally {
      setDepositSubmitting(false);
    }
  }

  async function handleReconcile(intentId: string) {
    setReconcilingId(intentId);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/treasury/deposits/${intentId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchTreasury();
      }
    } catch {
      // ignore
    } finally {
      setReconcilingId(null);
    }
  }

  function closeAddFunds() {
    setAddFundsOpen(false);
    setDepositAmount("");
    setDepositResult(null);
  }

  async function handleRotate() {
    setRotating(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/treasury/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to rotate");
        return;
      }
      setData(json);
      await fetchTreasury();
    } catch {
      setError("Failed to rotate");
    } finally {
      setRotating(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;
  if (error && !data)
    return <p className="mt-4 text-sm text-red-600">{error}</p>;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Treasury Wallet</h2>
      <p className="mt-1 text-sm text-slate-600">
        Organization custody wallet (custodial MVP). Public key and cluster only.
      </p>
      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Available (SOL)</p>
            <p className="mt-1 text-lg font-semibold font-mono text-slate-900">{summary.available.sol}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Incoming Deposits ({summary.currency})</p>
            <p className="mt-1 text-lg font-semibold font-mono text-amber-900">{summary.incomingAmount}</p>
          </div>
          {summary.reservedAmount && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">Reserved for Approved Payments</p>
              <p className="mt-1 text-lg font-semibold font-mono text-blue-900">{summary.reservedAmount}</p>
            </div>
          )}
        </div>
      )}
      {data && (
        <div className="mt-3 space-y-2 text-sm">
          <div>
            <span className="text-slate-500">Public Key: </span>
            <span className="font-mono break-all">{data.treasuryPubkey}</span>
          </div>
          <div>
            <span className="text-slate-500">Cluster: </span>
            <span className="font-mono">{data.cluster}</span>
          </div>
          <div>
            <span className="text-slate-500">Key Version: </span>
            <span>{data.keyVersion}</span>
          </div>
          {balances && (
            <>
              <div className="mt-3 pt-2 border-t border-slate-200">
                <span className="text-slate-500">SOL Balance: </span>
                <span className="font-mono font-medium">{balances.sol} SOL</span>
              </div>
              {balances.tokens.length > 0 && (
                <div className="mt-2">
                  <p className="text-slate-500 mb-1">Token Balances</p>
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-2 py-1 text-left font-medium">Mint</th>
                          <th className="px-2 py-1 text-left font-medium">Program</th>
                          <th className="px-2 py-1 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balances.tokens.map((t) => (
                          <tr key={t.ata} className="border-t border-slate-100">
                            <td className="px-2 py-1 font-mono">{shortenPubkey(t.mint)}</td>
                            <td className="px-2 py-1">{t.program}</td>
                            <td className="px-2 py-1 text-right font-mono">{t.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAddFundsOpen(true)}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add Funds
        </button>
        <button
          type="button"
          onClick={handleRotate}
          disabled={rotating}
          className="rounded bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50"
        >
          {rotating ? "Rotating…" : "Rotate Treasury (dev/demo)"}
        </button>
      </div>
      {addFundsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-lg max-w-md w-full mx-4">
            <h3 className="font-medium text-slate-900">Add Funds</h3>
            {!depositResult ? (
              <form onSubmit={handleAddFunds} className="mt-3 space-y-3">
                <div>
                  <label htmlFor="deposit-amount" className="block text-sm text-slate-600">
                    Amount (USD)
                  </label>
                  <input
                    id="deposit-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="100.00"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={closeAddFunds}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={depositSubmitting}
                    className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {depositSubmitting ? "Creating…" : "Create"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <p>
                  Deposit intent created: {depositResult.amount} {depositResult.currency}
                </p>
                <p>
                  Status:{" "}
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[depositResult.status] ?? "bg-slate-100 text-slate-700"}`}>
                    {depositResult.status}
                  </span>
                </p>
                {depositResult.hostedUrl ? (
                  <a
                    href={String(depositResult.hostedUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800"
                  >
                    Continue to bank transfer
                  </a>
                ) : depositResult.fundingInstructions ? (
                  <div className="rounded border border-slate-200 bg-slate-50 p-2 overflow-auto max-h-48">
                    <pre className="text-xs whitespace-pre-wrap">
                      {JSON.stringify(depositResult.fundingInstructions, null, 2)}
                    </pre>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={closeAddFunds}
                  className="block rounded border border-slate-300 px-3 py-1.5 text-sm"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {recentIntents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-2">Recent Deposit Intents</p>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-2 py-1 text-left font-medium">Amount</th>
                  <th className="px-2 py-1 text-left font-medium">Currency</th>
                  <th className="px-2 py-1 text-left font-medium">Status</th>
                  <th className="px-2 py-1 text-left font-medium">Reconciled</th>
                  <th className="px-2 py-1 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentIntents.map((intent) => (
                  <tr key={intent.id} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-mono">{intent.amount.toFixed(2)}</td>
                    <td className="px-2 py-1">{intent.currency}</td>
                    <td className="px-2 py-1">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[intent.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {intent.status}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      {intent.reconciledTxSig ? (
                        <span className="font-mono text-emerald-700" title={intent.reconciledTxSig}>
                          {shortenPubkey(intent.reconciledTxSig)}
                        </span>
                      ) : intent.status === "COMPLETED" ? (
                        <button
                          type="button"
                          disabled={reconcilingId === intent.id}
                          onClick={() => handleReconcile(intent.id)}
                          className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                        >
                          {reconcilingId === intent.id ? "…" : "Reconcile"}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1">{new Date(intent.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
