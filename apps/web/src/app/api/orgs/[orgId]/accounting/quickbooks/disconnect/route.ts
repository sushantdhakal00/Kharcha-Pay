/**
 * POST /api/orgs/[orgId]/accounting/quickbooks/disconnect
 * Disconnects QuickBooks. Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { revokeToken } from "@/lib/qbo/client";
import { decrypt } from "@/lib/encryption";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  await requireCsrf(req);
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const conn = await prisma.accountingConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
  });
  if (!conn) {
    return NextResponse.json({ ok: true });
  }
  if (conn.accessTokenEncrypted) {
    try {
      const token = decrypt(conn.accessTokenEncrypted);
      await revokeToken(token);
    } catch {
      // best-effort revoke
    }
  }
  await prisma.accountingConnection.update({
    where: { id: conn.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      realmId: null,
      errorMessage: null,
    },
  });
  return NextResponse.json({ ok: true });
}
