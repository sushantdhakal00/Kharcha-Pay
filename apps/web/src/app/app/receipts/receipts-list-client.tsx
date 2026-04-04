"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface ReceiptRow {
  id: string;
  poId: string;
  poNumber: string;
  receivedAt: string;
  receivedByUsername: string;
  status: string;
  createdAt: string;
}

export function ReceiptsListClient({ orgId, canWrite }: { orgId: string; canWrite: boolean }) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [poIdFilter, setPoIdFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (poIdFilter) params.set("poId", poIdFilter);
    fetch(`/api/orgs/${orgId}/receipts?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setReceipts(data.receipts ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, poIdFilter]);

  async function submitReceipt(id: string) {
    setSubmittingId(id);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/receipts/${id}/submit`, { method: "POST" });
      if (res.ok) {
        const params = new URLSearchParams();
        if (poIdFilter) params.set("poId", poIdFilter);
        const data = await fetch(`/api/orgs/${orgId}/receipts?${params}`).then((r) => r.json());
        setReceipts(data.receipts ?? []);
      }
    } finally {
      setSubmittingId(null);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">PO #</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Received at</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Received by</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
              {canWrite && <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Action</th>}
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No receipts yet. Create a receipt from a PO detail page.
                </td>
              </tr>
            ) : (
              receipts.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                  <td className="px-4 py-2">
                    <Link href={`/app/pos/${r.poId}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                      {r.poNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    {new Date(r.receivedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{r.receivedByUsername}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        r.status === "SUBMITTED" || r.status === "ACCEPTED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-2">
                      {r.status === "DRAFT" && (
                        <button
                          onClick={() => submitReceipt(r.id)}
                          disabled={!!submittingId}
                          className="text-sm font-medium text-slate-900 hover:underline dark:text-slate-100 disabled:opacity-50"
                        >
                          {submittingId === r.id ? "Submitting…" : "Submit"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
