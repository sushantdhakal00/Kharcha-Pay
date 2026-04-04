"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

export function NewPOClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [lineItems, setLineItems] = useState<{ description: string; qtyOrdered: number; unitPriceMinor: string }[]>([
    { description: "", qtyOrdered: 1, unitPriceMinor: "0" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/orgs/${orgId}/vendors`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/departments`).then((r) => r.json()),
    ]).then(([vData, dData]) => {
      if (vData.vendors) setVendors(vData.vendors.filter((v: { status: string }) => v.status === "ACTIVE"));
      if (dData.departments) setDepartments(dData.departments);
    });
  }, [orgId]);

  const addLine = () => setLineItems((prev) => [...prev, { description: "", qtyOrdered: 1, unitPriceMinor: "0" }]);
  const removeLine = (i: number) => setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, f: string, v: string | number) => {
    setLineItems((prev) => {
      const next = [...prev];
      (next[i] as Record<string, unknown>)[f] = v;
      return next;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!vendorId) {
      setError("Select a vendor");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/pos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          departmentId: departmentId || null,
          lineItems: lineItems.map((l) => ({
            description: l.description || "Line item",
            qtyOrdered: Number(l.qtyOrdered) || 0,
            unitPriceMinor: String(Number(l.unitPriceMinor) || 0),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create PO");
        return;
      }
      router.push(`/app/pos/${data.po.id}`);
    } catch {
      setError("Failed to create PO");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-2xl space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Vendor *</label>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          required
        >
          <option value="">Select vendor</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Line items</label>
          <button type="button" onClick={addLine} className="text-sm text-slate-600 hover:underline dark:text-slate-400">
            Add line
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {lineItems.map((li, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder="Description"
                value={li.description}
                onChange={(e) => updateLine(i, "description", e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                min={1}
                value={li.qtyOrdered}
                onChange={(e) => updateLine(i, "qtyOrdered", Number(e.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                min={0}
                placeholder="Unit price"
                value={li.unitPriceMinor}
                onChange={(e) => updateLine(i, "unitPriceMinor", e.target.value)}
                className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button type="button" onClick={() => removeLine(i)} className="text-red-600 hover:underline dark:text-red-400">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {submitting ? "Creating…" : "Create PO"}
        </button>
        <Link
          href="/app/pos"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
