import { prisma } from "./db";
import type { ApiUser } from "@kharchapay/shared";
import { OrgRole, OrgStatus } from "@prisma/client";
import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE = "kharchapay_active_org_id";

export interface ActiveOrg {
  id: string;
  name: string;
  slug: string;
  isDemo?: boolean;
}

export interface ActiveOrgWithRole extends ActiveOrg {
  role: OrgRole;
}

export interface ActiveOrgWithStatus extends ActiveOrg {
  status: OrgStatus;
  setupPaymentIntentId?: string | null;
}

/**
 * Returns the active org for the user. Checks cookie first; otherwise prefers non-demo orgs.
 * Excludes orgs in PENDING_PAYMENT/PENDING_TERMS when choosing default (they use onboarding flow).
 */
export async function getActiveOrgForUser(user: ApiUser): Promise<ActiveOrg | null> {
  const withStatus = await getActiveOrgWithStatusForUser(user);
  if (!withStatus) return null;
  if (withStatus.status !== "ACTIVE" && !withStatus.isDemo) return null;
  return {
    id: withStatus.id,
    name: withStatus.name,
    slug: withStatus.slug,
    isDemo: withStatus.isDemo,
  };
}

/**
 * Returns active org with status. Used for redirect logic when org is PENDING_PAYMENT or PENDING_TERMS.
 */
export async function getActiveOrgWithStatusForUser(
  user: ApiUser
): Promise<ActiveOrgWithStatus | null> {
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (activeOrgId) {
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: activeOrgId, userId: user.id } },
      include: { org: { include: { setupPaymentIntent: true } } },
    });
    if (m) {
      return {
        id: m.org.id,
        name: m.org.name,
        slug: m.org.slug,
        isDemo: m.org.isDemo ?? false,
        status: m.org.status,
        setupPaymentIntentId: m.org.setupPaymentIntent?.id,
      };
    }
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { org: { include: { setupPaymentIntent: true } } },
  });
  const first =
    memberships.find((m) => !m.org.isDemo && m.org.status === "ACTIVE") ??
    memberships.find((m) => !m.org.isDemo) ??
    memberships[0];
  if (!first) return null;
  return {
    id: first.org.id,
    name: first.org.name,
    slug: first.org.slug,
    isDemo: first.org.isDemo ?? false,
    status: first.org.status,
    setupPaymentIntentId: first.org.setupPaymentIntent?.id,
  };
}

/** Returns active org plus the user's role in that org. Prefers ACTIVE orgs. */
export async function getActiveOrgWithRole(user: ApiUser): Promise<ActiveOrgWithRole | null> {
  const withStatus = await getActiveOrgWithStatusForUser(user);
  if (!withStatus) return null;
  if (withStatus.status !== "ACTIVE" && !withStatus.isDemo) return null;

  const m = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: withStatus.id, userId: user.id } },
  });
  if (!m) return null;

  return { ...withStatus, role: m.role };
}
