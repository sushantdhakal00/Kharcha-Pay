import { NextResponse } from "next/server";
import { amountMinorBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { mintToTreasury } from "@/lib/solana/chain-service";
import { RpcNotConfiguredError } from "@/lib/solana/rpc";

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
    if (!config?.token2022Mint || !config.treasuryTokenAccount) {
      return NextResponse.json(
        { error: "Create mint and init accounts first" },
        { status: 400 }
      );
    }
    const { txSignature } = await mintToTreasury(
      config.token2022Mint,
      config.treasuryTokenAccount,
      amountMinor
    );
    await prisma.orgChainConfig.update({
      where: { orgId },
      data: { lastMintToTx: txSignature },
    });
    return NextResponse.json({ txSignature, amountMinor: amountMinor.toString() });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof RpcNotConfiguredError) {
      return NextResponse.json(
        { error: "Solana RPC not configured", code: "RPC_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
