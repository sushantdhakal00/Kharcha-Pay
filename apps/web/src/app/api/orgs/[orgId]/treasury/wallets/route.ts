import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole, TreasuryWalletType, TreasuryChain } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { emitTreasuryEvent, walletDedupKey } from "@/lib/fiat/treasury-events";

const createWalletSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(TreasuryWalletType),
  chain: z.nativeEnum(TreasuryChain).default(TreasuryChain.SOLANA),
  address: z.string().min(32).max(64),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const wallets = await prisma.treasuryWallet.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });

    return jsonResponse({ wallets });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const parsed = createWalletSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const wallet = await prisma.treasuryWallet.create({
      data: {
        orgId,
        name: parsed.data.name,
        type: parsed.data.type,
        chain: parsed.data.chain,
        address: parsed.data.address,
        metadata: (parsed.data.metadata ?? undefined) as object | undefined,
      },
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "WALLET_CREATED",
      entityType: "TreasuryWallet",
      entityId: wallet.id,
      metadata: { name: wallet.name, type: wallet.type, address: wallet.address },
    });

    await emitTreasuryEvent({
      orgId,
      type: "WALLET_CREATED",
      entityType: "TreasuryWallet",
      entityId: wallet.id,
      dedupKey: walletDedupKey(wallet.id, "created"),
      payload: { walletId: wallet.id, name: wallet.name, type: wallet.type },
    }).catch(() => {});

    return jsonResponse({ wallet }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("Unique constraint") ? 409 : 500;
    return jsonResponse({ error: msg }, { status });
  }
}
