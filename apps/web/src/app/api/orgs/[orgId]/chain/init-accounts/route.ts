import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { createTokenAccounts } from "@/lib/solana/chain-service";
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

    const config = await prisma.orgChainConfig.findUnique({
      where: { orgId },
    });
    if (!config?.token2022Mint || !config.treasuryOwnerPubkey) {
      return NextResponse.json(
        { error: "Create mint first (POST init-mint)" },
        { status: 400 }
      );
    }

    const vendorOwner = config.vendorOwnerPubkey ?? config.treasuryOwnerPubkey;
    const { treasuryTokenAccount, vendorTokenAccount, txSignature } =
      await createTokenAccounts(
        config.token2022Mint,
        config.treasuryOwnerPubkey,
        vendorOwner
      );

    await prisma.orgChainConfig.update({
      where: { orgId },
      data: {
        treasuryTokenAccount,
        vendorTokenAccount,
        vendorOwnerPubkey: vendorOwner,
        lastInitAccountsTx: txSignature,
      },
    });

    return NextResponse.json({
      treasuryTokenAccount,
      vendorTokenAccount,
      txSignature,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
