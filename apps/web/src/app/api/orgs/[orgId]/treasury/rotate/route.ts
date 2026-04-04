import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { requireCsrf } from "@/lib/auth";
import { env } from "@/lib/env";
import { rotateOrgTreasuryWallet } from "@/lib/treasury/treasury-service";
import { jsonResponse } from "@/lib/json-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const isDemo = env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
    const isDev = env.NODE_ENV !== "production";
    if (!isDemo && !isDev) {
      return jsonResponse(
        { error: "Rotate only available in demo or development", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const wallet = await rotateOrgTreasuryWallet(orgId);
    return jsonResponse({
      orgId: wallet.orgId,
      chain: wallet.chain,
      cluster: wallet.cluster,
      treasuryPubkey: wallet.treasuryPubkey,
      keyVersion: wallet.keyVersion,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
