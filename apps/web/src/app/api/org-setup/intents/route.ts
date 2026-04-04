import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import { orgSetupCreateSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { OrgStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { generateOrgSetupReference, LAMPORTS_PER_SOL } from "@/lib/org-setup/reference";
import { jsonResponse } from "@/lib/json-response";
import { encrypt } from "@/lib/encryption";
import { createTreasuryWalletData } from "@/lib/treasury/treasury-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);

    const body = await request.json();
    const parsed = orgSetupCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name, slug, defaultCurrency, ...rest } = parsed.data;
    const slugLower = slug.toLowerCase();
    const currency = defaultCurrency ?? "USD";

    const existing = await prisma.organization.findUnique({
      where: { slug: slugLower },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Organization slug already taken" },
        { status: 409 }
      );
    }

    const feeSol = parseFloat(env.ORG_CREATE_FEE_SOL);
    if (isNaN(feeSol) || feeSol < 0) {
      return NextResponse.json(
        { error: "Invalid ORG_CREATE_FEE_SOL configuration" },
        { status: 500 }
      );
    }
    const requiredLamports = BigInt(Math.round(feeSol * LAMPORTS_PER_SOL));
    const treasuryPubkey = env.ORG_CREATE_TREASURY_PUBKEY;
    const reference = generateOrgSetupReference();
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

    const depositKeypair = Keypair.generate();
    const depositPubkey = depositKeypair.publicKey.toBase58();
    const depositKeypairEncrypted = encrypt(
      JSON.stringify(Array.from(depositKeypair.secretKey))
    );

    const treasuryData = createTreasuryWalletData();

    const [org, intent] = await prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name,
          slug: slugLower,
          currency: currency.length === 3 ? currency : "USD",
          status: OrgStatus.PENDING_PAYMENT,
          isDemo: false,
          memberships: {
            create: {
              userId: user.id,
              role: OrgRole.ADMIN,
            },
          },
        },
      });
      const newIntent = await tx.orgSetupPaymentIntent.create({
        data: {
          userId: user.id,
          organizationId: newOrg.id,
          status: "PENDING",
          reference,
          requiredLamports,
          treasuryPubkey,
          depositPubkey,
          depositKeypairEncrypted,
          expiresAt,
        },
      });
      await tx.orgTreasuryWallet.create({
        data: {
          ...treasuryData,
          orgId: newOrg.id,
        },
      });
      return [newOrg, newIntent];
    });

    return jsonResponse({
      intentId: intent.id,
      organizationId: org.id,
      requiredSol: feeSol.toFixed(9).replace(/\.?0+$/, ""),
      treasuryPubkey,
      depositPubkey,
      reference,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
