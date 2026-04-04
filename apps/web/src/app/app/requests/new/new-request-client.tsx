"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface Department {
  id: string;
  name: string;
}
interface Vendor {
  id: string;
  name: string;
  status: string;
}

export function NewRequestClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [amountMinor, setAmountMinor] = useState("");
  const [budgetRemaining, setBudgetRemaining] = useState<{ remaining: string; budgetMinor: string; spentApproved: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showInactiveVendors, setShowInactiveVendors] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/orgs/${orgId}/departments`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/vendors${showInactiveVendors ? "" : "?status=ACTIVE"}`).then((r) => r.json()),
    ]).then(([deptData, vendorData]) => {
      if (deptData.departments) setDepartments(deptData.departments);
      if (vendorData.vendors) setVendors(vendorData.vendors);
      setLoading(false);
    });
  }, [orgId, showInactiveVendors]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    if (!departmentId) {
      setBudgetRemaining(null);
      return;
    }
    fetch(`/api/orgs/${orgId}/departments/${departmentId}/budget-remaining?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.remaining !== undefined) setBudgetRemaining(data);
        else setBudgetRemaining(null);
      })
      .catch(() => setBudgetRemaining(null));
  }, [orgId, departmentId, year, month]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseInt(amountMinor, 10);
    if (isNaN(amount) || amount < 0) {
      setError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          vendorId,
          title: title.trim(),
          purpose: purpose.trim(),
          category: category.trim(),
          amountMinor: amount,
          currency: "NPR",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.code === "VENDOR_INACTIVE" ? "Only active vendors can be used. Activate the vendor in Settings → Vendors." : (data.error ?? "Failed to create"));
        return;
      }
      router.push(`/app/requests/${data.request.id}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  const remainingNum = budgetRemaining ? Number(budgetRemaining.remaining) : null;
  const amountNum = parseInt(amountMinor, 10);
  const exceedsBudget = remainingNum !== null && !isNaN(amountNum) && amountNum > remainingNum;

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Department</label>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">Select</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      {departmentId && budgetRemaining && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-slate-700">
            Remaining budget this month: <strong>{Number(budgetRemaining.remaining).toLocaleString()}</strong> (minor units)
          </p>
          {exceedsBudget && (
            <p className="mt-1 text-amber-700">This amount exceeds remaining budget. You can still submit (warning only).</p>
          )}
        </div>
      )}
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-slate-700">Vendor</label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showInactiveVendors}
              onChange={(e) => setShowInactiveVendors(e.target.checked)}
            />
            Show inactive
          </label>
        </div>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">Select (active only)</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id} disabled={v.status !== "ACTIVE"}>
              {v.name}{v.status !== "ACTIVE" ? ` (${v.status})` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">Only active vendors can be used for new requests.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Purpose</label>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          required
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Category</label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          placeholder="e.g. Office supplies"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Amount (minor units, e.g. paisa)</label>
        <input
          type="number"
          min={0}
          value={amountMinor}
          onChange={(e) => setAmountMinor(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Save as draft"}
        </button>
        <a href="/app/requests" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancel
        </a>
      </div>
    </form>
  );
}
