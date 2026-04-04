import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { getConnection, RpcNotConfiguredError } from "@/lib/solana/connection";
import { getTokenAccountBalance } from "@/lib/solana/chain-service";
import { PublicKey } from "@solana/web3.js";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const config = await prisma.orgChainConfig.findUnique({
      where: { orgId },
    });

    if (!config) {
      return NextResponse.json({
        configured: false,
        cluster: process.env.SOLANA_CLUSTER ?? "devnet",
        rpcConfigured: !!process.env.SOLANA_RPC_URL,
      });
    }

    let connection;
    try {
      connection = getConnection();
    } catch (e) {
      if (e instanceof RpcNotConfiguredError) {
        return NextResponse.json(
          { error: "Solana RPC not configured", code: "RPC_NOT_CONFIGURED" },
          { status: 503 }
        );
      }
      throw e;
    }
    const programId = new PublicKey(config.tokenProgramId);

    let treasuryBalance = "0";
    let vendorBalance = "0";
    if (config.treasuryTokenAccount) {
      treasuryBalance = await getTokenAccountBalance(
        connection,
        config.treasuryTokenAccount,
        programId
      );
    }
    if (config.vendorTokenAccount) {
      vendorBalance = await getTokenAccountBalance(
        connection,
        config.vendorTokenAccount,
        programId
      );
    }

    return NextResponse.json({
      configured: true,
      cluster: config.cluster,
      token2022Mint: config.token2022Mint,
      tokenProgramId: config.tokenProgramId,
      treasuryOwnerPubkey: config.treasuryOwnerPubkey,
      treasuryTokenAccount: config.treasuryTokenAccount,
      vendorOwnerPubkey: config.vendorOwnerPubkey,
      vendorTokenAccount: config.vendorTokenAccount,
      auditorElgamalPubkey: config.auditorElgamalPubkey,
      balances: {
        treasuryPublic: treasuryBalance,
        vendorPublic: vendorBalance,
      },
      lastTx: {
        initMint: config.lastInitMintTx,
        initAccounts: config.lastInitAccountsTx,
        mintTo: config.lastMintToTx,
        deposit: config.lastDepositTx,
        applyPending: config.lastApplyPendingTx,
        ctTransfer: config.lastCtTransferTx,
        withdraw: config.lastWithdrawTx,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
