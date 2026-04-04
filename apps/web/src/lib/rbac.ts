import type { OrgRole } from "@prisma/client";

/** Permission keys – single source of truth for nav + dashboard visibility */
export type Permission =
  | "dashboard"
  | "new_request"
  | "requests"
  | "approvals"
  | "payments"
  | "vendors"
  | "purchase_orders"
  | "receipts"
  | "invoices"
  | "reports"
  | "audit_log"
  | "compliance"
  | "security_check"
  | "ops"
  | "setup"
  | "departments"
  | "budgets"
  | "members"
  | "approval_policy"
  | "spend_policy"
  | "audit_retention"
  | "integrations"
  | "docs"
  | "demo"
  | "solana_ct_demo"
  | "debug"
  | "chat";

/** RBAC matrix: which roles have which permissions. Union for multi-role. */
export const PERMISSIONS_BY_ROLE: Record<OrgRole, Permission[]> = {
  STAFF: [
    "dashboard",
    "chat",
    "new_request",
    "requests",
    "payments",
    "purchase_orders",
    "receipts",
    "invoices",
    "reports",
    "setup",
    "docs",
    "vendors",
  ],
  APPROVER: [
    "dashboard",
    "chat",
    "new_request",
    "requests",
    "approvals",
    "payments",
    "purchase_orders",
    "receipts",
    "invoices",
    "reports",
    "setup",
    "docs",
    "vendors",
  ],
  ADMIN: [
    "dashboard",
    "chat",
    "new_request",
    "requests",
    "approvals",
    "payments",
    "vendors",
    "purchase_orders",
    "receipts",
    "invoices",
    "reports",
    "audit_log",
    "compliance",
    "security_check",
    "ops",
    "setup",
    "departments",
    "budgets",
    "members",
    "approval_policy",
    "spend_policy",
    "audit_retention",
    "integrations",
    "docs",
    "demo",
    "solana_ct_demo",
    "debug",
  ],
  AUDITOR: [
    "dashboard",
    "chat",
    "requests",
    "payments",
    "purchase_orders",
    "receipts",
    "invoices",
    "reports",
    "audit_log",
    "compliance",
    "docs",
  ],
};

/** Internal-only permissions: visible only when internal mode is on (Admin) */
export const INTERNAL_PERMISSIONS: Permission[] = ["demo", "solana_ct_demo", "debug"];

/** Whether internal section is enabled (env or feature flag) */
export function isInternalMode(): boolean {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" || process.env.NEXT_PUBLIC_INTERNAL_MODE === "true";
  }
  return process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" || process.env.NEXT_PUBLIC_INTERNAL_MODE === "true";
}

/** Check if user has a permission. Supports union for multiple roles. */
export function hasPermission(roles: OrgRole[], permission: Permission): boolean {
  const internalOnly = INTERNAL_PERMISSIONS.includes(permission);
  const showInternal = internalOnly ? isInternalMode() : true;
  if (internalOnly && !showInternal) return false;

  for (const role of roles) {
    if (PERMISSIONS_BY_ROLE[role]?.includes(permission)) return true;
  }
  return false;
}
