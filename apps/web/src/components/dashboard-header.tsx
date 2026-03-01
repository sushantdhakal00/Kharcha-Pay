"use client";

import { TimeRangePicker, type TimeRangeValue } from "@/components/time-range-picker";
import { DashboardExports, type DashboardRole } from "@/components/dashboard-exports";
import { SkeletonBlock } from "@/components/skeleton";

export function DashboardHeader({
  title,
  orgName,
  orgId,
  userId,
  role,
  range,
  onRangeChange,
  exportsVisible = true,
  loading = false,
  children,
}: {
  title: string;
  orgName: string;
  orgId: string;
  userId: string;
  role: DashboardRole;
  range: TimeRangeValue;
  onRangeChange: (v: TimeRangeValue) => void;
  exportsVisible?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SkeletonBlock className="mb-2 h-6 w-48" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-9 w-24 rounded" />
          <SkeletonBlock className="h-9 w-32 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div data-tour="dashboard.header" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{orgName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <TimeRangePicker orgId={orgId} userId={userId} value={range} onChange={onRangeChange} />
        {exportsVisible && (
          <DashboardExports orgId={orgId} role={role} fromISO={range.fromISO} toISO={range.toISO} />
        )}
      </div>
    </div>
  );
}
