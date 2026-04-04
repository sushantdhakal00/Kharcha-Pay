import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { getOrgTreasuryBalances } from "@/lib/treasury/treasury-balance-service";
import { jsonResponse } from "@/lib/json-response";
import { RpcNotConfiguredError } from "@/lib/solana/rpc";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const balances = await getOrgTreasuryBalances(orgId);
    return jsonResponse(balances);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof RpcNotConfiguredError) {
      return jsonResponse(
        { error: "RPC unavailable", code: "RPC_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const err = e as Error & { code?: string; cause?: Error };
    if (err.code === "RPC_TIMEOUT" || err.cause?.message === "RPC_TIMEOUT") {
      return jsonResponse(
        { error: "RPC unavailable", code: "RPC_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const message = err.message ?? "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
