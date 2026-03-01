"use client";

import { useState, useRef, useEffect } from "react";

export type DashboardRole = "ADMIN" | "APPROVER" | "STAFF" | "AUDITOR";

type ExportItem = {
  label: string;
  href: string;
  disabled?: boolean;
  tooltip?: string;
};

function isSingleMonth(fromISO: string, toISO: string): boolean {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  return from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
}

export function DashboardExports({
  orgId,
  role,
  fromISO,
  toISO,
  className = "",
}: {
  orgId: string;
  role: DashboardRole;
  fromISO: string;
  toISO: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const base = `/api/orgs/${orgId}/exports`;
  const fromTo = `from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
  const singleMonth = isSingleMonth(fromISO, toISO);
  const year = fromISO ? new Date(fromISO).getFullYear() : new Date().getFullYear();
  const month = fromISO ? new Date(fromISO).getMonth() + 1 : new Date().getMonth() + 1;

  const budgetHref = singleMonth
    ? `${base}/budget-vs-actual?year=${year}&month=${month}`
    : "#";
  const budgetDisabled = !singleMonth;

  const items: ExportItem[] = [];

  if (role === "STAFF") {
    items.push({
      label: "My requests CSV",
      href: `${base}/requests?${fromTo}&mine=1`,
    });
  } else if (role === "APPROVER") {
    items.push({
      label: "Requests CSV",
      href: `${base}/requests?${fromTo}`,
    });
  } else if (role === "ADMIN") {
    items.push({
      label: "Budget vs Actual CSV",
      href: budgetHref,
      disabled: budgetDisabled,
      tooltip: budgetDisabled ? "Budget export is month-based. Select a single month." : undefined,
    });
    items.push({ label: "Requests CSV", href: `${base}/requests?${fromTo}` });
    items.push({ label: "Payments CSV", href: `${base}/payments?${fromTo}` });
    items.push({
      label: "Audit CSV",
      href: `${base}/audit?${fromTo}`,
    });
  } else if (role === "AUDITOR") {
    items.push({ label: "Requests CSV", href: `${base}/requests?${fromTo}` });
    items.push({ label: "Payments CSV", href: `${base}/payments?${fromTo}` });
    items.push({
      label: "Budget vs Actual CSV",
      href: budgetHref,
      disabled: budgetDisabled,
      tooltip: budgetDisabled ? "Budget export is month-based. Select a single month." : undefined,
    });
  }

  if (items.length === 0) return null;

  const handleExport = (item: ExportItem) => {
    if (item.disabled) return;
    setOpen(false);
    window.open(item.href, "_blank", "noopener");
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Exports
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleExport(item)}
              disabled={item.disabled}
              title={item.tooltip}
              className={`flex w-full px-4 py-2 text-left text-sm ${
                item.disabled
                  ? "cursor-not-allowed text-slate-400"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
              {item.tooltip && item.disabled && (
                <span className="ml-1 text-slate-400" title={item.tooltip}>
                  *
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
