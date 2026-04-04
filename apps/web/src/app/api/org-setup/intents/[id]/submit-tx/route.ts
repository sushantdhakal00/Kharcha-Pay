import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { jsonResponse } from "@/lib/json-response";
import { checkOrgSetupRateLimit } from "@/lib/rate-limit";
import { OrgSetupPaymentIntentStatus, OrgStatus } from "@prisma/client";
import { verifySolTransferToTreasury, verifySolTransferToDepositAddress } from "@/lib/org-setup/verify-sol-transfer";
import { sweepDepositToTreasury } from "@/lib/org-setup/sweep-deposit";
import { z } from "zod";

const bodySchema = z.object({ signature: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { id } = await params;

    if (!checkOrgSetupRateLimit(user.id, "submitTx")) {
      return jsonResponse(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: "signature is required" }, { status: 400 });
    }
    const { signature } = parsed.data;

    const intent = await prisma.orgSetupPaymentIntent.findFirst({
      where: { id, userId: user.id },
      include: { transactions: true },
    });

    if (!intent) {
      return jsonResponse({ error: "Intent not found" }, { status: 404 });
    }

    if (intent.status === OrgSetupPaymentIntentStatus.PAID) {
      return jsonResponse({
        status: "PAID",
        paidLamports: intent.paidLamports.toString(),
        requiredLamports: intent.requiredLamports.toString(),
        overpaidLamports: intent.overpaidLamports?.toString() ?? "0",
      });
    }

    if (intent.status === OrgSetupPaymentIntentStatus.EXPIRED) {
      return jsonResponse(
        { error: "Payment intent has expired" },
        { status: 400 }
      );
    }

    const existing = await prisma.orgSetupPaymentTx.findUnique({
      where: { signature },
    });
    if (existing) {
      return jsonResponse(
        { error: "Transaction already recorded" },
        { status: 400 }
      );
    }

    const verifyResult = intent.depositPubkey
      ? await verifySolTransferToDepositAddress({
          signature,
          depositPubkey: intent.depositPubkey,
        })
      : await verifySolTransferToTreasury({
          signature,
          treasuryPubkey: intent.treasuryPubkey,
          reference: intent.reference,
        });

    if (!verifyResult.ok || !verifyResult.lamports) {
      return jsonResponse(
        { error: verifyResult.error ?? "Transaction verification failed" },
        { status: 400 }
      );
    }

    const newPaidLamports = intent.paidLamports + verifyResult.lamports;
    const isPaid = newPaidLamports >= intent.requiredLamports;
    const overpaidLamports = isPaid
      ? newPaidLamports - intent.requiredLamports
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.orgSetupPaymentTx.create({
        data: {
          intentId: intent.id,
          signature,
          lamports: verifyResult.lamports!,
          slot: verifyResult.slot != null ? BigInt(verifyResult.slot) : null,
          blockTime:
            verifyResult.blockTime != null
              ? new Date(verifyResult.blockTime * 1000)
              : null,
          commitment: "confirmed",
        },
      });
      await tx.orgSetupPaymentIntent.update({
        where: { id },
        data: {
          paidLamports: newPaidLamports,
          status: isPaid ? OrgSetupPaymentIntentStatus.PAID : intent.status,
          paidAt: isPaid ? new Date() : null,
          overpaidLamports,
        },
      });
      if (isPaid) {
        await tx.organization.update({
          where: { id: intent.organizationId },
          data: { status: OrgStatus.PENDING_TERMS },
        });
      }
    });

    if (intent.depositKeypairEncrypted && verifyResult.lamports) {
      sweepDepositToTreasury(intent.depositKeypairEncrypted).catch((e) => {
        console.error("[org-setup] Sweep failed for intent", id, e);
      });
    }

    const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
    const overpaidSol =
      overpaidLamports != null
        ? Number(overpaidLamports) / Number(LAMPORTS_PER_SOL)
        : 0;

    return jsonResponse({
      status: isPaid ? "PAID" : "PENDING",
      paidLamports: newPaidLamports.toString(),
      requiredLamports: intent.requiredLamports.toString(),
      remainingLamports: isPaid ? "0" : (intent.requiredLamports - newPaidLamports).toString(),
      overpaidLamports: overpaidLamports?.toString() ?? "0",
      overpaidSol: overpaidSol > 1 ? "contact_support" : undefined,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
