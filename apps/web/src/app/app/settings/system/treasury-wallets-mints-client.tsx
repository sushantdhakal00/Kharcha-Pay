"use client";

import { useState, useEffect, useCallback } from "react";

interface Wallet {
  id: string;
  name: string;
  type: string;
  chain: string;
  address: string;
  isActive: boolean;
  createdAt: string;
}

interface Mint {
  id: string;
  chain: string;
  symbol: string;
  mintAddress: string;
  decimals: number;
  isActive: boolean;
  createdAt: string;
}

interface SpendPolicyEffective {
  maxHotTransferMinor: string;
  requireApprovalOverMinor: string;
  dailyHotCapMinor: string;
}

const TYPE_LABELS: Record<string, string> = {
  HOT: "Hot",
  WARM: "Warm",
  OPERATIONAL: "Operational",
};

const TYPE_COLORS: Record<string, string> = {
  HOT: "bg-red-100 text-red-700",
  WARM: "bg-amber-100 text-amber-700",
  OPERATIONAL: "bg-blue-100 text-blue-700",
};

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function minorToMajor(minor: string): string {
  const n = Number(minor) / 100;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TreasuryWalletsMintsClient({ orgId }: { orgId: string }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [mints, setMints] = useState<Mint[]>([]);
  const [spendPolicy, setSpendPolicy] = useState<SpendPolicyEffective | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddWallet, setShowAddWallet] = useState(false);
  const [showAddMint, setShowAddMint] = useState(false);
  const [showEditPolicy, setShowEditPolicy] = useState(false);

  const [newWallet, setNewWallet] = useState({ name: "", type: "HOT", address: "" });
  const [newMint, setNewMint] = useState({ symbol: "", mintAddress: "", decimals: 6 });
  const [editPolicy, setEditPolicy] = useState({
    maxHotTransferMinor: "",
    requireApprovalOverMinor: "",
    dailyHotCapMinor: "",
  });

  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [wRes, mRes, spRes] = await Promise.all([
        fetch(`/api/orgs/${orgId}/treasury/wallets`),
        fetch(`/api/orgs/${orgId}/treasury/mints`),
        fetch(`/api/orgs/${orgId}/treasury/spend-policy`),
      ]);
      const [wJson, mJson, spJson] = await Promise.all([
        wRes.json(),
        mRes.json(),
        spRes.json(),
      ]);
      if (wRes.ok) setWallets(wJson.wallets ?? []);
      if (mRes.ok) setMints(mJson.mints ?? []);
      if (spRes.ok) setSpendPolicy(spJson.effective ?? null);
    } catch { /* ignore */ }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const getCsrfToken = () =>
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf_token="))
      ?.split("=")[1] ?? "";

  const addWallet = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/wallets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(newWallet),
      });
      if (res.ok) {
        setShowAddWallet(false);
        setNewWallet({ name: "", type: "HOT", address: "" });
        await fetchAll();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleWallet = async (id: string, isActive: boolean) => {
    await fetch(`/api/orgs/${orgId}/treasury/wallets/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({ isActive: !isActive }),
    });
    await fetchAll();
  };

  const addMint = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/mints`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(newMint),
      });
      if (res.ok) {
        setShowAddMint(false);
        setNewMint({ symbol: "", mintAddress: "", decimals: 6 });
        await fetchAll();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleMint = async (id: string, isActive: boolean) => {
    await fetch(`/api/orgs/${orgId}/treasury/mints/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({ isActive: !isActive }),
    });
    await fetchAll();
  };

  const savePolicy = async () => {
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      if (editPolicy.maxHotTransferMinor) body.maxHotTransferMinor = Number(editPolicy.maxHotTransferMinor);
      if (editPolicy.requireApprovalOverMinor) body.requireApprovalOverMinor = Number(editPolicy.requireApprovalOverMinor);
      if (editPolicy.dailyHotCapMinor) body.dailyHotCapMinor = Number(editPolicy.dailyHotCapMinor);

      const res = await fetch(`/api/orgs/${orgId}/treasury/spend-policy`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowEditPolicy(false);
        await fetchAll();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Loading wallets & mints...</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Wallets */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-slate-900">Treasury Wallets</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Multi-wallet management: hot, warm, and operational.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddWallet(!showAddWallet)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Add Wallet
          </button>
        </div>

        {showAddWallet && (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Name"
                value={newWallet.name}
                onChange={(e) => setNewWallet({ ...newWallet, name: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <select
                value={newWallet.type}
                onChange={(e) => setNewWallet({ ...newWallet, type: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="HOT">Hot</option>
                <option value="WARM">Warm</option>
                <option value="OPERATIONAL">Operational</option>
              </select>
              <input
                type="text"
                placeholder="Public Key Address"
                value={newWallet.address}
                onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addWallet}
                disabled={saving || !newWallet.name || !newWallet.address}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddWallet(false)}
                className="rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {wallets.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No wallets configured.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Address</th>
                  <th className="px-3 py-2 text-left font-medium">Chain</th>
                  <th className="px-3 py-2 text-center font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{w.name}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[w.type] ?? "bg-slate-100"}`}>
                        {TYPE_LABELS[w.type] ?? w.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600" title={w.address}>
                      {truncateAddr(w.address)}
                    </td>
                    <td className="px-3 py-2">{w.chain}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleWallet(w.id, w.isActive)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${w.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {w.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mints */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-slate-900">Mint Registry</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Registered token mints for on-chain funding and reconciliation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMint(!showAddMint)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Add Mint
          </button>
        </div>

        {showAddMint && (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Symbol (e.g. USDC)"
                value={newMint.symbol}
                onChange={(e) => setNewMint({ ...newMint, symbol: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Mint Address"
                value={newMint.mintAddress}
                onChange={(e) => setNewMint({ ...newMint, mintAddress: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                placeholder="Decimals"
                value={newMint.decimals}
                onChange={(e) => setNewMint({ ...newMint, decimals: Number(e.target.value) })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addMint}
                disabled={saving || !newMint.symbol || !newMint.mintAddress}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddMint(false)}
                className="rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mints.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No mints registered.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium">Mint Address</th>
                  <th className="px-3 py-2 text-right font-medium">Decimals</th>
                  <th className="px-3 py-2 text-left font-medium">Chain</th>
                  <th className="px-3 py-2 text-center font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {mints.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{m.symbol}</td>
                    <td className="px-3 py-2 font-mono text-slate-600" title={m.mintAddress}>
                      {truncateAddr(m.mintAddress)}
                    </td>
                    <td className="px-3 py-2 text-right">{m.decimals}</td>
                    <td className="px-3 py-2">{m.chain}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleMint(m.id, m.isActive)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${m.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {m.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Spend Policy */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-slate-900">On-Chain Spend Policy</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Per-wallet spend caps and approval thresholds for on-chain transfers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (spendPolicy) {
                setEditPolicy({
                  maxHotTransferMinor: spendPolicy.maxHotTransferMinor,
                  requireApprovalOverMinor: spendPolicy.requireApprovalOverMinor,
                  dailyHotCapMinor: spendPolicy.dailyHotCapMinor,
                });
              }
              setShowEditPolicy(!showEditPolicy);
            }}
            className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
          >
            Edit
          </button>
        </div>

        {spendPolicy && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-slate-500">Max Hot Transfer</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 font-mono">
                ${minorToMajor(spendPolicy.maxHotTransferMinor)}
              </p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium text-slate-500">Approval Threshold</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 font-mono">
                ${minorToMajor(spendPolicy.requireApprovalOverMinor)}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-slate-500">Daily Hot Cap</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 font-mono">
                ${minorToMajor(spendPolicy.dailyHotCapMinor)}
              </p>
            </div>
          </div>
        )}

        {showEditPolicy && (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max Hot Transfer (minor)</label>
                <input
                  type="number"
                  value={editPolicy.maxHotTransferMinor}
                  onChange={(e) => setEditPolicy({ ...editPolicy, maxHotTransferMinor: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Approval Over (minor)</label>
                <input
                  type="number"
                  value={editPolicy.requireApprovalOverMinor}
                  onChange={(e) => setEditPolicy({ ...editPolicy, requireApprovalOverMinor: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Daily Hot Cap (minor)</label>
                <input
                  type="number"
                  value={editPolicy.dailyHotCapMinor}
                  onChange={(e) => setEditPolicy({ ...editPolicy, dailyHotCapMinor: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={savePolicy}
                disabled={saving}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Policy"}
              </button>
              <button
                type="button"
                onClick={() => setShowEditPolicy(false)}
                className="rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
