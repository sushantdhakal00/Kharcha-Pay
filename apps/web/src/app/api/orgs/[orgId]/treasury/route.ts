import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { ensureOrgTreasuryWallet } from "@/lib/treasury/treasury-service";
import { jsonResponse } from "@/lib/json-response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const wallet = await ensureOrgTreasuryWallet(orgId);
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
