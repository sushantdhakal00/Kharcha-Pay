import { NextResponse } from "next/server";
import { initMintBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { createToken2022Mint } from "@/lib/solana/chain-service";
import { getTreasuryKeypair } from "@/lib/solana/connection";
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
    const parsed = initMintBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { withAuditor } = parsed.data;

    const treasury = getTreasuryKeypair();
    const treasuryPubkey = treasury.publicKey.toBase58();

    const { mintPubkey, txSignature } = await createToken2022Mint(withAuditor);

    const programId = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    const cluster = process.env.SOLANA_CLUSTER ?? "devnet";

    await prisma.orgChainConfig.upsert({
      where: { orgId },
      create: {
        orgId,
        cluster,
        rpcUrl: null,
        token2022Mint: mintPubkey,
        tokenProgramId: programId,
        treasuryOwnerPubkey: treasuryPubkey,
        lastInitMintTx: txSignature,
      },
      update: {
        token2022Mint: mintPubkey,
        tokenProgramId: programId,
        treasuryOwnerPubkey: treasuryPubkey,
        lastInitMintTx: txSignature,
        auditorElgamalPubkey: withAuditor ? "stored-concept" : null,
      },
    });

    return NextResponse.json({
      mintPubkey,
      txSignature,
      message:
        "Token-2022 mint created (Confidential Transfer extension is disabled on devnet; mint is standard Token-2022).",
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof RpcNotConfiguredError) {
      return NextResponse.json(
        { error: "Solana RPC not configured", code: "RPC_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
