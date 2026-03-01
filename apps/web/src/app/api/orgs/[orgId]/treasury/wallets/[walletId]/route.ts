import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { emitTreasuryEvent, walletDedupKey } from "@/lib/fiat/treasury-events";

const patchWalletSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; walletId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, walletId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const parsed = patchWalletSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.treasuryWallet.findFirst({
      where: { id: walletId, orgId },
    });
    if (!existing) {
      return jsonResponse({ error: "Wallet not found" }, { status: 404 });
    }

    const wallet = await prisma.treasuryWallet.update({
      where: { id: walletId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      },
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "WALLET_UPDATED",
      entityType: "TreasuryWallet",
      entityId: wallet.id,
      metadata: { changes: parsed.data },
    });

    await emitTreasuryEvent({
      orgId,
      type: "WALLET_UPDATED",
      entityType: "TreasuryWallet",
      entityId: wallet.id,
      dedupKey: walletDedupKey(wallet.id, `updated:${Date.now()}`),
      payload: { walletId: wallet.id, changes: parsed.data },
    }).catch(() => {});

    return jsonResponse({ wallet });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
