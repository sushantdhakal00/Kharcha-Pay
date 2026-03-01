/**
 * Sweeps SOL from a unique deposit address to the main treasury.
 * Called after payment is verified to consolidate funds.
 */
import { Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { getMainnetConnection } from "@/lib/solana/mainnet-rpc";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";

const TREASURY_PUBKEY = env.ORG_CREATE_TREASURY_PUBKEY;
const MIN_LAMPORTS_TO_SWEEP = BigInt(10_000);
const TX_FEE_BUFFER = 10_000;

export async function sweepDepositToTreasury(
  depositKeypairEncrypted: string
): Promise<{ ok: boolean; signature?: string; error?: string }> {
  try {
    const conn = getMainnetConnection();
    const secretKey = JSON.parse(decrypt(depositKeypairEncrypted)) as number[];
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const depositPubkey = keypair.publicKey;
    const treasuryPubkey = new PublicKey(TREASURY_PUBKEY);

    const balance = await conn.getBalance(depositPubkey);
    const balanceBigInt = BigInt(balance);

    if (balanceBigInt < MIN_LAMPORTS_TO_SWEEP) {
      return { ok: true, signature: undefined };
    }

    const lamportsToSend = balanceBigInt - BigInt(TX_FEE_BUFFER);
    if (lamportsToSend <= BigInt(0)) {
      return { ok: true, signature: undefined };
    }

    const { blockhash } = await conn.getLatestBlockhashAndContext("confirmed").then((r) => r.value);
    const tx = new Transaction();
    tx.feePayer = depositPubkey;
    tx.recentBlockhash = blockhash;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: depositPubkey,
        toPubkey: treasuryPubkey,
        lamports: lamportsToSend,
      })
    );

    const signature = await conn.sendTransaction(tx, [keypair], {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await conn.confirmTransaction(signature, "confirmed");
    return { ok: true, signature };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
