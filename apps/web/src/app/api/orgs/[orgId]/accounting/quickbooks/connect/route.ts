/**
 * GET /api/orgs/[orgId]/accounting/quickbooks/connect
 * Redirects to Intuit OAuth consent. Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { getQboAuthUrl } from "@/lib/qbo/client";
import { env } from "@/lib/env";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  if (!env.QUICKBOOKS_CLIENT_ID) {
    return NextResponse.json({ error: "QuickBooks integration not configured" }, { status: 503 });
  }
  const baseUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/orgs/${orgId}/accounting/quickbooks/callback`;
  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id })).toString("base64url");
  const authUrl = getQboAuthUrl(redirectUri, state);
  return NextResponse.redirect(authUrl);
}
