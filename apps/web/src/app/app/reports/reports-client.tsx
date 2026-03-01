"use client";

import { useState } from "react";

export function ReportsClient({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const now = new Date();

  const [budgetYear, setBudgetYear] = useState(now.getFullYear());
  const [budgetMonth, setBudgetMonth] = useState(now.getMonth() + 1);
  const [requestsFrom, setRequestsFrom] = useState("");
  const [requestsTo, setRequestsTo] = useState("");
  const [requestsStatus, setRequestsStatus] = useState("");
  const [requestsMine, setRequestsMine] = useState(false);
  const [paymentsFrom, setPaymentsFrom] = useState("");
  const [paymentsTo, setPaymentsTo] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditAction, setAuditAction] = useState("");

  const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const download = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBudgetExport = () => {
    const params = new URLSearchParams({ year: String(budgetYear), month: String(budgetMonth) });
    download(`/api/orgs/${orgId}/exports/budget-vs-actual?${params}`);
  };

  const handleRequestsExport = () => {
    const params = new URLSearchParams();
    if (requestsFrom) params.set("from", requestsFrom);
    if (requestsTo) params.set("to", requestsTo);
    if (requestsStatus) params.set("status", requestsStatus);
    if (requestsMine) params.set("mine", "1");
    download(`/api/orgs/${orgId}/exports/requests?${params}`);
  };

  const handlePaymentsExport = () => {
    const params = new URLSearchParams();
    if (paymentsFrom) params.set("from", paymentsFrom);
    if (paymentsTo) params.set("to", paymentsTo);
    download(`/api/orgs/${orgId}/exports/payments?${params}`);
  };

  const handleAuditExport = () => {
    const params = new URLSearchParams();
    if (auditFrom) params.set("from", auditFrom);
    if (auditTo) params.set("to", auditTo);
    if (auditAction) params.set("action", auditAction);
    download(`/api/orgs/${orgId}/exports/audit?${params}`);
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Budget vs Actual */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Budget vs Actual</h2>
        <p className="mt-1 text-sm text-slate-600">departmentName, budgetMinor, approvedSpendMinor, paidSpendMinor, remainingMinor</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={budgetMonth}
            onChange={(e) => setBudgetMonth(parseInt(e.target.value, 10))}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {monthNames.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={budgetYear}
            onChange={(e) => setBudgetYear(parseInt(e.target.value, 10))}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBudgetExport}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Requests */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Requests</h2>
        <p className="mt-1 text-sm text-slate-600">requestId, createdAt, submittedAt, department, vendor, title, category, amountMinor, currency, status, approvals, memo</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            value={requestsFrom}
            onChange={(e) => setRequestsFrom(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={requestsTo}
            onChange={(e) => setRequestsTo(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="To"
          />
          <select
            value={requestsStatus}
            onChange={(e) => setRequestsStatus(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="PAID">Paid</option>
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={requestsMine}
              onChange={(e) => setRequestsMine(e.target.checked)}
            />
            Mine only
          </label>
          <button
            type="button"
            onClick={handleRequestsExport}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Payments */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Payments</h2>
        <p className="mt-1 text-sm text-slate-600">requestId, vendor, department, amountMinor, paidAt, paidTxSig, memo, explorerLink (PAID only)</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            value={paymentsFrom}
            onChange={(e) => setPaymentsFrom(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={paymentsTo}
            onChange={(e) => setPaymentsTo(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="To"
          />
          <button
            type="button"
            onClick={handlePaymentsExport}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Audit (ADMIN only) */}
      {isAdmin && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Audit log</h2>
          <p className="mt-1 text-sm text-slate-600">time, actorEmail, action, entityType, entityId, summary, diff, metadata (ADMIN only)</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              type="date"
              value={auditFrom}
              onChange={(e) => setAuditFrom(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={auditTo}
              onChange={(e) => setAuditTo(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <select
              value={auditAction}
              onChange={(e) => setAuditAction(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">All actions</option>
              <option value="ORG_CREATED">ORG_CREATED</option>
              <option value="MEMBER_ADDED">MEMBER_ADDED</option>
              <option value="DEPT_CREATED">DEPT_CREATED</option>
              <option value="BUDGET_UPSERTED">BUDGET_UPSERTED</option>
              <option value="REQUEST_CREATED">REQUEST_CREATED</option>
              <option value="REQUEST_SUBMITTED">REQUEST_SUBMITTED</option>
              <option value="REQUEST_APPROVED">REQUEST_APPROVED</option>
              <option value="REQUEST_REJECTED">REQUEST_REJECTED</option>
              <option value="REQUEST_PAID">REQUEST_PAID</option>
              <option value="VENDOR_CREATED">VENDOR_CREATED</option>
              <option value="VENDOR_WALLET_SET">VENDOR_WALLET_SET</option>
            </select>
            <button
              type="button"
              onClick={handleAuditExport}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Download CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
