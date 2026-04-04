import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { emitTreasuryEvent, mintDedupKey } from "@/lib/fiat/treasury-events";

const patchMintSchema = z.object({
  isActive: z.boolean().optional(),
  symbol: z.string().min(1).max(10).optional(),
  decimals: z.number().int().min(0).max(18).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; mintId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, mintId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const parsed = patchMintSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.treasuryMintRegistry.findUnique({
      where: { id: mintId },
    });
    if (!existing) {
      return jsonResponse({ error: "Mint not found" }, { status: 404 });
    }

    const mint = await prisma.treasuryMintRegistry.update({
      where: { id: mintId },
      data: {
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        ...(parsed.data.symbol !== undefined && { symbol: parsed.data.symbol.toUpperCase() }),
        ...(parsed.data.decimals !== undefined && { decimals: parsed.data.decimals }),
      },
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "MINT_UPDATED",
      entityType: "TreasuryMintRegistry",
      entityId: mint.id,
      metadata: { changes: parsed.data },
    });

    await emitTreasuryEvent({
      orgId,
      type: "MINT_UPDATED",
      entityType: "TreasuryMintRegistry",
      entityId: mint.id,
      dedupKey: mintDedupKey(mint.id, `updated:${Date.now()}`),
      payload: { mintId: mint.id, changes: parsed.data },
    }).catch(() => {});

    return jsonResponse({ mint });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
