"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface VendorRow {
  id: string;
  name: string;
  displayName: string;
  status: string;
  riskLevel: string;
  paymentMethodStatus: string;
  docsStatus: string;
  spendLast30Minor: string;
  concentrationPct: number;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    ONBOARDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    BLOCKED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    DRAFT: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    ARCHIVED: "bg-slate-200 text-slate-600 dark:bg-slate-700",
    INACTIVE: "bg-slate-200 text-slate-600",
  };
  const label: Record<string, string> = {
    ACTIVE: "Active",
    ONBOARDING: "Onboarding",
    BLOCKED: "Blocked",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
    INACTIVE: "Inactive",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {label[status] ?? status}
    </span>
  );
}

function formatMinor(minor: string): string {
  const n = BigInt(minor);
  if (n < BigInt(100)) return n.toString();
  const s = n.toString();
  return s.slice(0, -2) + "." + s.slice(-2).padStart(2, "0");
}

export function VendorsListClient({
  orgId,
  isAdmin,
  isApprover,
  canWrite,
}: {
  orgId: string;
  isAdmin: boolean;
  isApprover: boolean;
  canWrite: boolean;
}) {
  const searchParams = useSearchParams();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [overdue, setOverdue] = useState(searchParams.get("overdue") === "true");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      if (overdue) p.set("overdue", "true");
      const url = `/api/orgs/${orgId}/vendors${p.toString() ? "?" + p.toString() : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) setVendors(data.vendors ?? []);
      else setError(data.error ?? "Failed to load");
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, overdue]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create");
        return;
      }
      setShowNewModal(false);
      setNewName("");
      load();
    } catch {
      setError("Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All statuses</option>
          <option value="ONBOARDING">Onboarding</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
            className="rounded border-slate-300"
          />
          Onboarding overdue
        </label>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Add vendor
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-600">
          <p className="text-slate-600 dark:text-slate-400">
            Add your first vendor to start paying invoices.
          </p>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="mt-3 rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Add vendor
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Vendor</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Risk</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Payment</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Docs</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Spend (30d)</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Concentration</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                    <Link href={`/app/vendors/${v.id}`} className="hover:underline">
                      {v.displayName || v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={v.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{v.riskLevel}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        v.paymentMethodStatus === "VERIFIED"
                          ? "text-green-600 dark:text-green-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {v.paymentMethodStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        v.docsStatus === "COMPLETE"
                          ? "text-green-600 dark:text-green-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {v.docsStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatMinor(v.spendLast30Minor)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {v.concentrationPct > 0 ? `${v.concentrationPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/app/vendors/${v.id}`}
                      className="text-slate-700 hover:underline dark:text-slate-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewModal && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setShowNewModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add vendor</h3>
            <form onSubmit={handleCreate} className="mt-4">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Vendor name"
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  disabled={submitting}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
