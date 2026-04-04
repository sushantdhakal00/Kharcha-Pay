"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatAmount } from "@/components/format-amount";

type Point = {
  bucketLabel: string;
  approvedSpendMinor: string;
  paidSpendMinor: string;
  approved: number;
  paid: number;
  cumApproved: number;
  cumPaid: number;
};

export function SpendCumulativeChart({
  spendSeries,
  totalBudgetMinor,
  currency,
  rangeLabel,
  emptyHref,
  emptyCta,
}: {
  spendSeries: Array<{ bucketLabel: string; approvedSpendMinor: string; paidSpendMinor: string }>;
  totalBudgetMinor: string;
  currency: string;
  rangeLabel?: string;
  emptyHref: string;
  emptyCta: string;
}) {

  const chartData = useMemo(() => {
    if (!spendSeries?.length) return [];
    let cumApproved = 0;
    let cumPaid = 0;
    return spendSeries.map((s) => {
      const approved = Number(s.approvedSpendMinor) / 100;
      const paid = Number(s.paidSpendMinor) / 100;
      cumApproved += approved;
      cumPaid += paid;
      return {
        ...s,
        approved,
        paid,
        cumApproved,
        cumPaid,
      } as Point;
    });
  }, [spendSeries]);

  const budgetRef = totalBudgetMinor ? Number(totalBudgetMinor) / 100 : 0;

  const fmt = (minor: string) => formatAmount(minor, currency);

  if (!spendSeries?.length) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-8 dark:border-slate-600 dark:bg-slate-900/50">
        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          No financial activity yet. Create your first request to start tracking spend.
        </p>
        <Link
          href={emptyHref}
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Cumulative Approved vs Paid
          </h2>
          {rangeLabel && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{rangeLabel}</p>
          )}
        </div>
      </div>
      <div className="mt-2 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip
              formatter={(v: number | undefined) => (v != null ? fmt(String(Math.round(v * 100))) : "")}
              labelFormatter={(l) => l}
            />
            {budgetRef > 0 && (
              <ReferenceLine
                y={budgetRef}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: "Budget", position: "right" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="cumApproved"
              name="Cumulative Approved"
              stroke="#64748b"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="cumPaid"
              name="Cumulative Paid"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
