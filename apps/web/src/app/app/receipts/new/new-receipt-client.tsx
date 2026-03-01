"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface POLine {
  id: string;
  description: string;
  qtyOrdered: number;
  unitPriceMinor: string;
}

interface PO {
  id: string;
  poNumber: string;
  status: string;
  lineItems: POLine[];
}

export function NewReceiptClient({ orgId, defaultPoId }: { orgId: string; defaultPoId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poIdFromUrl = searchParams.get("poId") ?? defaultPoId;
  const [pos, setPos] = useState<{ id: string; poNumber: string }[]>([]);
  const [po, setPo] = useState<PO | null>(null);
  const [poId, setPoId] = useState(poIdFromUrl);
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/orgs/${orgId}/pos`)
      .then((r) => r.json())
      .then((data) => {
        const issued = (data.pos ?? []).filter(
          (p: { status: string }) => p.status === "ISSUED" || p.status === "PARTIALLY_RECEIVED"
        );
        setPos(issued.map((p: { id: string; poNumber: string }) => ({ id: p.id, poNumber: p.poNumber })));
      });
  }, [orgId]);

  useEffect(() => {
    if (!poId) {
      setPo(null);
      return;
    }
    fetch(`/api/orgs/${orgId}/pos/${poId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.po) {
          setPo(data.po);
          const qtyMap: Record<string, number> = {};
          for (const l of data.po.lineItems) qtyMap[l.id] = l.qtyOrdered;
          setLineQtys(qtyMap);
        } else setPo(null);
      })
      .catch(() => setPo(null));
  }, [orgId, poId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!poId || !po) {
      setError("Select a PO");
      return;
    }
    setSubmitting(true);
    try {
      const lineItems = po.lineItems.map((l) => ({
        poLineItemId: l.id,
        qtyReceived: Math.min(l.qtyOrdered, lineQtys[l.id] ?? 0),
      }));
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId, note, lineItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create receipt");
        return;
      }
      router.push(`/app/pos/${poId}`);
    } catch {
      setError("Failed to create receipt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-2xl space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
        {pos.length === 0 && <p className="mt-1 text-xs text-slate-500">No issued POs. Issue a PO first.</p>}
      </div>
      {po && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Quantities received</label>
            <div className="mt-2 space-y-2">
              {po.lineItems.map((l) => (
                <div key={l.id} className="flex items-center gap-4">
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{l.description}</span>
                  <span className="text-sm text-slate-500">Ordered: {l.qtyOrdered}</span>
                  <input
                    type="number"
                    min={0}
                    max={l.qtyOrdered}
                    value={lineQtys[l.id] ?? 0}
                    onChange={(e) => setLineQtys((prev) => ({ ...prev, [l.id]: Number(e.target.value) || 0 }))}
                    className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !po}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ? "Creating…" : "Create receipt"}
        </button>
        <Link
          href="/app/receipts"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
