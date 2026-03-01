"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getNavItemsForRole,
  SECTION_ORDER,
  SECTION_LABELS,
  type NavItem,
  type NavSection,
} from "@/lib/nav-config";
import { useViewAsRole } from "./view-as-role-context";
import type { OrgRole } from "@prisma/client";

type NavBadges = {
  pendingApprovals: number;
  overdueApprovals: number;
  paymentsReady: number;
  blockedPayments: number;
};

function getBadgeForItem(item: NavItem, badges: NavBadges | null): { count: number; label?: string } | null {
  if (!badges) return null;
  if (item.permission === "approvals") {
    const total = badges.pendingApprovals;
    if (total === 0) return null;
    return { count: total, label: badges.overdueApprovals > 0 ? `${badges.overdueApprovals} overdue` : undefined };
  }
  if (item.permission === "payments") {
    const blocked = badges.blockedPayments;
    const ready = badges.paymentsReady;
    if (blocked > 0) return { count: blocked, label: "blocked" };
    if (ready > 0) return { count: ready, label: "ready" };
  }
  return null;
}

const ICONS = {
  menu: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

export function MobileSidebarDrawer({
  role,
  orgName,
  orgId,
  userId,
  open,
  onClose,
}: {
  role: OrgRole;
  orgName: string | null;
  orgId?: string | null;
  userId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const viewAs = useViewAsRole();
  const [badges, setBadges] = useState<NavBadges | null>(null);

  const roles = viewAs?.viewAsRole ? [viewAs.viewAsRole] : [role];
  const items = getNavItemsForRole(role, roles);
  const bySection = SECTION_ORDER.reduce((acc, sectionId) => {
    acc[sectionId] = items.filter((i) => i.section === sectionId);
    return acc;
  }, {} as Record<NavSection, NavItem[]>);

  useEffect(() => {
    if (!orgId || !userId || (role !== "ADMIN" && role !== "APPROVER") || !open) return;
    fetch(`/api/orgs/${orgId}/nav-badges`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setBadges(d);
      })
      .catch(() => {});
  }, [orgId, userId, role, open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden dark:bg-black/60"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[260px] transform border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-[#1E1E22] lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-zinc-800">
          <Link href="/app" className="font-semibold text-slate-900 dark:text-slate-100" onClick={onClose}>
            KharchaPay
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close menu"
          >
            {ICONS.close}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {SECTION_ORDER.map((sectionId) => {
            const sectionItems = bySection[sectionId];
            if (!sectionItems || sectionItems.length === 0) return null;
            return (
              <div key={sectionId} className="mb-4">
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {SECTION_LABELS[sectionId] ?? sectionId}
                </p>
                <ul className="space-y-0.5">
                  {sectionItems.map((item) => {
                    const baseHref = item.href.split("?")[0];
                    const isActive =
                      pathname === baseHref ||
                      (baseHref !== "/app/dashboard" && pathname.startsWith(baseHref + "/"));
                    const activeDashboard = baseHref === "/app/dashboard" && pathname.startsWith("/app/dashboard");
                    const active = isActive || activeDashboard;
                    const badge = getBadgeForItem(item, badges);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                            active
                              ? "bg-slate-100 font-medium text-slate-900 dark:bg-zinc-700/50 dark:text-stone-100"
                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          {item.icon}
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {badge && badge.count > 0 && (
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                                badge.label && (badge.label.includes("overdue") || badge.label === "blocked")
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                  : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                              }`}
                            >
                              {badge.count}
                            </span>
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

        {orgName && (
          <div className="border-t border-slate-200 p-3 dark:border-zinc-800">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active org</p>
            <p className="truncate text-sm text-slate-900 dark:text-slate-100">{orgName}</p>
          </div>
        )}
      </div>
    </>
  );
}

export function MobileSidebarTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
      aria-label="Open menu"
    >
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
