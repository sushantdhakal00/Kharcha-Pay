import { NextResponse } from "next/server";
import { applyPendingBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { applyPending } from "@/lib/solana/chain-service";

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
    const parsed = applyPendingBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { account } = parsed.data;

    const config = await prisma.orgChainConfig.findUnique({
      where: { orgId },
    });
    const tokenAccount =
      account === "treasury"
        ? config?.treasuryTokenAccount
        : config?.vendorTokenAccount;
    if (!tokenAccount) {
      return NextResponse.json(
        { error: "Init accounts first" },
        { status: 400 }
      );
    }

    const result = await applyPending({ account, tokenAccount });

    if (result.error) {
      return NextResponse.json(
        { error: result.error, txSignature: null },
        { status: 503 }
      );
    }

    if (result.txSignature) {
      await prisma.orgChainConfig.update({
        where: { orgId },
        data: { lastApplyPendingTx: result.txSignature },
      });
    }

    return NextResponse.json({
      txSignature: result.txSignature,
      account,
      message: result.error ?? "Apply pending submitted",
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
