"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { type TimeRangeValue } from "@/components/time-range-picker";
import { DashboardHeader } from "@/components/dashboard-header";
import { formatAmount } from "@/components/format-amount";
import { ChartEmptyState } from "@/components/empty-state";
import { SkeletonCard, SkeletonChart } from "@/components/skeleton";

import { useSmoothLoading } from "@/lib/use-smooth-loading";
import {
  BarChart,
  Bar,
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
  kpis: { paidSpendMinor: string };
  spendSeries: Array<{ bucketLabel: string; paidSpendMinor: string }>;
  verificationSeries?: Array<{
    bucketLabel: string;
    verifiedCount: number;
    warningCount: number;
    failedCount: number;
    notCheckedCount: number;
  }>;
};

export function AuditorDashboardClient({
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
      `/api/orgs/${orgId}/dashboard-v2?from=${range.fromISO}&to=${range.toISO}&bucket=${range.bucket}&role=AUDITOR`
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
        <DashboardHeader title="Auditor Dashboard" orgName={orgName} orgId={orgId} userId={userId} role="AUDITOR" range={range} onRangeChange={setRange} loading />
        <SkeletonCard />
        <SkeletonChart />
        <SkeletonChart />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader title="Auditor Dashboard" orgName={orgName} orgId={orgId} userId={userId} role="AUDITOR" range={range} onRangeChange={setRange} />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/payments"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Payments ledger
        </Link>
        <Link
          href="/app/audit"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Audit log
        </Link>
        <Link
          href="/app/reports"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Reports
        </Link>
        <Link
          href="/app/compliance"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Compliance
        </Link>
      </div>

      {data && (
        <>
          <div className="flex min-h-[88px] flex-col justify-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Paid spend (range)</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {fmt(data.kpis?.paidSpendMinor ?? "0")}
            </p>
          </div>

          {data.spendSeries && data.spendSeries.length > 0 ? (
            <div className="min-h-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Paid spend over time</h2>
              <p className="text-xs text-slate-500">{rangeLabel}</p>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.spendSeries.map((s) => ({
                      ...s,
                      paid: Number(s.paidSpendMinor) / 100,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number | undefined) => (v != null ? fmt(String(Math.round(v * 100))) : "")} />
                    <Legend />
                    <Line type="monotone" dataKey="paid" name="Paid" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <ChartEmptyState role="AUDITOR" rangeLabel={rangeLabel} actionHref="/app/payments" actionLabel="Payments ledger" />
          )}

          {data.verificationSeries && data.verificationSeries.length > 0 ? (
            <div className="min-h-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Verification status over time</h2>
              <p className="text-xs text-slate-500">{rangeLabel}</p>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.verificationSeries}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="verifiedCount" stackId="a" fill="#10b981" name="Verified" />
                    <Bar dataKey="warningCount" stackId="a" fill="#f59e0b" name="Warning" />
                    <Bar dataKey="failedCount" stackId="a" fill="#ef4444" name="Failed" />
                    <Bar dataKey="notCheckedCount" stackId="a" fill="#94a3b8" name="Not checked" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <ChartEmptyState role="AUDITOR" rangeLabel={rangeLabel} actionHref="/app/payments" actionLabel="Payments ledger" />
          )}
        </>
      )}
    </div>
  );
}
