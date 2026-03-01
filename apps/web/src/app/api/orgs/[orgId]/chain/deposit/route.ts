import { NextResponse } from "next/server";
import { amountMinorBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { deposit } from "@/lib/solana/chain-service";

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
    const config = await prisma.orgChainConfig.findUnique({ where: { orgId } });
    if (!config?.treasuryTokenAccount) {
      return NextResponse.json({ error: "Init accounts first" }, { status: 400 });
    }
    const result = await deposit({
      treasuryTokenAccount: config.treasuryTokenAccount,
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
        data: { lastDepositTx: result.txSignature },
      });
    }
    return NextResponse.json({
      txSignature: result.txSignature,
      message: result.error ?? "Deposit submitted",
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
