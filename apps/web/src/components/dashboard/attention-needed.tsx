"use client";

import Link from "next/link";

type Alert = {
  severity: "high" | "medium" | "low";
  message: string;
  href: string;
};

export function AttentionNeeded({
  alerts,
  role,
}: {
  alerts: Alert[];
  role: "ADMIN" | "APPROVER" | "STAFF" | "AUDITOR";
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>✔</span>
        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
          All systems normal
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <h2 className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
        ⚠ Attention Needed
      </h2>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {alerts.slice(0, 6).map((a, i) => (
          <li key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                a.severity === "high"
                  ? "bg-red-500"
                  : a.severity === "medium"
                    ? "bg-amber-500"
                    : "bg-slate-400"
              }`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">
              {a.message}
            </span>
            <Link
              href={a.href}
              className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              View →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
