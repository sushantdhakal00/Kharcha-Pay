"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

const EXPLORER = "https://explorer.solana.com";
const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

function explorerUrl(signature: string): string {
  if (!signature || signature === "created-or-exists" || signature === "created") return "";
  return `${EXPLORER}/tx/${signature}?cluster=${cluster}`;
}

interface Status {
  configured: boolean;
  cluster?: string;
  rpcUrl?: string | null;
  token2022Mint?: string | null;
  tokenProgramId?: string;
  treasuryOwnerPubkey?: string;
  treasuryTokenAccount?: string | null;
  vendorOwnerPubkey?: string | null;
  vendorTokenAccount?: string | null;
  auditorElgamalPubkey?: string | null;
  balances?: { treasuryPublic: string; vendorPublic: string };
  lastTx?: {
    initMint?: string | null;
    initAccounts?: string | null;
    mintTo?: string | null;
    deposit?: string | null;
    applyPending?: string | null;
    ctTransfer?: string | null;
    withdraw?: string | null;
  };
}

export function ConfidentialDemoClient({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountMinor, setAmountMinor] = useState("1000000");
  const [applyAccount, setApplyAccount] = useState<"treasury" | "vendor">("treasury");
  const [withAuditor, setWithAuditor] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgId}/chain/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStatus(data);
      })
      .catch(() => setError("Failed to load status"))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function action(
    name: string,
    url: string,
    body?: object
  ): Promise<{ txSignature?: string; error?: string }> {
    setActionLoading(name);
    setError("");
    try {
      const res = await fetchWithCsrf(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return { error: data.error };
      }
      fetchStatus();
      return { txSignature: data.txSignature, error: data.error };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return { error: "Request failed" };
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading status…</p>;

  const amount = amountMinor.trim();
  const last = status?.lastTx;

  return (
    <div className="mt-6 space-y-6">
      {status?.configured && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-medium text-slate-900">Chain config</h2>
          <dl className="mt-2 grid gap-1">
            <div><dt className="text-slate-500">Cluster</dt><dd>{status.cluster}</dd></div>
            <div><dt className="text-slate-500">Mint</dt><dd className="break-all font-mono">{status.token2022Mint ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Treasury ATA</dt><dd className="break-all font-mono">{status.treasuryTokenAccount ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Vendor ATA</dt><dd className="break-all font-mono">{status.vendorTokenAccount ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Treasury balance (public)</dt><dd>{status.balances?.treasuryPublic ?? "0"}</dd></div>
            <div><dt className="text-slate-500">Vendor balance (public)</dt><dd>{status.balances?.vendorPublic ?? "0"}</dd></div>
          </dl>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">Amount (minor units)</label>
        <input
          type="text"
          value={amountMinor}
          onChange={(e) => setAmountMinor(e.target.value)}
          className="mt-1 w-48 rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={!!actionLoading}
          onClick={() => action("init-mint", `/api/orgs/${orgId}/chain/init-mint`, { withAuditor })}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {actionLoading === "init-mint" ? "…" : "Create mint (CT enabled)"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withAuditor} onChange={(e) => setWithAuditor(e.target.checked)} />
          Enable auditor key
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!!actionLoading}
          onClick={() => action("init-accounts", `/api/orgs/${orgId}/chain/init-accounts`)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading === "init-accounts" ? "…" : "Create token accounts"}
        </button>
        <button
          disabled={!!actionLoading || !amount}
          onClick={() => action("mint-to-treasury", `/api/orgs/${orgId}/chain/mint-to-treasury`, { amountMinor: Number(amount) })}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading === "mint-to-treasury" ? "…" : "Mint tokens"}
        </button>
        <button
          disabled={!!actionLoading || !amount}
          onClick={() => action("deposit", `/api/orgs/${orgId}/chain/deposit`, { amountMinor: Number(amount) })}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading === "deposit" ? "…" : "Deposit"}
        </button>
        <select
          value={applyAccount}
          onChange={(e) => setApplyAccount(e.target.value as "treasury" | "vendor")}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="treasury">Treasury</option>
          <option value="vendor">Vendor</option>
        </select>
        <button
          disabled={!!actionLoading}
          onClick={() => action("apply-pending", `/api/orgs/${orgId}/chain/apply-pending`, { account: applyAccount })}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading === "apply-pending" ? "…" : "Apply pending"}
        </button>
        <button
          disabled={!!actionLoading || !amount}
          onClick={() => action("ct-transfer", `/api/orgs/${orgId}/chain/ct-transfer`, { amountMinor: Number(amount) })}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading === "ct-transfer" ? "…" : "Confidential transfer"}
        </button>
        <button
          disabled={!!actionLoading || !amount}
          onClick={() => action("withdraw", `/api/orgs/${orgId}/chain/withdraw`, { amountMinor: Number(amount) })}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading === "withdraw" ? "…" : "Withdraw"}
        </button>
      </div>

      {last && (last.initMint || last.initAccounts || last.mintTo) && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-medium text-slate-900">Last tx signatures</h2>
          <ul className="mt-2 space-y-1">
            {last.initMint && (
              <li>Init mint: {explorerUrl(last.initMint) ? <a href={explorerUrl(last.initMint)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{last.initMint.slice(0, 16)}…</a> : last.initMint}</li>
            )}
            {last.initAccounts && (
              <li>Init accounts: {explorerUrl(last.initAccounts) ? <a href={explorerUrl(last.initAccounts)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{last.initAccounts.slice(0, 16)}…</a> : last.initAccounts}</li>
            )}
            {last.mintTo && (
              <li>Mint to treasury: {explorerUrl(last.mintTo) ? <a href={explorerUrl(last.mintTo)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{last.mintTo.slice(0, 16)}…</a> : last.mintTo}</li>
            )}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
