"use client";

import Link from "next/link";

export function EmptyStateCard({
  message,
  ctaLabel,
  ctaHref,
  secondaryHref,
  secondaryLabel,
}: {
  message: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 dark:border-slate-600 dark:bg-slate-900/50">
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link
          href={ctaHref}
          className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {ctaLabel}
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link
            href={secondaryHref}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
