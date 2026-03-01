"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatAmount } from "@/components/format-amount";

type Row = {
  departmentId: string;
  departmentName: string;
  budgetMinor: string;
  approvedSpendMinor: string;
  paidSpendMinor: string;
  remainingMinor: string;
};

function pctStatus(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  if (pct >= 60) return "bg-slate-400";
  return "bg-emerald-500";
}

export function DepartmentSpendTable({
  rows,
  currency,
  emptyContent,
}: {
  rows: Row[];
  currency: string;
  emptyContent?: React.ReactNode;
}) {
  const [sortBy, setSortBy] = useState<"pct" | "name" | "spend">("pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const withPct = rows.map((r) => {
      const budget = Number(r.budgetMinor);
      const approved = Number(r.approvedSpendMinor);
      const pct = budget > 0 ? (approved / budget) * 100 : 0;
      return { ...r, pct };
    });
    withPct.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "pct") cmp = a.pct - b.pct;
      else if (sortBy === "name") cmp = a.departmentName.localeCompare(b.departmentName);
      else cmp = Number(a.approvedSpendMinor) - Number(b.approvedSpendMinor);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return withPct;
  }, [rows, sortBy, sortDir]);

  const fmt = (minor: string) => formatAmount(minor, currency);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setSortBy(col);
  };

  if (rows.length === 0 && emptyContent) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
          Spend by Department
        </h2>
        <div className="p-6">{emptyContent}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
        Spend by Department
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              <th className="px-4 py-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                >
                  Department
                </button>
              </th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Budget</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Spend</th>
              <th className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("pct")}
                  className="font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                >
                  % Used
                </button>
              </th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Remaining</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const pct = row.pct;
              const status =
                pct >= 90 ? "Over budget risk" : pct >= 80 ? "Warning" : pct >= 60 ? "On track" : "Healthy";
              return (
                <tr
                  key={row.departmentId}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/app/requests?department=${row.departmentId}`}
                      className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                    >
                      {row.departmentName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">
                    {fmt(row.budgetMinor)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">
                    {fmt(row.approvedSpendMinor)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 min-w-[60px] max-w-[100px] rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={`h-2 rounded-full ${pctStatus(pct)}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-slate-600 dark:text-slate-400">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                    {fmt(row.remainingMinor)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs ${
                        pct >= 90
                          ? "text-red-600 dark:text-red-400"
                          : pct >= 80
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
