import { Keypair } from "@solana/web3.js";
import { TreasuryChain } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { encryptSecret, decryptSecret } from "@/lib/crypto/envelope";

export type OrgTreasuryWallet = {
  id: string;
  orgId: string;
  chain: TreasuryChain;
  cluster: string;
  treasuryPubkey: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureOrgTreasuryWallet(orgId: string): Promise<OrgTreasuryWallet> {
  const cluster = env.SOLANA_CLUSTER ?? "devnet";

  const existing = await prisma.orgTreasuryWallet.findUnique({
    where: { orgId },
  });
  if (existing) {
    return toSafe(existing);
  }

  const keypair = Keypair.generate();
  const encrypted = encryptSecret(new Uint8Array(keypair.secretKey));
  const pubkey = keypair.publicKey.toBase58();

  const created = await prisma.orgTreasuryWallet.upsert({
    where: { orgId },
    create: {
      orgId,
      chain: TreasuryChain.SOLANA,
      cluster,
      treasuryPubkey: pubkey,
      treasuryKeypairEncrypted: encrypted,
      keyVersion: 1,
    },
    update: {},
  });

  return toSafe(created);
}

export function createTreasuryWalletData(): {
  chain: TreasuryChain;
  cluster: string;
  treasuryPubkey: string;
  treasuryKeypairEncrypted: string;
  keyVersion: number;
} {
  const cluster = env.SOLANA_CLUSTER ?? "devnet";
  const keypair = Keypair.generate();
  const encrypted = encryptSecret(new Uint8Array(keypair.secretKey));
  const pubkey = keypair.publicKey.toBase58();
  return {
    chain: TreasuryChain.SOLANA,
    cluster,
    treasuryPubkey: pubkey,
    treasuryKeypairEncrypted: encrypted,
    keyVersion: 1,
  };
}

export async function getOrgTreasuryWallet(orgId: string): Promise<OrgTreasuryWallet | null> {
  const w = await prisma.orgTreasuryWallet.findUnique({
    where: { orgId },
  });
  return w ? toSafe(w) : null;
}

export async function getOrgTreasuryKeypair(orgId: string): Promise<Keypair | null> {
  const w = await prisma.orgTreasuryWallet.findUnique({
    where: { orgId },
  });
  if (!w) return null;
  const bytes = decryptSecret(w.treasuryKeypairEncrypted);
  return Keypair.fromSecretKey(bytes);
}

export async function rotateOrgTreasuryWallet(orgId: string): Promise<OrgTreasuryWallet> {
  const isDemo = env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
  const isDev = env.NODE_ENV !== "production";
  if (!isDemo && !isDev) {
    throw new Error("Rotate only allowed in DEMO_MODE or non-production");
  }

  const cluster = env.SOLANA_CLUSTER ?? "devnet";
  const keypair = Keypair.generate();
  const encrypted = encryptSecret(new Uint8Array(keypair.secretKey));
  const pubkey = keypair.publicKey.toBase58();

  const updated = await prisma.orgTreasuryWallet.upsert({
    where: { orgId },
    create: {
      orgId,
      chain: TreasuryChain.SOLANA,
      cluster,
      treasuryPubkey: pubkey,
      treasuryKeypairEncrypted: encrypted,
      keyVersion: 1,
    },
    update: {
      treasuryPubkey: pubkey,
      treasuryKeypairEncrypted: encrypted,
      keyVersion: { increment: 1 },
    },
  });

  return toSafe(updated);
}

function toSafe(
  w: {
    id: string;
    orgId: string;
    chain: TreasuryChain;
    cluster: string;
    treasuryPubkey: string;
    keyVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }
): OrgTreasuryWallet {
  return {
    id: w.id,
    orgId: w.orgId,
    chain: w.chain,
    cluster: w.cluster,
    treasuryPubkey: w.treasuryPubkey,
    keyVersion: w.keyVersion,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}
