import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { jsonResponse } from "@/lib/json-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const intent = await prisma.orgSetupPaymentIntent.findFirst({
      where: { id, userId: user.id },
    });

    if (!intent) {
      return jsonResponse({ error: "Intent not found" }, { status: 404 });
    }

    const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
    const requiredSol = Number(intent.requiredLamports) / Number(LAMPORTS_PER_SOL);

    return jsonResponse({
      id: intent.id,
      organizationId: intent.organizationId,
      status: intent.status,
      requiredSol: requiredSol.toFixed(9).replace(/\.?0+$/, ""),
      requiredLamports: intent.requiredLamports.toString(),
      paidLamports: intent.paidLamports.toString(),
      treasuryPubkey: intent.treasuryPubkey,
      depositPubkey: intent.depositPubkey ?? intent.treasuryPubkey,
      useUniqueAddress: !!intent.depositPubkey,
      reference: intent.reference,
      expiresAt: intent.expiresAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
