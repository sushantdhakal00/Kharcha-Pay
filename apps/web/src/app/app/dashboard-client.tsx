"use client";

import { useState, useEffect } from "react";

interface DashboardData {
  year: number;
  month: number;
  totalBudgetMinor: string;
  approvedSpendMinor: string;
  paidSpendMinor: string;
  remainingMinor: string;
  burnRateMinor: string;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  paidCount: number;
  pendingApprovalsCount?: number;
  topDepartments: Array<{ departmentName: string; approvedSpendMinor: string }>;
  departmentsTable: Array<{
    departmentId: string;
    departmentName: string;
    budgetMinor: string;
    approvedSpendMinor: string;
    paidSpendMinor: string;
    remainingMinor: string;
  }>;
}

function fmt(n: string): string {
  return Number(n).toLocaleString();
}

export function DashboardClient({ orgId }: { orgId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/orgs/${orgId}/dashboard?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [orgId, year, month]);

  const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (loading && !data) {
    return <div className="text-slate-600">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/orgs/${orgId}/exports/budget-vs-actual?year=${year}&month=${month}`}
            download={`budget-vs-actual-${year}-${String(month).padStart(2, "0")}.csv`}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export Budget vs Actual CSV
          </a>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {monthNames.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Budget (this month)</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmt(data.totalBudgetMinor)}</p>
              <p className="text-xs text-slate-400">minor units</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Approved spend</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmt(data.approvedSpendMinor)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Paid spend</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">{fmt(data.paidSpendMinor)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Remaining</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmt(data.remainingMinor)}</p>
              <p className="text-xs text-slate-400">burn rate: {fmt(data.burnRateMinor)}/mo</p>
            </div>
          </div>

          {(data.pendingApprovalsCount ?? 0) > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-800">
                <a href="/app/requests?status=PENDING" className="hover:underline">
                  {data.pendingApprovalsCount} request{(data.pendingApprovalsCount ?? 0) !== 1 ? "s" : ""} need your approval
                </a>
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-800">{data.pendingCount}</p>
              <p className="text-sm text-amber-700">Pending</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-2xl font-bold text-green-800">{data.approvedCount}</p>
              <p className="text-sm text-green-700">Approved</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-800">{data.rejectedCount}</p>
              <p className="text-sm text-red-700">Rejected</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-800">{data.paidCount}</p>
              <p className="text-sm text-emerald-700">Paid</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
              Budget vs Spend by department ({monthNames[month]} {year})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2 text-left font-medium text-slate-700">Department</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">Budget</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">Approved</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">Paid</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {data.departmentsTable.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No budgets set</td>
                    </tr>
                  ) : (
                    data.departmentsTable.map((row) => (
                      <tr key={row.departmentId} className="border-b border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-900">{row.departmentName}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmt(row.budgetMinor)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmt(row.approvedSpendMinor)}</td>
                        <td className="px-4 py-2 text-right text-emerald-600">{fmt(row.paidSpendMinor)}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-900">{fmt(row.remainingMinor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
