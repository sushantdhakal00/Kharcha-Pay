"use client";

import { useMemo } from "react";
import { formatAmount } from "@/components/format-amount";

type KPI = {
  label: string;
  value: string | number;
  subtext?: string;
  status?: "healthy" | "warning" | "critical" | "neutral";
  trend?: "up" | "down" | "flat";
};

function statusToBorder(status: KPI["status"]) {
  switch (status) {
    case "healthy":
      return "border-l-4 border-l-emerald-500 dark:border-l-emerald-600";
    case "warning":
      return "border-l-4 border-l-amber-500 dark:border-l-amber-600";
    case "critical":
      return "border-l-4 border-l-red-500 dark:border-l-red-600";
    default:
      return "border-l-4 border-l-transparent";
  }
}

export function KPIGrid({
  kpis,
}: {
  kpis: Array<KPI & { display?: string }>;
}) {
  const rendered = useMemo(
    () =>
      kpis.map((k) => ({
        ...k,
        display: k.display ?? (typeof k.value === "number" ? String(k.value) : k.value),
      })),
    [kpis]
  );

  return (
    <div data-tour="dashboard.kpis" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {rendered.map((k, i) => (
        <div
          key={i}
          className={`flex min-h-[80px] flex-col justify-center rounded-lg border border-slate-200 bg-white pl-4 pr-4 py-3 shadow-sm transition-shadow hover:shadow dark:border-slate-700 dark:bg-slate-900 ${statusToBorder(k.status)}`}
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</p>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {k.display}
            </span>
            {k.trend && (
              <span
                className={`text-xs ${
                  k.trend === "up"
                    ? "text-amber-600 dark:text-amber-400"
                    : k.trend === "down"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-400"
                }`}
              >
                {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : "—"}
              </span>
            )}
          </div>
          {k.subtext && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{k.subtext}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function buildAdminKPIs(
  data: {
    kpis: {
      totalBudgetMinor: string;
      budgetUsedPct?: number;
      runwayDays?: number;
      burnRateMinor: string;
      pendingApprovalsCount?: number;
      overdueApprovalsCount?: number;
      remainingMinor: string;
      paidSpendMinor: string;
    };
    queues?: { policyBlocked?: unknown[]; paymentsReady?: unknown[] };
  },
  fmt: (minor: string) => string
): Array<KPI & { display?: string }> {
  const pct = data.kpis.budgetUsedPct ?? 0;
  const status = pct >= 90 ? "critical" : pct >= 75 ? "warning" : "healthy";
  const runway = data.kpis.runwayDays ?? 0;

  return [
    {
      label: "% Budget Used",
      value: `${pct.toFixed(1)}%`,
      display: `${pct.toFixed(1)}%`,
      subtext: pct >= 90 ? "Over budget risk" : pct >= 75 ? "Monitor closely" : "On track",
      status,
      trend: pct >= 75 ? "up" : undefined,
    },
    {
      label: "Projected Runway",
      value: runway >= 999 ? "∞" : `${runway} days`,
      display: runway >= 999 ? "∞" : `${runway} days`,
      subtext: runway < 30 ? "Low runway" : "On track",
      status: runway < 30 ? "critical" : runway < 90 ? "warning" : "healthy",
    },
    {
      label: "Burn Rate (30d)",
      value: data.kpis.burnRateMinor,
      display: fmt(data.kpis.burnRateMinor),
      subtext: "Monthly projection",
    },
    {
      label: "Pending Approvals",
      value: data.kpis.pendingApprovalsCount ?? 0,
      display: String(data.kpis.pendingApprovalsCount ?? 0),
      subtext:
        (data.kpis.overdueApprovalsCount ?? 0) > 0
          ? `${data.kpis.overdueApprovalsCount} overdue`
          : "On track",
      status:
        (data.kpis.overdueApprovalsCount ?? 0) > 0
          ? "critical"
          : (data.kpis.pendingApprovalsCount ?? 0) > 0
            ? "warning"
            : "healthy",
    },
    {
      label: "Blocked Payments",
      value: data.queues?.policyBlocked?.length ?? 0,
      display: String(data.queues?.policyBlocked?.length ?? 0),
      subtext:
        (data.queues?.policyBlocked?.length ?? 0) > 0 ? "Needs attention" : "None",
      status: (data.queues?.policyBlocked?.length ?? 0) > 0 ? "warning" : "neutral",
    },
    {
      label: "Remaining",
      value: data.kpis.remainingMinor,
      display: fmt(data.kpis.remainingMinor),
      subtext: "Budget headroom",
    },
  ];
}
