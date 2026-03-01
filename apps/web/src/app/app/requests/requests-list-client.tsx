"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface RequestRow {
  id: string;
  departmentName: string;
  vendorName: string;
  amountMinor: string;
  status: string;
  requiredApprovals?: number;
  approvalsReceived?: number;
  createdAt: string;
}

export function RequestsListClient({ orgId, canApprove, readOnly }: { orgId: string; canApprove: boolean; readOnly?: boolean }) {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status") ?? "";
  const departmentFromUrl = searchParams.get("department") ?? searchParams.get("departmentId") ?? "";
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [mineOnly, setMineOnly] = useState(statusFromUrl === "PENDING" && !departmentFromUrl ? false : true);
  const [statusFilter, setStatusFilter] = useState<string>(statusFromUrl);
  const [departmentFilter, setDepartmentFilter] = useState<string>(departmentFromUrl);

  useEffect(() => {
    setDepartmentFilter(departmentFromUrl);
  }, [departmentFromUrl]);
  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (mineOnly) params.set("mine", "1");
    if (statusFilter) params.set("status", statusFilter);
    if (departmentFilter) params.set("department", departmentFilter);
    return `/api/orgs/${orgId}/exports/requests?${params.toString()}`;
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (mineOnly) params.set("mine", "1");
    if (statusFilter) params.set("status", statusFilter);
    if (departmentFilter) params.set("department", departmentFilter);
    fetch(`/api/orgs/${orgId}/requests?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setRequests(data.requests ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, mineOnly, statusFilter, departmentFilter]);

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-red-600">{error}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
        {canApprove && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            My requests only
          </label>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="PAID">Paid</option>
        </select>
        </div>
        <a
          href={buildExportUrl()}
          download="requests-export.csv"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2 text-left font-medium text-slate-700">Date</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Department</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Vendor</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700">Amount</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No requests found.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 text-slate-600">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{r.departmentName}</td>
                  <td className="px-4 py-2">{r.vendorName}</td>
                  <td className="px-4 py-2 text-right">{Number(r.amountMinor).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        r.status === "PAID"
                          ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800"
                          : r.status === "APPROVED"
                            ? "text-green-700"
                            : r.status === "REJECTED"
                              ? "text-red-700"
                              : r.status === "PENDING"
                                ? "text-amber-700"
                                : "text-slate-600"
                      }
                    >
                      {r.status}
                      {r.status === "PENDING" &&
                        typeof r.requiredApprovals === "number" &&
                        typeof r.approvalsReceived === "number" && (
                          <span className="ml-1 text-slate-500">
                            ({r.approvalsReceived}/{r.requiredApprovals})
                          </span>
                        )}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/app/requests/${r.id}`} className="font-medium text-slate-900 hover:underline">
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
