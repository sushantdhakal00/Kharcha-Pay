import { TreasuryWalletType } from "@prisma/client";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { env } from "@/lib/env";

export class WarmKeyAccessError extends Error {
  code = "WARM_KEY_ACCESS_FORBIDDEN" as const;
  constructor() {
    super(
      "WARM wallet private keys must NEVER be loaded in the web runtime. " +
        "Use a dedicated signing worker or HSM for warm wallets."
    );
  }
}

export class SigningDisabledError extends Error {
  code = "SIGNING_DISABLED" as const;
}

function loadHotKeypair(): Keypair {
  const raw = env.HOT_WALLET_KEYPAIR_JSON ?? env.TREASURY_KEYPAIR_JSON;
  if (!raw) {
    throw new SigningDisabledError(
      "No HOT_WALLET_KEYPAIR_JSON or TREASURY_KEYPAIR_JSON configured"
    );
  }
  const parsed = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

export interface SolanaTransferParams {
  fromWalletType: TreasuryWalletType;
  mintAddress: string;
  destinationAddress: string;
  amountRaw: bigint;
  tokenProgramId?: string;
}

export async function signAndSendSolanaTransfer(
  params: SolanaTransferParams
): Promise<string> {
  if (params.fromWalletType === TreasuryWalletType.WARM) {
    throw new WarmKeyAccessError();
  }

  const keypair = loadHotKeypair();

  const rpcUrl = env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const mintPubkey = new PublicKey(params.mintAddress);
  const destinationPubkey = new PublicKey(params.destinationAddress);
  const programId = params.tokenProgramId
    ? new PublicKey(params.tokenProgramId)
    : undefined;

  const treasuryAta = await getAssociatedTokenAddress(
    mintPubkey,
    keypair.publicKey,
    false,
    programId
  );

  const transferIx = createTransferInstruction(
    treasuryAta,
    destinationPubkey,
    keypair.publicKey,
    params.amountRaw,
    [],
    programId
  );

  const tx = new Transaction().add(transferIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: "confirmed",
    skipPreflight: false,
  });

  return sig;
}

export function assertNotWarmWallet(type: TreasuryWalletType): void {
  if (type === TreasuryWalletType.WARM) {
    throw new WarmKeyAccessError();
  }
}
