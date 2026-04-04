import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { jsonResponse } from "@/lib/json-response";
import { refreshPayoutStatus } from "@/lib/fiat/fiat-payout-service";
import { FiatProviderError } from "@/lib/fiat/fiat-service";

export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ orgId: string; payoutIntentId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, payoutIntentId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const intent = await refreshPayoutStatus(orgId, payoutIntentId);

    return jsonResponse({
      id: intent.id,
      status: intent.status,
      failureCode: intent.failureCode,
      failureMessage: intent.failureMessage,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof FiatProviderError) {
      return jsonResponse(
        { error: "Fiat provider error", code: "FIAT_PROVIDER_ERROR" },
        { status: 502 }
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
