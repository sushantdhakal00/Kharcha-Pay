"use client";

import { useState, useEffect } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

interface Policy {
  requireReceiptForPayment: boolean;
  receiptRequiredAboveMinor: string;
  blockOverBudget: boolean;
  allowAdminOverrideOverBudget: boolean;
  updatedAt?: string;
}

export function SpendPolicyClient({ orgId }: { orgId: string }) {
  const reauth = useReauth();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [requireReceiptForPayment, setRequireReceiptForPayment] = useState(true);
  const [receiptRequiredAboveMinor, setReceiptRequiredAboveMinor] = useState("0");
  const [blockOverBudget, setBlockOverBudget] = useState(true);
  const [allowAdminOverrideOverBudget, setAllowAdminOverrideOverBudget] = useState(false);

  useEffect(() => {
    fetch(`/api/orgs/${orgId}/spend-policy`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          const p = data.policy;
          setPolicy(p);
          setRequireReceiptForPayment(p.requireReceiptForPayment ?? true);
          setReceiptRequiredAboveMinor(String(p.receiptRequiredAboveMinor ?? "0"));
          setBlockOverBudget(p.blockOverBudget ?? true);
          setAllowAdminOverrideOverBudget(p.allowAdminOverrideOverBudget ?? false);
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const receiptMinor = parseInt(receiptRequiredAboveMinor, 10);
    if (isNaN(receiptMinor) || receiptMinor < 0) {
      setError("Receipt threshold must be >= 0");
      setSaving(false);
      return;
    }
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/spend-policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireReceiptForPayment,
          receiptRequiredAboveMinor: receiptMinor,
          blockOverBudget,
          allowAdminOverrideOverBudget,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(() => Promise.resolve());
          return;
        }
        setError(data.error ?? "Failed to save");
        return;
      }
      setPolicy(data.policy);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  return (
    <form onSubmit={handleSave} className="mt-6 max-w-lg space-y-6 rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Require receipt before payment</label>
        <input
          type="checkbox"
          checked={requireReceiptForPayment}
          onChange={(e) => setRequireReceiptForPayment(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Receipt required above (minor units)</label>
        <input
          type="number"
          min={0}
          value={receiptRequiredAboveMinor}
          onChange={(e) => setReceiptRequiredAboveMinor(e.target.value)}
          className="mt-1 w-40 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">If amount ≥ this, at least one receipt is required.</p>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Block payment when over budget</label>
        <input
          type="checkbox"
          checked={blockOverBudget}
          onChange={(e) => setBlockOverBudget(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Allow admin override when over budget</label>
        <input
          type="checkbox"
          checked={allowAdminOverrideOverBudget}
          onChange={(e) => setAllowAdminOverrideOverBudget(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
      </div>
      <p className="text-xs text-slate-500">
        If allowed, ADMIN can pay with an override note (min 5 chars); the override is audited.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
