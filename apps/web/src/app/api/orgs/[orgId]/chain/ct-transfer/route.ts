import { NextResponse } from "next/server";
import { amountMinorBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { confidentialTransfer } from "@/lib/solana/chain-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json().catch(() => ({}));
    const parsed = amountMinorBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const amountMinor = BigInt(parsed.data.amountMinor);

    const config = await prisma.orgChainConfig.findUnique({
      where: { orgId },
    });
    if (!config?.treasuryTokenAccount || !config?.vendorTokenAccount) {
      return NextResponse.json(
        { error: "Init accounts first" },
        { status: 400 }
      );
    }

    const result = await confidentialTransfer({
      treasuryTokenAccount: config.treasuryTokenAccount,
      vendorTokenAccount: config.vendorTokenAccount,
      amountMinor,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error, txSignature: null },
        { status: 503 }
      );
    }

    if (result.txSignature) {
      await prisma.orgChainConfig.update({
        where: { orgId },
        data: { lastCtTransferTx: result.txSignature },
      });
    }

    return NextResponse.json({
      txSignature: result.txSignature,
      amountMinor: amountMinor.toString(),
      message: result.error ?? "Confidential transfer submitted",
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
