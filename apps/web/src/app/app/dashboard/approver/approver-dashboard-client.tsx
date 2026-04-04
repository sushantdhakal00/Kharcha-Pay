"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { type TimeRangeValue } from "@/components/time-range-picker";
import { DashboardHeader } from "@/components/dashboard-header";
import { formatAmount } from "@/components/format-amount";
import { ChartEmptyState, QueueEmptyState } from "@/components/empty-state";
import { SkeletonCard, SkeletonChart, SkeletonQueueRow } from "@/components/skeleton";

import { useSmoothLoading } from "@/lib/use-smooth-loading";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

type DashboardData = {
  org: { id: string; name: string; currency: string };
  range?: { from: string; to: string; bucket: string };
  kpis: { approvedSpendMinor: string; paidSpendMinor: string };
  counts: { pendingApprovalsCount: number };
  requestSeries: Array<{
    bucketLabel: string;
    submittedCount: number;
    approvedCount: number;
    rejectedCount: number;
    paidCount: number;
  }>;
  departmentsTable: Array<{ departmentName: string }>;
  queues?: {
    pendingApprovals: Array<{
      id: string;
      title: string;
      amountMinor: string;
      departmentName: string;
      vendorName: string;
    }>;
  };
};

export function ApproverDashboardClient({
  orgId,
  orgName,
  currency,
  userId,
}: {
  orgId: string;
  orgName: string;
  currency: string;
  userId: string;
}) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const [range, setRange] = useState<TimeRangeValue>({
    fromISO: defaultFrom.toISOString().slice(0, 10),
    toISO: defaultTo,
    bucket: "day",
  });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useSmoothLoading(loading);

  useEffect(() => {
    if (!range.fromISO || !range.toISO) return;
    setLoading(true);
    fetch(
      `/api/orgs/${orgId}/dashboard-v2?from=${range.fromISO}&to=${range.toISO}&bucket=${range.bucket}&role=APPROVER`
    )
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [orgId, range]);

  const fmt = (minor: string) => formatAmount(minor, currency);
  const rangeLabel = data?.range ? `Range: ${data.range.from} → ${data.range.to}` : undefined;

  if (showSkeleton && !data) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Approver Dashboard" orgName={orgName} orgId={orgId} userId={userId} role="APPROVER" range={range} onRangeChange={setRange} loading />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonChart />
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <SkeletonQueueRow />
          <SkeletonQueueRow />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader title="Approver Dashboard" orgName={orgName} orgId={orgId} userId={userId} role="APPROVER" range={range} onRangeChange={setRange} />

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div className="flex min-h-[88px] flex-col justify-center rounded-lg border border-blue-200 bg-blue-50 p-4 transition-shadow hover:shadow-md">
              <p className="text-sm font-medium text-blue-800">Pending approvals</p>
              <p className="mt-1 text-3xl font-bold text-blue-900">
                {data.counts?.pendingApprovalsCount ?? 0}
              </p>
              <Link href="/app/requests?status=PENDING&canAct=1" className="mt-2 text-sm font-medium text-blue-700 hover:underline">
                View requests
              </Link>
            </div>
            <div className="flex min-h-[88px] flex-col justify-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <p className="text-sm font-medium text-slate-500">Approved spend</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{fmt(data.kpis?.approvedSpendMinor ?? "0")}</p>
            </div>
            <div className="flex min-h-[88px] flex-col justify-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <p className="text-sm font-medium text-slate-500">Paid spend</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">{fmt(data.kpis?.paidSpendMinor ?? "0")}</p>
            </div>
          </div>

          {data.requestSeries && data.requestSeries.length > 0 ? (
            <div className="min-h-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Approved count over time</h2>
              <p className="text-xs text-slate-500">{rangeLabel}</p>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.requestSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="approvedCount" name="Approved" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <ChartEmptyState role="APPROVER" rangeLabel={rangeLabel} actionHref="/app/requests?status=PENDING&canAct=1" actionLabel="View requests" />
          )}

          {data.queues?.pendingApprovals && data.queues.pendingApprovals.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Pending approvals</h2>
                <Link href="/app/requests?status=PENDING&canAct=1" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                  View all
                </Link>
              </div>
              <ul className="mt-2 space-y-2">
                {data.queues.pendingApprovals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded border border-slate-100 p-3">
                    <div>
                      <Link href={`/app/requests/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        {r.title}
                      </Link>
                      <p className="text-xs text-slate-500">{r.departmentName} · {r.vendorName}</p>
                    </div>
                    <span className="font-medium">{fmt(r.amountMinor)}</span>
                    <Link
                      href={`/app/requests/${r.id}`}
                      className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <QueueEmptyState type="approvals" actionHref="/app/requests?status=PENDING&canAct=1" actionLabel="View requests" />
          )}

          {data.departmentsTable && data.departmentsTable.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Departments</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.departmentsTable.map((d, i) => (
                  <span key={i} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-700">
                    {d.departmentName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
