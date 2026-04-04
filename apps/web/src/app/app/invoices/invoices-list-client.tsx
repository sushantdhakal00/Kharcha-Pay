"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  type: string;
  poNumber: string | null;
  totalMinor: string;
  status: string;
  glCode: string | null;
  submittedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  assignedToUsername: string | null;
  matchStatus: string | null;
  ageDays: number;
  slaRisk: boolean;
  overdue: boolean;
}

type Tab = "all" | "needs_verification" | "exceptions" | "overdue" | "no_receipt" | "high_value";

export function InvoicesListClient({
  orgId,
  canWrite,
  canVerify,
}: {
  orgId: string;
  canWrite: boolean;
  canVerify: boolean;
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"age" | "amount" | "risk">("age");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "needs_verification") params.set("status", "NEEDS_VERIFICATION");
    else if (tab === "exceptions") params.set("status", "EXCEPTION");
    else if (tab === "overdue") params.set("overdueVerification", "true");
    else if (tab === "no_receipt") params.set("noReceipt", "true");
    else if (tab === "high_value") params.set("highValue", "true");
    if (search) params.set("search", search);
    params.set("sort", sort);
    fetch(`/api/orgs/${orgId}/invoices?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInvoices(data.invoices ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, tab, search, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    ...(canVerify
      ? [
          { id: "needs_verification" as Tab, label: "Needs verification" },
          { id: "exceptions" as Tab, label: "Exceptions" },
          { id: "overdue" as Tab, label: "Overdue (>5 days)" },
          { id: "no_receipt" as Tab, label: "No receipt" },
          { id: "high_value" as Tab, label: "High value" },
        ]
      : []),
  ];

  const canBulkVerify = canVerify && selected.size > 0;
  const canBulkAssign = canVerify && selected.size > 0;
  const verifiableIds = invoices
    .filter((i) => selected.has(i.id) && (i.status === "NEEDS_VERIFICATION" || i.status === "EXCEPTION") && i.glCode && i.matchStatus === "MATCHED")
    .map((i) => i.id);

  async function bulkAssign() {
    if (selected.size === 0) return;
    setBulking(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/bulk-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (res.ok) {
        setSelected(new Set());
        load();
      }
    } finally {
      setBulking(false);
    }
  }

  async function bulkVerify() {
    if (verifiableIds.length === 0) return;
    setBulking(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/bulk-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: verifiableIds }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelected(new Set());
        load();
        if (data.skipped?.length) alert(`Skipped: ${data.skipped.map((s: { reason: string }) => s.reason).join(", ")}`);
      }
    } finally {
      setBulking(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map((i) => i.id)));
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search vendor, invoice #, PO"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <button type="button" onClick={() => { if (search) load(); }} className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600">
          Search
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value as "age" | "amount" | "risk")} className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          <option value="age">Age (oldest first)</option>
          <option value="amount">Amount (highest)</option>
          <option value="risk">Risk (exceptions first)</option>
        </select>
        {canVerify && selected.size > 0 && (
          <div className="flex gap-2">
            <button onClick={bulkAssign} disabled={bulking} className="rounded bg-slate-700 px-2 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-50">
              Assign to me ({selected.size})
            </button>
            <button onClick={bulkVerify} disabled={bulking || verifiableIds.length === 0} className="rounded bg-emerald-600 px-2 py-1 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              Bulk verify ({verifiableIds.length})
            </button>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <tr>
              {canVerify && (
                <th className="px-2 py-2">
                  <input type="checkbox" checked={selected.size === invoices.length && invoices.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
              )}
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Invoice #</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Vendor</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Type</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">PO</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Total</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Age</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  {tab === "all" ? "No invoices yet. Create your first invoice to get started." : "No invoices match this filter."}
                  {canVerify && tab !== "all" && (
                    <span className="block mt-2">
                      <Link href="/app/invoices" className="text-slate-700 underline dark:text-slate-300">Review inbox</Link>
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              invoices.map((inv, idx) => (
                <tr
                  key={inv.id}
                  className={`border-b border-slate-100 last:border-b-0 dark:border-slate-800 ${idx % 2 === 1 ? "bg-slate-50/50 dark:bg-slate-800/30" : ""}`}
                >
                  {canVerify && (
                    <td className="px-2 py-2">
                      {(inv.status === "NEEDS_VERIFICATION" || inv.status === "EXCEPTION") && (
                        <input
                          type="checkbox"
                          checked={selected.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="rounded"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    {inv.vendorName}
                    {inv.assignedToUsername && (
                      <span className="ml-1 rounded bg-slate-200 px-1 text-xs dark:bg-slate-600">→ {inv.assignedToUsername}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{inv.type}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{inv.poNumber ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-300">
                    {Number(inv.totalMinor).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        inv.status === "EXCEPTION"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                          : inv.status === "VERIFIED" || inv.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : inv.status === "DRAFT"
                              ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {inv.status}
                    </span>
                    {!inv.glCode && inv.status !== "DRAFT" && inv.status !== "REJECTED" && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Uncoded</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    {inv.ageDays}d
                    {inv.overdue && <span className="ml-1 text-red-600 dark:text-red-400">Overdue</span>}
                    {inv.slaRisk && !inv.overdue && <span className="ml-1 text-amber-600 dark:text-amber-400">SLA risk</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/app/invoices/${inv.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
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
