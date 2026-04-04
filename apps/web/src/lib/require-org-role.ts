import { NextResponse } from "next/server";
import { prisma } from "./db";
import { OrgRole } from "@prisma/client";

const READ_ROLES: OrgRole[] = [OrgRole.ADMIN, OrgRole.APPROVER, OrgRole.STAFF, OrgRole.AUDITOR];
const WRITE_ROLES: OrgRole[] = [OrgRole.ADMIN, OrgRole.APPROVER, OrgRole.STAFF];

/**
 * Ensures the user has one of the given roles in the org. Returns the membership.
 * Throws 403 NextResponse if not a member or role not allowed.
 */
export async function requireOrgRole(
  orgId: string,
  userId: string,
  allowedRoles: OrgRole[]
): Promise<{ orgId: string; userId: string; role: OrgRole }> {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!allowedRoles.includes(membership.role)) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return {
    orgId: membership.orgId,
    userId: membership.userId,
    role: membership.role,
  };
}

/**
 * Read access: ADMIN, APPROVER, STAFF, AUDITOR. Use for GET endpoints.
 */
export async function requireOrgReadAccess(
  orgId: string,
  userId: string
): Promise<{ orgId: string; userId: string; role: OrgRole }> {
  return requireOrgRole(orgId, userId, READ_ROLES);
}

/**
 * Write access: ADMIN, APPROVER, STAFF only. AUDITOR gets 403 with code READ_ONLY_ROLE.
 * Use for POST/PUT/PATCH; call before requireOrgRole where needed.
 */
export async function requireOrgWriteAccess(
  orgId: string,
  userId: string
): Promise<{ orgId: string; userId: string; role: OrgRole }> {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (membership.role === OrgRole.AUDITOR) {
    throw NextResponse.json(
      { error: "Read-only role", code: "READ_ONLY_ROLE" },
      { status: 403 }
    );
  }
  if (!WRITE_ROLES.includes(membership.role)) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return {
    orgId: membership.orgId,
    userId: membership.userId,
    role: membership.role,
  };
}

/**
 * Ensures the user is any member of the org with write capability (no AUDITOR).
 */
export async function requireOrgMember(
  orgId: string,
  userId: string
): Promise<{ orgId: string; userId: string; role: OrgRole }> {
  return requireOrgRole(orgId, userId, WRITE_ROLES);
}
