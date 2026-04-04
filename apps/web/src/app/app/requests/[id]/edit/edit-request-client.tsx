"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface Dept {
  id: string;
  name: string;
}
interface Vendor {
  id: string;
  name: string;
}

export function EditRequestClient({
  requestId,
  orgId,
  initial,
  departments,
  vendors,
}: {
  requestId: string;
  orgId: string;
  initial: { departmentId: string; vendorId: string; title: string; purpose: string; category: string; amountMinor: string };
  departments: Dept[];
  vendors: Vendor[];
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState(initial.departmentId);
  const [vendorId, setVendorId] = useState(initial.vendorId);
  const [title, setTitle] = useState(initial.title);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [category, setCategory] = useState(initial.category);
  const [amountMinor, setAmountMinor] = useState(initial.amountMinor);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          vendorId,
          title: title.trim(),
          purpose: purpose.trim(),
          category: category.trim(),
          amountMinor: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      router.push(`/app/requests/${requestId}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Department</label>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Vendor</label>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
        >
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Purpose</label>
        <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} required rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Category</label>
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Amount (minor units)</label>
        <input type="number" min={0} value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {submitting ? "Saving…" : "Save"}
        </button>
        <a href={`/app/requests/${requestId}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</a>
      </div>
    </form>
  );
}
