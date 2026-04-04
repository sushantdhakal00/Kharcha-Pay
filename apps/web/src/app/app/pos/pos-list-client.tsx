"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PORow {
  id: string;
  poNumber: string;
  vendorName: string;
  departmentName: string | null;
  totalMinor: string;
  status: string;
  issuedAt: string | null;
  createdAt: string;
}

export function PurchaseOrdersListClient({
  orgId,
  canWrite,
}: {
  orgId: string;
  canWrite: boolean;
}) {
  const [pos, setPos] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/orgs/${orgId}/pos?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setPos(data.pos ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, statusFilter]);

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ISSUED">Issued</option>
          <option value="PARTIALLY_RECEIVED">Partially received</option>
          <option value="RECEIVED">Received</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELED">Canceled</option>
        </select>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">PO #</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Vendor</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Department</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Total</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {pos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No purchase orders yet. Create your first PO to get started.
                </td>
              </tr>
            ) : (
              pos.map((po) => (
                <tr key={po.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{po.poNumber}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{po.vendorName}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{po.departmentName ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-300">
                    {Number(po.totalMinor).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        po.status === "ISSUED" || po.status === "RECEIVED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : po.status === "DRAFT"
                            ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                            : po.status === "CLOSED" || po.status === "CANCELED"
                              ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      }`}
                    >
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/app/pos/${po.id}`}
                      className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
