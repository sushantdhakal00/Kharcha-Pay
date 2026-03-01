"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SetupChecklistProps {
  orgId: string;
}

interface ChecklistState {
  departments: number;
  budgets: number;
  glCodes: number;
  vendors: number;
  hasQbo: boolean;
  hasPo: boolean;
  hasInvoice: boolean;
  dismissed: boolean;
}

export function SetupChecklist({ orgId }: SetupChecklistProps) {
  const [state, setState] = useState<ChecklistState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = `setup-checklist-dismissed-${orgId}`;
    const dismissed = typeof window !== "undefined" && localStorage.getItem(key) === "1";
    fetch(`/api/orgs/${orgId}/setup-checklist`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setState({
          departments: d.departments ?? 0,
          budgets: d.budgets ?? 0,
          glCodes: d.glCodes ?? 0,
          vendors: d.vendors ?? 0,
          hasQbo: !!d.hasQbo,
          hasPo: (d.purchaseOrders ?? 0) > 0,
          hasInvoice: (d.invoices ?? 0) > 0,
          dismissed,
        });
      })
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, [orgId]);

  const dismiss = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`setup-checklist-dismissed-${orgId}`, "1");
    setState((s) => (s ? { ...s, dismissed: true } : null));
  };

  if (loading || !state || state.dismissed) return null;

  const items = [
    { done: state.departments > 0, label: "Add Departments", href: "/app/settings/departments" },
    { done: state.budgets > 0, label: "Add Budgets", href: "/app/settings/budgets" },
    { done: state.glCodes > 0, label: "Add GL Codes", href: "/app/settings/gl-codes" },
    { done: state.vendors > 0, label: "Add Vendors", href: "/app/vendors" },
    { done: state.hasQbo, label: "Connect QuickBooks", href: "/app/settings/integrations/quickbooks" },
    { done: state.hasPo || state.hasInvoice, label: "Create first PO/Invoice", href: "/app/pos" },
  ];
  const completed = items.filter((i) => i.done).length;
  if (completed >= items.length) return null;

  return (
    <div data-tour="dashboard.setup-checklist" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-amber-900">Setup checklist</h3>
          <p className="mt-1 text-sm text-amber-800">
            Complete these steps to get the most out of KharchaPay.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className={item.done ? "text-green-600" : "text-amber-600"}>
                  {item.done ? "✓" : "○"}
                </span>
                {item.done ? (
                  <span className="text-slate-600 line-through">{item.label}</span>
                ) : (
                  <Link href={item.href} className="text-amber-900 underline hover:no-underline">
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-amber-700 hover:text-amber-900 text-sm"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
