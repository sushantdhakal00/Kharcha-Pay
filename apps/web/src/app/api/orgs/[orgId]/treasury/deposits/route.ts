import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createCircleDepositIntent, FiatDisabledError, FiatProviderError } from "@/lib/fiat/fiat-service";
import { jsonResponse } from "@/lib/json-response";

const depositRequestSchema = z.object({
  amount: z.number().positive("Amount must be positive").max(1e7, "Amount exceeds limit"),
  currency: z.enum(["USD"]).optional().default("USD"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const body = await req.json().catch(() => ({}));
    const parsed = depositRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { amount, currency } = parsed.data;
    const amountMinor = BigInt(Math.round(amount * 100));

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    });

    const intent = await createCircleDepositIntent({
      orgId,
      orgName: org.name,
      amountMinor,
      currency,
      createdByUserId: user.id,
    });

    const amountMajor = Number(amountMinor) / 100;

    return jsonResponse({
      intentId: intent.id,
      status: intent.status,
      currency: intent.currency,
      amount: amountMajor,
      hostedUrl: intent.hostedUrl ?? undefined,
      fundingInstructions: intent.fundingInstructionsJson as unknown,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof FiatDisabledError) {
      return jsonResponse(
        { error: "Fiat deposits not configured", code: "FIAT_DISABLED" },
        { status: 503 }
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const intents = await prisma.treasuryDepositIntent.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        amountMinor: true,
        currency: true,
        createdAt: true,
        reconciledTxSig: true,
        reconciledTokenMint: true,
        reconciledAt: true,
        reconciliationNote: true,
      },
    });

    const rows = intents.map((i) => ({
      id: i.id,
      status: i.status,
      amount: Number(i.amountMinor) / 100,
      currency: i.currency,
      createdAt: i.createdAt.toISOString(),
      reconciledTxSig: i.reconciledTxSig,
      reconciledTokenMint: i.reconciledTokenMint,
      reconciledAt: i.reconciledAt?.toISOString() ?? null,
      reconciliationNote: i.reconciliationNote,
    }));

    return jsonResponse({ intents: rows });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
