"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface PolicyRules {
  dailyLimitMinor?: number;
  weeklyLimitMinor?: number;
  monthlyLimitMinor?: number;
  perVendorDailyLimitMinor?: number;
  maxPayoutsPerDay?: number;
  maxPayoutsPerVendorPerDay?: number;
  requireApprovalOverMinor?: number;
  allowedRails?: string[];
  allowedProviders?: string[];
  vendorAllowlist?: string[];
  countryAllowlist?: string[];
}

function formatMinor(val: number | undefined): string {
  if (val == null) return "—";
  return `$${(val / 100).toLocaleString()}`;
}

export function TreasuryPolicyClient({ orgId }: { orgId: string }) {
  const [rules, setRules] = useState<PolicyRules | null>(null);
  const [policyVersion, setPolicyVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editJson, setEditJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchPolicy = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/policy`);
      const json = await res.json();
      if (res.ok) {
        setRules(json.effectiveRules);
        setPolicyVersion(json.policy?.version ?? null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  function startEdit() {
    setEditing(true);
    setEditJson(JSON.stringify(rules, null, 2));
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const parsed = JSON.parse(editJson);
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/treasury/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: parsed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
        return;
      }
      setRules(json.effectiveRules);
      setPolicyVersion(json.policy?.version ?? null);
      setEditing(false);
    } catch {
      setError("Invalid JSON or save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-500">Loading policy…</p>;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-slate-900">Treasury Policy</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Risk controls and payout limits.
            {policyVersion != null && (
              <span className="ml-2 text-xs text-slate-400">v{policyVersion}</span>
            )}
            {policyVersion == null && (
              <span className="ml-2 text-xs text-slate-400">(defaults)</span>
            )}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Edit Policy
          </button>
        )}
      </div>

      {!editing && rules && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Daily Limit</p>
            <p className="font-medium">{formatMinor(rules.dailyLimitMinor)}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Weekly Limit</p>
            <p className="font-medium">{formatMinor(rules.weeklyLimitMinor)}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Monthly Limit</p>
            <p className="font-medium">{formatMinor(rules.monthlyLimitMinor)}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Per-Vendor Daily</p>
            <p className="font-medium">{formatMinor(rules.perVendorDailyLimitMinor)}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Max Payouts/Day</p>
            <p className="font-medium">{rules.maxPayoutsPerDay ?? "—"}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Approval Threshold</p>
            <p className="font-medium">{formatMinor(rules.requireApprovalOverMinor)}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Allowed Rails</p>
            <p className="font-medium">{rules.allowedRails?.join(", ") ?? "Any"}</p>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <p className="text-xs text-slate-500">Allowed Providers</p>
            <p className="font-medium">{rules.allowedProviders?.join(", ") ?? "Any"}</p>
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <textarea
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            rows={14}
            className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Policy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
