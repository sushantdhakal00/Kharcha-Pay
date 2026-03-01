"use client";

import type { OrgRole } from "@prisma/client";
import { hasPermission, isInternalMode, type Permission } from "./rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission: Permission;
  section: NavSection;
  tourId?: string;
  badge?: () => { count: number; label?: string } | null;
};

export type NavSection =
  | "overview"   // Demo-first: Dashboard, New Request, Approvals, Payments, Vendors, Reports
  | "more"       // All other nav items
  | "internal";

const ICONS = {
  layout: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  ),
  file: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  creditCard: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  chart: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  document: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  shield: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  clipboard: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  cog: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  building: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  lock: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  plus: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  wrench: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  chat: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  link: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  checkCircle: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

/** All nav items – permission-driven; badges resolved at render time.
 *  Demo-first: overview = top 6, more = everything else, internal = demo/debug. */
export const NAV_ITEMS: NavItem[] = [
  // Top (demo-critical) – always shown when permitted
  { label: "Dashboard", href: "/app/dashboard", icon: ICONS.layout, permission: "dashboard", section: "overview", tourId: "sidebar.dashboard" },
  { label: "New request", href: "/app/requests/new", icon: ICONS.plus, permission: "new_request", section: "overview", tourId: "sidebar.new-request" },
  { label: "Approvals", href: "/app/approvals", icon: ICONS.checkCircle, permission: "approvals", section: "overview", tourId: "sidebar.approvals" },
  { label: "Payments", href: "/app/payments", icon: ICONS.creditCard, permission: "payments", section: "overview", tourId: "sidebar.payments" },
  { label: "Vendors", href: "/app/vendors", icon: ICONS.users, permission: "vendors", section: "overview", tourId: "sidebar.vendors" },
  { label: "Reports", href: "/app/reports", icon: ICONS.chart, permission: "reports", section: "overview", tourId: "sidebar.reports" },
  // More – under "More" group
  { label: "Team Chat", href: "/app/chat", icon: ICONS.chat, permission: "chat", section: "more", tourId: "sidebar.chat" },
  { label: "Requests", href: "/app/requests", icon: ICONS.file, permission: "requests", section: "more", tourId: "sidebar.requests" },
  { label: "Purchase Orders", href: "/app/pos", icon: ICONS.document, permission: "purchase_orders", section: "more", tourId: "sidebar.purchase-orders" },
  { label: "Receipts", href: "/app/receipts", icon: ICONS.clipboard, permission: "receipts", section: "more", tourId: "sidebar.receipts" },
  { label: "Invoices", href: "/app/invoices", icon: ICONS.file, permission: "invoices", section: "more", tourId: "sidebar.invoices" },
  { label: "Audit log", href: "/app/audit", icon: ICONS.clipboard, permission: "audit_log", section: "more", tourId: "sidebar.audit-log" },
  { label: "Compliance", href: "/app/compliance", icon: ICONS.shield, permission: "compliance", section: "more", tourId: "sidebar.compliance" },
  { label: "Security check", href: "/app/security-check", icon: ICONS.lock, permission: "security_check", section: "more" },
  { label: "Ops", href: "/app/settings/ops", icon: ICONS.wrench, permission: "ops", section: "more" },
  { label: "System & Treasury", href: "/app/settings/system", icon: ICONS.cog, permission: "ops", section: "more" },
  { label: "Setup", href: "/app/setup", icon: ICONS.cog, permission: "setup", section: "more", tourId: "sidebar.setup" },
  { label: "Departments", href: "/app/settings/departments", icon: ICONS.building, permission: "departments", section: "more" },
  { label: "Budgets", href: "/app/settings/budgets", icon: ICONS.chart, permission: "budgets", section: "more" },
  { label: "Members", href: "/app/settings/members", icon: ICONS.users, permission: "members", section: "more", tourId: "sidebar.members" },
  { label: "Approval policy", href: "/app/settings/approval-policy", icon: ICONS.document, permission: "approval_policy", section: "more" },
  { label: "Spend policy", href: "/app/settings/spend-policy", icon: ICONS.document, permission: "spend_policy", section: "more" },
  { label: "Matching & Controls", href: "/app/settings/matching", icon: ICONS.document, permission: "approval_policy", section: "more" },
  { label: "GL Codes", href: "/app/settings/gl-codes", icon: ICONS.document, permission: "departments", section: "more" },
  { label: "Audit retention", href: "/app/settings/audit-retention", icon: ICONS.clipboard, permission: "audit_retention", section: "more" },
  { label: "Integrations", href: "/app/settings/integrations", icon: ICONS.link, permission: "integrations", section: "more" },
  { label: "Docs", href: "/app/docs", icon: ICONS.document, permission: "docs", section: "more" },
  // Internal
  { label: "Demo", href: "/app/demo", icon: ICONS.chart, permission: "demo", section: "internal" },
  { label: "Solana CT Demo", href: "/app/solana/confidential-demo", icon: ICONS.chart, permission: "solana_ct_demo", section: "internal" },
  { label: "Debug", href: "/app/debug", icon: ICONS.wrench, permission: "debug", section: "internal" },
];

export const SECTION_ORDER: NavSection[] = ["overview", "more", "internal"];

export const SECTION_LABELS: Record<NavSection, string> = {
  overview: "Overview",
  more: "More",
  internal: "Internal",
};

/** Get nav items visible to user. Supports multiple roles (union). Internal section only if internal mode + Admin. */
export function getNavItemsForRole(role: OrgRole, rolesOverride?: OrgRole[]): NavItem[] {
  const roles = rolesOverride ?? [role];
  return NAV_ITEMS.filter((item) => {
    if (item.section === "internal" && !isInternalMode()) return false;
    return hasPermission(roles, item.permission);
  });
}
