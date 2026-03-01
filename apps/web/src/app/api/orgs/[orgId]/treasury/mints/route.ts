import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole, TreasuryChain } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { emitTreasuryEvent, mintDedupKey } from "@/lib/fiat/treasury-events";

const createMintSchema = z.object({
  chain: z.nativeEnum(TreasuryChain).default(TreasuryChain.SOLANA),
  symbol: z.string().min(1).max(10),
  mintAddress: z.string().min(32).max(64),
  decimals: z.number().int().min(0).max(18),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const mints = await prisma.treasuryMintRegistry.findMany({
      orderBy: { symbol: "asc" },
    });

    return jsonResponse({ mints });
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
    const parsed = createMintSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const mint = await prisma.treasuryMintRegistry.create({
      data: {
        chain: parsed.data.chain,
        symbol: parsed.data.symbol.toUpperCase(),
        mintAddress: parsed.data.mintAddress,
        decimals: parsed.data.decimals,
      },
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "MINT_CREATED",
      entityType: "TreasuryMintRegistry",
      entityId: mint.id,
      metadata: { symbol: mint.symbol, mintAddress: mint.mintAddress, decimals: mint.decimals },
    });

    await emitTreasuryEvent({
      orgId,
      type: "MINT_CREATED",
      entityType: "TreasuryMintRegistry",
      entityId: mint.id,
      dedupKey: mintDedupKey(mint.id, "created"),
      payload: { mintId: mint.id, symbol: mint.symbol, mintAddress: mint.mintAddress },
    }).catch(() => {});

    return jsonResponse({ mint }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("Unique constraint") ? 409 : 500;
    return jsonResponse({ error: msg }, { status });
  }
}
