import { NextRequest, NextResponse } from "next/server";
import { PayoutMethodType } from "@prisma/client";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  getProviderCapabilities,
  isAchEnabled,
  isLocalEnabled,
  getRailDisabledReason,
  RAIL_DISABLED_MESSAGES,
} from "@/lib/fiat/payout-providers/capabilities";
import {
  getActivePolicy,
  resolveRules,
} from "@/lib/fiat/treasury-policy";
import { listPayoutProviders } from "@/lib/fiat/payout-providers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const activePolicy = await getActivePolicy(prisma as never, orgId);
    const rules = resolveRules(activePolicy);

    const providerNames = listPayoutProviders();
    const providerCapabilities = providerNames.map((name) =>
      getProviderCapabilities(name)
    );

    const allRails: PayoutMethodType[] = [
      PayoutMethodType.BANK_WIRE,
      PayoutMethodType.ACH,
      PayoutMethodType.LOCAL,
    ];

    const currentProvider = providerNames[0] ?? "CIRCLE";
    const railStatus = allRails.map((rail) => {
      const reason = getRailDisabledReason(
        currentProvider,
        rail,
        "USD",
        rules.allowedRails
      );
      return {
        rail,
        enabled: reason === null,
        disabledReason: reason ? RAIL_DISABLED_MESSAGES[reason] : null,
        disabledReasonCode: reason,
      };
    });

    return jsonResponse({
      providers: providerNames,
      providerCapabilities,
      policy: {
        allowedRails: rules.allowedRails ?? null,
        allowedProviders: rules.allowedProviders ?? null,
      },
      flags: {
        achEnabled: isAchEnabled(),
        localEnabled: isLocalEnabled(),
      },
      railStatus,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
