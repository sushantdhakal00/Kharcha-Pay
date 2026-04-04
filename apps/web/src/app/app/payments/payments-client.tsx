"use client";

import { useState, useEffect } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

interface PaymentRow {
  id: string;
  paidAt: string | null;
  vendorName: string;
  departmentName: string;
  amountMinor: string;
  currency: string;
  paidTxSig: string | null;
  memo: string;
  explorerLink: string | null;
  verificationStatus: string;
  verificationCheckedAt: string | null;
  verificationReasons: string[];
}

interface Dept {
  id: string;
  name: string;
}

interface Vendor {
  id: string;
  name: string;
}

export function PaymentsClient({ orgId, isAdmin }: { orgId: string; isAdmin?: boolean }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const reauth = useReauth();

  useEffect(() => {
    Promise.all([
      fetch(`/api/orgs/${orgId}/departments`).then((r) => r.json()),
      fetch(`/api/orgs/${orgId}/vendors`).then((r) => r.json()),
    ]).then(([deptData, vendorData]) => {
      if (deptData.departments) setDepartments(deptData.departments);
      if (vendorData.vendors) setVendors(vendorData.vendors);
    });
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (departmentId) params.set("departmentId", departmentId);
    if (vendorId) params.set("vendorId", vendorId);
    if (verificationStatus) params.set("verificationStatus", verificationStatus);
    fetch(`/api/orgs/${orgId}/payments?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setPayments(data.payments ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, from, to, departmentId, vendorId, verificationStatus]);

  async function handleRunReconciliation() {
    setError("");
    setReconciling(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/reconcile/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(handleRunReconciliation);
          return;
        }
        setError(data.error ?? "Reconciliation failed");
        return;
      }
      setError("");
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (departmentId) params.set("departmentId", departmentId);
      if (vendorId) params.set("vendorId", vendorId);
      if (verificationStatus) params.set("verificationStatus", verificationStatus);
      const listRes = await fetch(`/api/orgs/${orgId}/payments?${params}`);
      const listData = await listRes.json();
      if (listData.payments) setPayments(listData.payments);
    } catch {
      setError("Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  }

  function VerificationBadge({ status }: { status: string }) {
    const cls =
      status === "VERIFIED"
        ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800"
        : status === "WARNING"
          ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
          : status === "FAILED"
            ? "rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800"
            : "rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600";
    return <span className={cls}>{status === "PENDING" ? "Not checked" : status}</span>;
  }

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/orgs/${orgId}/exports/payments?${params}`;
  };

  if (loading && payments.length === 0) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-red-600">{error}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="To"
          />
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select
            value={verificationStatus}
            onChange={(e) => setVerificationStatus(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="WARNING">Warning</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Not checked</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={handleRunReconciliation}
              disabled={reconciling}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {reconciling ? "Running…" : "Run reconciliation"}
            </button>
          )}
          <a
          href={exportUrl()}
          download="payments-export.csv"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2 text-left font-medium text-slate-700">Paid at</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Vendor</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Department</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700">Amount</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Verification</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Tx signature</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Memo</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Explorer</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No payments found.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 text-slate-600">
                    {p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">{p.vendorName}</td>
                  <td className="px-4 py-2">{p.departmentName}</td>
                  <td className="px-4 py-2 text-right">
                    {Number(p.amountMinor).toLocaleString()} {p.currency}
                  </td>
                  <td className="px-4 py-2">
                    <VerificationBadge status={p.verificationStatus} />
                    {p.verificationReasons.length > 0 && (
                      <p className="mt-1 max-w-[12rem] truncate text-xs text-slate-500" title={p.verificationReasons.join("; ")}>
                        {p.verificationReasons[0]}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {p.paidTxSig ? `${p.paidTxSig.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="max-w-[12rem] truncate px-4 py-2 text-slate-600" title={p.memo}>
                    {p.memo || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {p.explorerLink ? (
                      <a
                        href={p.explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-slate-900 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
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
