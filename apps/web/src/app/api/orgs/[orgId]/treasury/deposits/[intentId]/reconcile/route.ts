import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { reconcileDepositIntent } from "@/lib/treasury/treasury-deposit-reconcile";
import { jsonResponse } from "@/lib/json-response";
import { RpcNotConfiguredError } from "@/lib/solana/rpc";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; intentId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, intentId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const updated = await reconcileDepositIntent(orgId, intentId);

    return jsonResponse({
      intentId: updated.id,
      status: updated.status,
      reconciledTxSig: updated.reconciledTxSig,
      reconciledTokenMint: updated.reconciledTokenMint,
      reconciledTokenAccount: updated.reconciledTokenAccount,
      reconciledAt: updated.reconciledAt?.toISOString() ?? null,
      reconciliationNote: updated.reconciliationNote,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof RpcNotConfiguredError) {
      return jsonResponse(
        { error: "RPC unavailable", code: "RPC_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
