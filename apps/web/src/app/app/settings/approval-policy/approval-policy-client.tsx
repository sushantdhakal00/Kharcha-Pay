"use client";

import { useState, useEffect } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

interface Tier {
  id: string;
  minAmountMinor: string;
  requiredApprovals: number;
}

export function ApprovalPolicyClient({ orgId }: { orgId: string }) {
  const reauth = useReauth();
  const [tier1, setTier1] = useState({ minAmountMinor: "0", requiredApprovals: 1 });
  const [tier2, setTier2] = useState({ minAmountMinor: "100000", requiredApprovals: 2 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgId}/approval-policy`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tiers?.length >= 2) {
          const [t1, t2] = data.tiers as Tier[];
          setTier1({
            minAmountMinor: t1.minAmountMinor,
            requiredApprovals: t1.requiredApprovals,
          });
          setTier2({
            minAmountMinor: t2.minAmountMinor,
            requiredApprovals: t2.requiredApprovals,
          });
        }
      })
      .catch(() => setError("Failed to load policy"))
      .finally(() => setLoading(false));
  }, [orgId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    const min1 = Number(tier1.minAmountMinor);
    const min2 = Number(tier2.minAmountMinor);
    if (min1 > min2) {
      setError("Tier 1 amount must be ≤ Tier 2 amount");
      setSaving(false);
      return;
    }
    fetchWithCsrf(`/api/orgs/${orgId}/approval-policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tiers: [
          { minAmountMinor: tier1.minAmountMinor, requiredApprovals: tier1.requiredApprovals },
          { minAmountMinor: tier2.minAmountMinor, requiredApprovals: tier2.requiredApprovals },
        ],
      }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          if (data.code === "REAUTH_REQUIRED" && reauth) {
            reauth.showReauth(() => handleSubmit(e));
            return;
          }
          setError(data.error ?? "Failed to save");
          return;
        }
        setSuccess("Policy saved.");
      })
      .catch(() => setError("Failed to save"))
      .finally(() => setSaving(false));
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  return (
    <div className="mt-6 max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <h2 className="text-sm font-medium text-slate-800">Tier 1 – Under this amount</h2>
          <p className="mt-1 text-xs text-slate-500">Amounts below Tier 2 threshold use this tier.</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Min amount (minor units)</span>
              <input
                type="text"
                value={tier1.minAmountMinor}
                onChange={(e) => setTier1((t) => ({ ...t, minAmountMinor: e.target.value }))}
                className="rounded border border-slate-300 px-3 py-2 font-mono"
                placeholder="0"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Required approvals</span>
              <input
                type="number"
                min={1}
                max={5}
                value={tier1.requiredApprovals}
                onChange={(e) =>
                  setTier1((t) => ({ ...t, requiredApprovals: parseInt(e.target.value, 10) || 1 }))
                }
                className="w-20 rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-slate-800">Tier 2 – This amount and above</h2>
          <p className="mt-1 text-xs text-slate-500">Amounts ≥ this threshold require more approvers.</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Min amount (minor units)</span>
              <input
                type="text"
                value={tier2.minAmountMinor}
                onChange={(e) => setTier2((t) => ({ ...t, minAmountMinor: e.target.value }))}
                className="rounded border border-slate-300 px-3 py-2 font-mono"
                placeholder="100000"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Required approvals</span>
              <input
                type="number"
                min={1}
                max={5}
                value={tier2.requiredApprovals}
                onChange={(e) =>
                  setTier2((t) => ({ ...t, requiredApprovals: parseInt(e.target.value, 10) || 1 }))
                }
                className="w-20 rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
      </form>
    </div>
  );
}
