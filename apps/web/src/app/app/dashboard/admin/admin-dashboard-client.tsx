"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { type TimeRangeValue } from "@/components/time-range-picker";
import { DashboardHeader } from "@/components/dashboard-header";
import { formatAmount } from "@/components/format-amount";
import { BlockReasonBadge } from "@/components/status-badge";
import { KPIGrid, buildAdminKPIs } from "@/components/dashboard/kpi-grid";
import { AttentionNeeded } from "@/components/dashboard/attention-needed";
import { SpendCumulativeChart } from "@/components/dashboard/spend-cumulative-chart";
import { DepartmentSpendTable } from "@/components/dashboard/department-spend-table";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { DepartmentsEmptyState } from "@/components/empty-state";
import { SkeletonCard, SkeletonChart, SkeletonTable, SkeletonQueueRow } from "@/components/skeleton";
import { SetupChecklist } from "@/components/setup-checklist";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useSmoothLoading } from "@/lib/use-smooth-loading";

type DashboardData = {
  org: { id: string; name: string; currency: string };
  range: { from: string; to: string; bucket: string };
  kpis: {
    totalBudgetMinor: string;
    approvedSpendMinor: string;
    paidSpendMinor: string;
    remainingMinor: string;
    burnRateMinor: string;
    budgetUsedPct?: number;
    runwayDays?: number;
    pendingApprovalsCount?: number;
    overdueApprovalsCount?: number;
  };
  counts: Record<string, number>;
  departmentsTable: Array<{
    departmentId: string;
    departmentName: string;
    budgetMinor: string;
    approvedSpendMinor: string;
    paidSpendMinor: string;
    remainingMinor: string;
  }>;
  spendSeries: Array<{ bucketLabel: string; approvedSpendMinor: string; paidSpendMinor: string }>;
  attentionAlerts?: Array<{ severity: "high" | "medium" | "low"; message: string; href: string }>;
  queues?: {
    paymentsReady: Array<{
      id: string;
      title: string;
      amountMinor: string;
      departmentName: string;
      vendorName: string;
    }>;
    policyBlocked: Array<{
      id: string;
      title: string;
      amountMinor: string;
      blockReason: string;
    }>;
  };
};

function isInternalMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" ||
    process.env.NEXT_PUBLIC_INTERNAL_MODE === "true"
  );
}

