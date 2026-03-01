/**
 * GET /api/orgs/[orgId]/accounting/quickbooks/callback
 * OAuth callback from Intuit. Exchanges code for tokens and stores connection.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens } from "@/lib/qbo/client";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";

const SETTINGS_PATH = "/app/settings/integrations/quickbooks";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const realmId = searchParams.get("realmId");
    const error = searchParams.get("error");

    if (error) {
      const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.redirect(`${appUrl}${SETTINGS_PATH}?error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.redirect(`${appUrl}${SETTINGS_PATH}?error=missing_code`);
    }
    let parsed: { orgId?: string; userId?: string };
    try {
      parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    } catch {
      const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.redirect(`${appUrl}${SETTINGS_PATH}?error=invalid_state`);
    }
    if (parsed.orgId !== orgId || parsed.userId !== user.id) {
      const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.redirect(`${appUrl}${SETTINGS_PATH}?error=invalid_state`);
    }

    const baseUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/orgs/${orgId}/accounting/quickbooks/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const resolvedRealmId = realmId || tokens.realmId;
    if (!resolvedRealmId) {
      const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.redirect(`${appUrl}${SETTINGS_PATH}?error=no_realm`);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await prisma.accountingConnection.upsert({
      where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
      create: {
        orgId,
        provider: "QUICKBOOKS_ONLINE",
        status: "CONNECTED",
        realmId: resolvedRealmId,
        accessTokenEncrypted: encrypt(tokens.access_token),
        refreshTokenEncrypted: encrypt(tokens.refresh_token),
        tokenExpiresAt: expiresAt,
        connectedByUserId: user.id,
        errorMessage: null,
      },
      update: {
        status: "CONNECTED",
        realmId: resolvedRealmId,
        accessTokenEncrypted: encrypt(tokens.access_token),
        refreshTokenEncrypted: encrypt(tokens.refresh_token),
        tokenExpiresAt: expiresAt,
        connectedByUserId: user.id,
        errorMessage: null,
      },
    });

    const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(`${appUrl}${SETTINGS_PATH}?connected=1`);
  } catch (e) {
    console.error("[qbo callback]", e);
    const appUrl = env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(
      `${appUrl}${SETTINGS_PATH}?error=${encodeURIComponent((e as Error).message)}`
    );
  }
}
