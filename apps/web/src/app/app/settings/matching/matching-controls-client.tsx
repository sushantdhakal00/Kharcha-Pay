"use client";

import { useState, useEffect } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

export function MatchingControlsClient({ orgId, isAdmin }: { orgId: string; isAdmin?: boolean }) {
  const reauth = useReauth();
  const [tolerance, setTolerance] = useState({ qtyTolerancePct: 2, priceTolerancePct: 1, amountTolerancePct: 1 });
  const [vendorPolicy, setVendorPolicy] = useState({
    requireDualApprovalForBankChanges: true,
    requireVendorDocsBeforeActivation: true,
    allowApproverToActivateVendor: true,
  });
  const [policy, setPolicy] = useState({
    requirePoAboveAmountMinor: "0",
    requireAttachmentOnSubmit: true,
    allowApproverOverrideOnMismatch: true,
    highValueThresholdMinor: "1000000",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetches = [
      fetch(`/api/orgs/${orgId}/match-tolerance`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/policy`).then((r) => r.json()),
    ];
    if (isAdmin) {
      fetches.push(fetch(`/api/orgs/${orgId}/vendor-policy`).then((r) => r.json()));
    }
    Promise.all(fetches)
      .then((results) => {
        if (results[0]?.tolerance) setTolerance(results[0].tolerance);
        if (results[1]?.policy) setPolicy(results[1].policy);
        if (isAdmin && results[2]?.policy) setVendorPolicy(results[2].policy);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, isAdmin]);

  async function saveTolerance(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/match-tolerance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tolerance),
      });
      if (!res.ok) {
        const d = await res.json();
        if (d.code === "REAUTH_REQUIRED" && reauth) reauth.showReauth(() => Promise.resolve());
        else setError(d.error ?? "Failed to save");
        return;
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function savePolicy(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policy,
          requirePoAboveAmountMinor: BigInt(policy.requirePoAboveAmountMinor || "0").toString(),
          highValueThresholdMinor: BigInt(policy.highValueThresholdMinor || "1000000").toString(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        if (d.code === "REAUTH_REQUIRED" && reauth) reauth.showReauth(() => Promise.resolve());
        else setError(d.error ?? "Failed to save");
        return;
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;

  return (
    <div className="mt-4 space-y-6">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form onSubmit={saveTolerance} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Match tolerances</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Percentage thresholds for PO vs invoice matching. Exceeded differences become exceptions.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Qty %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={tolerance.qtyTolerancePct}
              onChange={(e) => setTolerance((t) => ({ ...t, qtyTolerancePct: Number(e.target.value) || 0 }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Price %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={tolerance.priceTolerancePct}
              onChange={(e) => setTolerance((t) => ({ ...t, priceTolerancePct: Number(e.target.value) || 0 }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Amount %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={tolerance.amountTolerancePct}
              onChange={(e) => setTolerance((t) => ({ ...t, amountTolerancePct: Number(e.target.value) || 0 }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
          Save tolerances
        </button>
      </form>

      <form onSubmit={savePolicy} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Policy toggles</h2>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policy.requirePoAboveAmountMinor !== "0"}
              onChange={(e) => setPolicy((p) => ({ ...p, requirePoAboveAmountMinor: e.target.checked ? "100000" : "0" }))}
              className="rounded border-slate-300"
            />
            <span className="text-sm">Require PO above amount threshold</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policy.requireAttachmentOnSubmit}
              onChange={(e) => setPolicy((p) => ({ ...p, requireAttachmentOnSubmit: e.target.checked }))}
              className="rounded border-slate-300"
            />
            <span className="text-sm">Require attachment on submit</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policy.allowApproverOverrideOnMismatch}
              onChange={(e) => setPolicy((p) => ({ ...p, allowApproverOverrideOnMismatch: e.target.checked }))}
              className="rounded border-slate-300"
            />
            <span className="text-sm">Allow approver override on mismatch with reason</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">High value threshold (minor units)</label>
            <input
              type="text"
              value={policy.highValueThresholdMinor}
              onChange={(e) => setPolicy((p) => ({ ...p, highValueThresholdMinor: e.target.value }))}
              className="mt-1 w-40 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
          Save policy
        </button>
      </form>

      {isAdmin && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setSaving(true);
            try {
              const res = await fetchWithCsrf(`/api/orgs/${orgId}/vendor-policy`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(vendorPolicy),
              });
              if (!res.ok) {
                const d = await res.json();
                if (d.code === "REAUTH_REQUIRED" && reauth) reauth.showReauth(() => Promise.resolve());
                else setError(d.error ?? "Failed to save");
                return;
              }
            } catch {
              setError("Failed to save");
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vendor controls</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Policy toggles for vendor onboarding and bank change workflow.
          </p>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={vendorPolicy.requireDualApprovalForBankChanges}
                onChange={(e) =>
                  setVendorPolicy((p) => ({ ...p, requireDualApprovalForBankChanges: e.target.checked }))
                }
                className="rounded border-slate-300"
              />
              <span className="text-sm">Require dual approval for bank changes</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={vendorPolicy.requireVendorDocsBeforeActivation}
                onChange={(e) =>
                  setVendorPolicy((p) => ({ ...p, requireVendorDocsBeforeActivation: e.target.checked }))
                }
                className="rounded border-slate-300"
              />
              <span className="text-sm">Require vendor docs before activation</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={vendorPolicy.allowApproverToActivateVendor}
                onChange={(e) =>
                  setVendorPolicy((p) => ({ ...p, allowApproverToActivateVendor: e.target.checked }))
                }
                className="rounded border-slate-300"
              />
              <span className="text-sm">Allow Approver to activate vendor</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Save vendor controls
          </button>
        </form>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Impact preview</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          In last 30 days: X invoices would have become exceptions under these tolerances (TODO: compute from stored diffs)
        </p>
      </div>
    </div>
  );
}