export function AdminDashboardClient({
  orgId,
  orgName,
  currency,
  userId,
  isDemo = false,
  orgSlug = "",
}: {
  orgId: string;
  orgName: string;
  currency: string;
  userId: string;
  isDemo?: boolean;
  orgSlug?: string;
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
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shortcutIds, setShortcutIds] = useState<{
    draftId: string | null;
    pendingId: string | null;
    approvedId: string | null;
    paidId: string | null;
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const showDemoShortcuts =
    (isDemo || orgSlug === "demo-org") && isInternalMode();
  const showSkeleton = useSmoothLoading(loading);

  useEffect(() => {
    if (showDemoShortcuts) {
      fetch(`/api/demo/shortcut-ids?orgId=${orgId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) setShortcutIds(d);
        })
        .catch(() => {});
    }
  }, [showDemoShortcuts, orgId]);

  useEffect(() => {
    if (!range.fromISO || !range.toISO) return;
    setLoading(true);
    setError(null);
    const bucket = range.bucket ?? "day";
    fetch(
      `/api/orgs/${orgId}/dashboard-v2?from=${range.fromISO}&to=${range.toISO}&bucket=${bucket}&role=ADMIN`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [orgId, range]);

  const handlePay = async (requestId: string) => {
    setPaying(requestId);
    setError(null);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/requests/${requestId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? result.code ?? "Payment failed");
        return;
      }
      if (range.fromISO && range.toISO) {
        const r = await fetch(
          `/api/orgs/${orgId}/dashboard-v2?from=${range.fromISO}&to=${range.toISO}&bucket=${range.bucket ?? "day"}&role=ADMIN`
        );
        const d = await r.json();
        if (!d.error) setData(d);
      }
    } catch {
      setError("Payment failed");
    } finally {
      setPaying(null);
    }
  };

  const fmt = (minor: string) => formatAmount(minor, currency);
  const rangeLabel = data?.range ? `Range: ${data.range.from} → ${data.range.to}` : undefined;

  if (showSkeleton && !data) {
    return (
      <div className="space-y-6">
        <DashboardHeader
          title="Admin Dashboard"
          orgName={orgName}
          orgId={orgId}
          userId={userId}
          role="ADMIN"
          range={range}
          onRangeChange={setRange}
          loading
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonChart />
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <SkeletonQueueRow />
          <SkeletonQueueRow />
        </div>
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-5 dashboard-content-enter">
      <DashboardHeader
        title="Admin Dashboard"
        orgName={orgName}
        orgId={orgId}
        userId={userId}
        role="ADMIN"
        range={range}
        onRangeChange={setRange}
      />

      <SetupChecklist orgId={orgId} />

      {showDemoShortcuts && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Demo Shortcuts
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            One-click links for the 3-minute demo flow.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/requests/new"
              className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700"
            >
              New Request
            </Link>
            {shortcutIds?.pendingId && (
              <Link
                href={`/app/requests/${shortcutIds.pendingId}`}
                className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800"
              >
                Pending request
              </Link>
            )}
            {shortcutIds?.approvedId && (
              <Link
                href={`/app/requests/${shortcutIds.approvedId}`}
                className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
              >
                Approved request
              </Link>
            )}
            {shortcutIds?.paidId && (
              <Link
                href={`/app/requests/${shortcutIds.paidId}?proof=1`}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800"
              >
                Paid request
              </Link>
            )}
            <button
              type="button"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                setError(null);
                try {
                  const res = await fetchWithCsrf("/api/demo/reset-deterministic", {
                    method: "POST",
                  });
                  const result = await res.json();
                  if (!res.ok) {
                    setError(result.error ?? "Reset failed");
                    return;
                  }
                  if (result.requestIds) setShortcutIds(result.requestIds);
                  window.location.reload();
                } catch {
                  setError("Reset failed");
                } finally {
                  setResetting(false);
                }
              }}
              className="rounded border border-slate-400 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {resetting ? "Resetting…" : "Reset demo"}
            </button>
          </div>
        </div>
      )}

      {showDemoShortcuts && (
        <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-800 dark:bg-indigo-950/40">
          <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
            Guided Demo Flow
          </h2>
          <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
            Step through the 3-minute demo — each action auto-advances to the next.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {shortcutIds?.draftId && (
              <Link
                href={`/app/requests/${shortcutIds.draftId}`}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                1) Submit Draft
              </Link>
            )}
            {shortcutIds?.pendingId && (
              <Link
                href={`/app/requests/${shortcutIds.pendingId}`}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                2) Approve Pending
              </Link>
            )}
            {shortcutIds?.approvedId && (
              <Link
                href={`/app/requests/${shortcutIds.approvedId}`}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                3) Pay Approved
              </Link>
            )}
            {shortcutIds?.paidId && (
              <Link
                href={`/app/requests/${shortcutIds.paidId}?proof=1`}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                4) View Proof
              </Link>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
          <Link href="/app/requests" className="ml-2 font-medium underline">
            Go to requests
          </Link>
        </div>
      )}

      {data && (
        <>
          <KPIGrid kpis={buildAdminKPIs(data, fmt)} />

          <AttentionNeeded
            alerts={data.attentionAlerts ?? []}
            role="ADMIN"
          />

          <SpendCumulativeChart
            spendSeries={data.spendSeries ?? []}
            totalBudgetMinor={data.kpis.totalBudgetMinor}
            currency={currency}
            rangeLabel={rangeLabel}
            emptyHref="/app/requests/new"
            emptyCta="Create request"
          />

          {data.queues?.paymentsReady && data.queues.paymentsReady.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payments ready</h2>
                <Link href="/app/payments" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                  View all
                </Link>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-2 py-1 text-left font-medium">Request</th>
                      <th className="px-2 py-1 text-left font-medium">Department</th>
                      <th className="px-2 py-1 text-left font-medium">Vendor</th>
                      <th className="px-2 py-1 text-right font-medium">Amount</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.queues.paymentsReady.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1">
                          <Link href={`/app/requests/${r.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                            {r.title}
                          </Link>
                        </td>
                        <td className="px-2 py-1 text-slate-600 dark:text-slate-400">{r.departmentName}</td>
                        <td className="px-2 py-1 text-slate-600 dark:text-slate-400">{r.vendorName}</td>
                        <td className="px-2 py-1 text-right font-medium">{fmt(r.amountMinor)}</td>
                        <td className="px-2 py-1">
                          <button
                            onClick={() => handlePay(r.id)}
                            disabled={!!paying}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                          >
                            {paying === r.id ? "Paying…" : "Pay"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyStateCard
              message={
                (data.counts?.pendingApprovalsCount ?? 0) > 0
                  ? `You have ${data.counts.pendingApprovalsCount} pending approvals. Review requests to proceed.`
                  : "No requests yet. Create your first request to start tracking approvals and spend."
              }
              ctaLabel={(data.counts?.pendingApprovalsCount ?? 0) > 0 ? "Review requests" : "Create request"}
              ctaHref={(data.counts?.pendingApprovalsCount ?? 0) > 0 ? "/app/requests?status=PENDING&mine=0" : "/app/requests/new"}
              secondaryHref="/app/docs"
              secondaryLabel="Docs"
            />
          )}

          {data.queues?.policyBlocked && data.queues.policyBlocked.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Policy blocked</h2>
                <Link href="/app/requests" className="text-sm font-medium text-amber-800 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100">
                  View all
                </Link>
              </div>
              <ul className="mt-2 space-y-2">
                {data.queues.policyBlocked.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm sm:flex-nowrap">
                    <Link href={`/app/requests/${r.id}`} className="font-medium text-amber-900 hover:underline dark:text-amber-200">
                      {r.title}
                    </Link>
                    <BlockReasonBadge reason={r.blockReason} />
                    <Link href={`/app/requests/${r.id}`} className="shrink-0 text-amber-700 hover:underline dark:text-amber-300">
                      Fix
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DepartmentSpendTable
            rows={data.departmentsTable}
            currency={currency}
            emptyContent={<DepartmentsEmptyState />}
          />
        </>
      )}
    </div>
  );
}
