import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { jsonResponse } from "@/lib/json-response";
import { prisma } from "@/lib/db";
import {
  ensureVendorBeneficiary,
  UnsupportedRailError,
} from "@/lib/fiat/fiat-payout-service";
import { FiatProviderError } from "@/lib/fiat/fiat-service";

const payoutProfileSchema = z.object({
  payoutMethodType: z.enum(["BANK_WIRE", "ACH", "LOCAL"]),
  currency: z.string().default("USD"),
  provider: z.string().optional().default("CIRCLE"),
  payoutDetails: z.object({
    accountNumber: z.string().min(1),
    routingNumber: z.string().min(1),
    billingName: z.string().min(1),
    billingCity: z.string().optional(),
    billingCountry: z.string().default("US"),
    billingLine1: z.string().optional(),
    billingDistrict: z.string().optional(),
    billingPostalCode: z.string().optional(),
    bankName: z.string().optional(),
    bankCity: z.string().optional(),
    bankCountry: z.string().optional(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; vendorId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, vendorId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, orgId },
      select: { id: true },
    });
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = payoutProfileSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { payoutMethodType, currency, provider, payoutDetails } = parsed.data;

    const profile = await ensureVendorBeneficiary(
      provider,
      vendorId,
      {
        payoutMethodType: payoutMethodType as "BANK_WIRE" | "ACH" | "LOCAL",
        currency,
        ...payoutDetails,
      }
    );
    if (!profile) {
      return jsonResponse({ error: "Failed to create or update payout profile" }, { status: 500 });
    }

    return jsonResponse({
      id: profile.id,
      vendorId: profile.vendorId,
      provider: profile.provider,
      currency: profile.currency,
      payoutMethodType: profile.payoutMethodType,
      circleBankAccountId: profile.circleBankAccountId ? "configured" : null,
      payoutDetails: profile.payoutDetailsJson,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof UnsupportedRailError) {
      return jsonResponse(
        { error: e.message, code: "UNSUPPORTED_RAIL" },
        { status: 400 }
      );
    }
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
