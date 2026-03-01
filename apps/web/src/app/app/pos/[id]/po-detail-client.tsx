"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface PO {
  id: string;
  poNumber: string;
  vendorName: string;
  departmentName: string | null;
  currency: string;
  totalMinor: string;
  status: string;
  issuedAt: string | null;
  createdAt: string;
  lineItems: Array<{ id: string; description: string; qtyOrdered: number; unitPriceMinor: string; totalMinor: string }>;
}

export function PODetailClient({
  orgId,
  poId,
  canWrite,
}: {
  orgId: string;
  poId: string;
  canWrite: boolean;
}) {
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    fetch(`/api/orgs/${orgId}/pos/${poId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setPo(data.po);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, poId]);

  async function issue() {
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/pos/${poId}/issue`, { method: "POST" });
      if (res.ok) {
        const data = await fetch(`/api/orgs/${orgId}/pos/${poId}`).then((r) => r.json());
        setPo(data.po);
      }
    } finally {
      setActioning(false);
    }
  }

  async function close() {
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/pos/${poId}/close`, { method: "POST" });
      if (res.ok) {
        const data = await fetch(`/api/orgs/${orgId}/pos/${poId}`).then((r) => r.json());
        setPo(data.po);
      }
    } finally {
      setActioning(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error || !po) return <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error || "PO not found"}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{po.poNumber}</h1>
        <span
          className={`rounded px-2 py-1 text-sm font-medium ${
            po.status === "ISSUED" || po.status === "RECEIVED"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : po.status === "DRAFT"
                ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          }`}
        >
          {po.status}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Vendor: {po.vendorName} {po.departmentName && `| Dept: ${po.departmentName}`}
      </p>
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
        Total: {Number(po.totalMinor).toLocaleString()} {po.currency}
      </p>

      {canWrite && (
        <div className="flex gap-2">
          {po.status === "DRAFT" && (
            <button
              onClick={issue}
              disabled={actioning}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Issue PO
            </button>
          )}
          {(po.status === "ISSUED" || po.status === "RECEIVED" || po.status === "PARTIALLY_RECEIVED") && (
            <button
              onClick={close}
              disabled={actioning}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close PO
            </button>
          )}
          <Link
            href={`/app/receipts/new?poId=${poId}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Record receipt
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Description</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Unit price</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Total</th>
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right">{l.qtyOrdered}</td>
                <td className="px-4 py-2 text-right">{Number(l.unitPriceMinor).toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{Number(l.totalMinor).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
