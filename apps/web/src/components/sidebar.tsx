"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  getNavItemsForRole,
  SECTION_ORDER,
  SECTION_LABELS,
  type NavItem,
  type NavSection,
} from "@/lib/nav-config";
import { useViewAsRole } from "./view-as-role-context";
import type { OrgRole } from "@prisma/client";

const STORAGE_KEY = "kharchapay_sidebar_collapsed";
const INTERNAL_COLLAPSED_KEY = "kharchapay_internal_collapsed";

function getStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setStoredCollapsed(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {}
}

function getInternalCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(INTERNAL_COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
}

function setInternalCollapsed(v: boolean) {
  try {
    localStorage.setItem(INTERNAL_COLLAPSED_KEY, v ? "1" : "0");
  } catch {}
}

type NavBadges = {
  pendingApprovals: number;
  overdueApprovals: number;
  paymentsReady: number;
  blockedPayments: number;
  invoiceExceptions?: number;
  invoicesOverdueVerification?: number;
  chatUnread?: number;
};

function getBadgeForItem(item: NavItem, badges: NavBadges | null): { count: number; label?: string } | null {
  if (!badges) return null;
  if (item.permission === "approvals") {
    const total = badges.pendingApprovals;
    if (total === 0) return null;
    return {
      count: total,
      label: badges.overdueApprovals > 0 ? `${badges.overdueApprovals} overdue` : undefined,
    };
  }
  if (item.permission === "payments") {
    const blocked = badges.blockedPayments;
    const ready = badges.paymentsReady;
    if (blocked > 0) return { count: blocked, label: "blocked" };
    if (ready > 0) return { count: ready, label: "ready" };
  }
  if (item.permission === "invoices") {
    const exceptions = badges.invoiceExceptions ?? 0;
    const overdue = badges.invoicesOverdueVerification ?? 0;
    if (exceptions > 0) return { count: exceptions, label: "exceptions" };
    if (overdue > 0) return { count: overdue, label: "overdue" };
  }
  return null;
}

export function Sidebar({
  role,
  orgName,
  orgId,
  userId,
  collapsed: initialCollapsed,
}: {
  role: OrgRole;
  orgName: string | null;
  orgId?: string | null;
  userId?: string | null;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const viewAs = useViewAsRole();
  const [collapsed, setCollapsedState] = useState(initialCollapsed ?? false);
  const [internalCollapsed, setInternalCollapsedState] = useState(true);
  const [badges, setBadges] = useState<NavBadges | null>(null);

  useEffect(() => {
    if (initialCollapsed === undefined) setCollapsedState(getStoredCollapsed());
    setInternalCollapsedState(getInternalCollapsed());
  }, [initialCollapsed]);

  const roles = viewAs?.viewAsRole ? [viewAs.viewAsRole] : [role];
  const items = getNavItemsForRole(role, roles);

  useEffect(() => {
    if (!orgId || !userId) return;
    fetch(`/api/orgs/${orgId}/nav-badges`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setBadges(d);
      })
      .catch(() => {});
  }, [orgId, userId, role]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsedState(next);
    setStoredCollapsed(next);
  };

  const toggleInternal = () => {
    const next = !internalCollapsed;
    setInternalCollapsedState(next);
    setInternalCollapsed(next);
  };

  const bySection = SECTION_ORDER.reduce((acc, sectionId) => {
    acc[sectionId] = items.filter((i) => i.section === sectionId);
    return acc;
  }, {} as Record<NavSection, NavItem[]>);

  const width = collapsed ? "w-[72px]" : "w-[260px]";

  return (
    <aside
      className={`${width} flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-zinc-800 dark:bg-[#1E1E22] lg:flex`}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-zinc-800">
        {!collapsed && (
          <Link href="/app" className="font-semibold text-slate-900 dark:text-slate-100">
            KharchaPay
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-50"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {SECTION_ORDER.map((sectionId) => {
          const sectionItems = bySection[sectionId];
          if (!sectionItems || sectionItems.length === 0) return null;

          const isInternal = sectionId === "internal";
          const isInternalCollapsed = isInternal && internalCollapsed;

          if (isInternal && isInternalCollapsed) {
            return (
              <div key={sectionId} className="mb-4">
                <button
                  type="button"
                  onClick={toggleInternal}
                  className="mb-2 flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {SECTION_LABELS[sectionId]}
                  <svg className="h-4 w-4 rotate-[-90deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            );
          }

          return (
            <div key={sectionId} className="mb-4">
              {!collapsed && (
                <div className="flex items-center justify-between">
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    {SECTION_LABELS[sectionId] ?? sectionId}
                  </p>
                  {isInternal && (
                    <button
                      type="button"
                      onClick={toggleInternal}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label="Collapse section"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/app/dashboard" && pathname.startsWith(item.href.split("?")[0] + "/"));
                  const activeDashboard =
                    item.href.startsWith("/app/dashboard") && pathname.startsWith("/app/dashboard");
                  const active = isActive || activeDashboard;
                  const badge = getBadgeForItem(item, badges);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-tour={item.tourId ?? undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-slate-100 font-medium text-slate-900 ring-1 ring-inset ring-slate-900/5 dark:bg-zinc-700/50 dark:text-stone-100 dark:ring-zinc-600"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        } ${collapsed ? "justify-center px-2" : ""}`}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        {!collapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {badge && badge.count > 0 && (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                                  badge.label && (badge.label.includes("overdue") || badge.label === "blocked")
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                }`}
                                title={badge.label}
                              >
                                {badge.count}
                              </span>
                            )}
                          </>
                        )}
                        {active && !collapsed && !badge && (
                          <span className="ml-auto h-2 w-1 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {orgName && !collapsed && (
        <div className="border-t border-slate-200 p-3 dark:border-zinc-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-300">Active org</p>
          <p className="truncate text-sm text-slate-900 dark:text-slate-100">{orgName}</p>
        </div>
      )}
    </aside>
  );
}
