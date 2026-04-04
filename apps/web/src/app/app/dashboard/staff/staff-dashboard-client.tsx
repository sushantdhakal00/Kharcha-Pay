"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { type TimeRangeValue } from "@/components/time-range-picker";
import { DashboardHeader } from "@/components/dashboard-header";
import { formatAmount } from "@/components/format-amount";
import { ChartEmptyState, QueueEmptyState } from "@/components/empty-state";
import { SkeletonChart, SkeletonQueueRow } from "@/components/skeleton";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useSmoothLoading } from "@/lib/use-smooth-loading";

type DashboardData = {
  org: { id: string; name: string; currency: string };
  range?: { from: string; to: string; bucket: string };
  counts: { draftCount: number; pendingCount: number; approvedCount: number; rejectedCount: number; paidCount: number };
  queues?: {
    myDrafts: Array<{ id: string; title: string; amountMinor: string }>;
    myPending: Array<{ id: string; title: string; amountMinor: string }>;
    actionNeeded: Array<{ id: string; title: string; reason: string }>;
  };
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  paid: "#059669",
};

export function StaffDashboardClient({
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
      `/api/orgs/${orgId}/dashboard-v2?from=${range.fromISO}&to=${range.toISO}&bucket=${range.bucket}&role=STAFF`
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
        <DashboardHeader title="Staff Dashboard" orgName={orgName} orgId={orgId} userId={userId} role="STAFF" range={range} onRangeChange={setRange} loading />
        <SkeletonChart />
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <SkeletonQueueRow />
          <SkeletonQueueRow />
        </div>
      </div>
    );
  }

  const pieData = data?.counts
    ? [
        { name: "Draft", value: data.counts.draftCount, color: STATUS_COLORS.draft },
        { name: "Pending", value: data.counts.pendingCount, color: STATUS_COLORS.pending },
        { name: "Approved", value: data.counts.approvedCount, color: STATUS_COLORS.approved },
        { name: "Rejected", value: data.counts.rejectedCount, color: STATUS_COLORS.rejected },
        { name: "Paid", value: data.counts.paidCount, color: STATUS_COLORS.paid },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Staff Dashboard"
        orgName={orgName}
        orgId={orgId}
        userId={userId}
        role="STAFF"
        range={range}
        onRangeChange={setRange}
      >
        <Link
          href="/app/requests/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create request
        </Link>
      </DashboardHeader>

      {data && (
        <>
          {pieData.length > 0 ? (
            <div className="min-h-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">My requests by status</h2>
              <p className="text-xs text-slate-500">{rangeLabel}</p>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <ChartEmptyState role="STAFF" rangeLabel={rangeLabel} actionHref="/app/requests/new" actionLabel="Create request" />
          )}

          {data.queues?.myDrafts && data.queues.myDrafts.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">My drafts</h2>
                <Link href="/app/requests?mine=1" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                  View all
                </Link>
              </div>
              <ul className="mt-2 space-y-2">
                {data.queues.myDrafts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <Link href={`/app/requests/${r.id}`} className="font-medium text-slate-900 hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-slate-600">{fmt(r.amountMinor)}</span>
                    <Link href={`/app/requests/${r.id}`} className="text-sm text-slate-600 hover:underline">
                      Continue
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <QueueEmptyState type="drafts" actionHref="/app/requests/new" actionLabel="Create request" />
          )}

          {data.queues?.myPending && data.queues.myPending.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">My pending</h2>
                <Link href="/app/requests?mine=1" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                  View all
                </Link>
              </div>
              <ul className="mt-2 space-y-2">
                {data.queues.myPending.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <Link href={`/app/requests/${r.id}`} className="font-medium text-slate-900 hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-slate-600">{fmt(r.amountMinor)}</span>
                    <Link href={`/app/requests/${r.id}`} className="text-sm text-slate-600 hover:underline">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <QueueEmptyState type="pending" actionHref="/app/requests?mine=1" actionLabel="View requests" />
          )}

          {data.queues?.actionNeeded && data.queues.actionNeeded.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">Action needed</h2>
              <ul className="mt-2 space-y-2">
                {data.queues.actionNeeded.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <Link href={`/app/requests/${r.id}`} className="font-medium text-amber-900 hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-amber-700">{r.reason}</span>
                    <Link href={`/app/requests/${r.id}`} className="text-sm font-medium text-amber-800 hover:underline">
                      Fix
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
