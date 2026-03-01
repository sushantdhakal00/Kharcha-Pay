"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

type InvoiceType = "PO_INVOICE" | "NON_PO_INVOICE";

interface POLine {
  id: string;
  description: string;
  qtyOrdered: number;
  unitPriceMinor: string;
}

export function NewInvoiceClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [pos, setPos] = useState<{ id: string; poNumber: string; vendorId: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [glCodes, setGlCodes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [po, setPo] = useState<{ id: string; lineItems: POLine[] } | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [type, setType] = useState<InvoiceType>("NON_PO_INVOICE");
  const [poId, setPoId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [glCode, setGlCode] = useState("");
  const [lineItems, setLineItems] = useState<{ description: string; qty: number; unitPriceMinor: string; poLineItemId?: string }[]>([
    { description: "", qty: 1, unitPriceMinor: "0" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/orgs/${orgId}/vendors`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/pos?status=ISSUED`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/departments`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/gl-codes`).then((r) => r.json()),
    ]).then(([vData, pData, dData, gData]) => {
      if (vData.vendors) setVendors(vData.vendors.filter((v: { status: string }) => v.status === "ACTIVE"));
      if (pData.pos) setPos(pData.pos);
      if (dData.departments) setDepartments(dData.departments);
      if (gData.glCodes) setGlCodes(gData.glCodes);
    });
  }, [orgId]);

  useEffect(() => {
    if (!poId || type !== "PO_INVOICE") {
      setPo(null);
      setLineItems([{ description: "", qty: 1, unitPriceMinor: "0" }]);
      return;
    }
    fetch(`/api/orgs/${orgId}/pos/${poId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.po) {
          setPo(data.po);
          setLineItems(
            data.po.lineItems.map((l: POLine) => ({
              description: l.description,
              qty: l.qtyOrdered,
              unitPriceMinor: l.unitPriceMinor,
              poLineItemId: l.id,
            }))
          );
          setVendorId(data.po.vendorId);
          if (data.po.departmentId) setDepartmentId(data.po.departmentId);
        } else setPo(null);
      })
      .catch(() => setPo(null));
  }, [orgId, poId, type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!vendorId) {
      setError("Select a vendor");
      return;
    }
    if (!invoiceNumber.trim()) {
      setError("Invoice number required");
      return;
    }
    if (type === "PO_INVOICE" && !poId) {
      setError("Select a PO for PO invoice");
      return;
    }
    if (!departmentId) {
      setError("Department required");
      return;
    }
    if (!glCode.trim()) {
      setError("GL code required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          type,
          poId: type === "PO_INVOICE" ? poId : null,
          invoiceNumber: invoiceNumber.trim(),
          departmentId: departmentId || null,
          glCode: glCode.trim() || null,
          lineItems: lineItems.map((l) => ({
            description: l.description || "Line item",
            qty: Number(l.qty) || 0,
            unitPriceMinor: String(Number(l.unitPriceMinor) || 0),
            poLineItemId: l.poLineItemId || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create invoice");
        return;
      }
      router.push(`/app/invoices/${data.invoice.id}`);
    } catch {
      setError("Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-2xl space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as InvoiceType)}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="NON_PO_INVOICE">Non-PO invoice</option>
          <option value="PO_INVOICE">PO invoice</option>
        </select>
      </div>
      {type === "PO_INVOICE" && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">PO *</label>
          <select
            value={poId}
            onChange={(e) => setPoId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Select PO</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.poNumber}
              </option>
            ))}
          </select>
          {pos.length === 0 && <p className="mt-1 text-xs text-amber-600">No issued POs. Create and issue a PO first, or use Non-PO invoice.</p>}
        </div>
      )}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Department *</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            required
          >
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">GL code *</label>
          <select
            value={glCode}
            onChange={(e) => setGlCode(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            required
          >
            <option value="">Select GL code</option>
            {glCodes.map((g) => (
              <option key={g.id} value={g.code}>
                {g.code} – {g.name}
              </option>
            ))}
          </select>
          {glCodes.length === 0 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              No GL codes. Admin: add codes in Settings → Coding.
            </p>
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Invoice number *</label>
        <input
          type="text"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="e.g. INV-001"
          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Line items</label>
        <div className="mt-2 space-y-2">
          {lineItems.map((li, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder="Description"
                value={li.description}
                onChange={(e) =>
                  setLineItems((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], description: e.target.value };
                    return next;
                  })
                }
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                min={1}
                value={li.qty}
                onChange={(e) =>
                  setLineItems((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], qty: Number(e.target.value) || 0 };
                    return next;
                  })
                }
                className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                min={0}
                value={li.unitPriceMinor}
                onChange={(e) =>
                  setLineItems((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], unitPriceMinor: e.target.value };
                    return next;
                  })
                }
                className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ? "Creating…" : "Create invoice"}
        </button>
        <Link
          href="/app/invoices"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
