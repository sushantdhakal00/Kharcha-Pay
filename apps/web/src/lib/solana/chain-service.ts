import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { getConnection, getTreasuryKeypair, getToken2022ProgramId } from "./connection";

const DECIMALS = 9;

/**
 * Token-2022 mint creation. Confidential Transfer extension is currently disabled on devnet/mainnet (Solana audit).
 * We create a plain Token-2022 mint so the demo runs; when CT is re-enabled we can add the extension.
 */
export async function createToken2022Mint(
  _withAuditor: boolean
): Promise<{ mintPubkey: string; txSignature: string }> {
  const connection = getConnection();
  const payer = getTreasuryKeypair();
  const programId = getToken2022ProgramId();
  const mintKeypair = Keypair.generate();

  const mintAddress = await createMint(
    connection,
    payer,
    payer.publicKey,
    payer.publicKey,
    DECIMALS,
    mintKeypair,
    { commitment: "confirmed" },
    programId
  );

  const sigs = await connection.getSignaturesForAddress(mintAddress, { limit: 1 });
  const txSignature = sigs[0]?.signature ?? "created";

  return {
    mintPubkey: mintAddress.toBase58(),
    txSignature,
  };
}

export async function createTokenAccounts(
  mintPubkey: string,
  treasuryOwner: string,
  vendorOwner: string
): Promise<{
  treasuryTokenAccount: string;
  vendorTokenAccount: string;
  txSignature: string;
}> {
  const connection = getConnection();
  const payer = getTreasuryKeypair();
  const mint = new PublicKey(mintPubkey);
  const programId = getToken2022ProgramId();

  const treasuryOwnerPubkey = new PublicKey(treasuryOwner);
  const vendorOwnerPubkey = new PublicKey(vendorOwner);

  const treasuryAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    treasuryOwnerPubkey,
    false,
    "confirmed",
    undefined,
    programId
  );

  const vendorAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    vendorOwnerPubkey,
    false,
    "confirmed",
    undefined,
    programId
  );

  const treasurySigs = await connection.getSignaturesForAddress(treasuryAccount.address, { limit: 1 });
  const txSignature = treasurySigs[0]?.signature ?? "created-or-exists";

  return {
    treasuryTokenAccount: treasuryAccount.address.toBase58(),
    vendorTokenAccount: vendorAccount.address.toBase58(),
    txSignature,
  };
}

export async function mintToTreasury(
  mintPubkey: string,
  treasuryTokenAccount: string,
  amountMinor: bigint
): Promise<{ txSignature: string }> {
  const connection = getConnection();
  const payer = getTreasuryKeypair();
  const programId = getToken2022ProgramId();
  const amount = Number(amountMinor);

  const sig = await mintTo(
    connection,
    payer,
    new PublicKey(mintPubkey),
    new PublicKey(treasuryTokenAccount),
    payer,
    amount,
    [],
    { commitment: "confirmed" },
    programId
  );

  return { txSignature: sig };
}

/**
 * Confidential Transfer is temporarily disabled on devnet/mainnet.
 * Return a clear error so the UI can show the message; do not attempt the instruction.
 */
export async function deposit(_params: {
  treasuryTokenAccount: string;
  amountMinor: bigint;
}): Promise<{ txSignature: string; error?: string }> {
  return {
    txSignature: "",
    error:
      "Confidential Transfer is temporarily disabled on devnet/mainnet (Solana ZK ElGamal audit). Deposit step will work when CT is re-enabled.",
  };
}

export async function applyPending(_params: {
  account: "treasury" | "vendor";
  tokenAccount: string;
}): Promise<{ txSignature: string; error?: string }> {
  return {
    txSignature: "",
    error:
      "Confidential Transfer is temporarily disabled on devnet/mainnet (Solana ZK ElGamal audit). ApplyPendingBalance will work when CT is re-enabled.",
  };
}

export async function confidentialTransfer(_params: {
  treasuryTokenAccount: string;
  vendorTokenAccount: string;
  amountMinor: bigint;
}): Promise<{ txSignature: string; error?: string }> {
  return {
    txSignature: "",
    error:
      "Confidential Transfer is temporarily disabled on devnet/mainnet (Solana ZK ElGamal audit). Transfer will work when CT is re-enabled.",
  };
}

export async function withdraw(_params: {
  vendorTokenAccount: string;
  amountMinor: bigint;
}): Promise<{ txSignature: string; error?: string }> {
  return {
    txSignature: "",
    error:
      "Confidential Transfer is temporarily disabled on devnet/mainnet (Solana ZK ElGamal audit). Withdraw will work when CT is re-enabled.",
  };
}

export async function getTokenAccountBalance(
  connection: Connection,
  tokenAccount: string,
  programId: PublicKey
): Promise<string> {
  try {
    const account = await getAccount(
      connection,
      new PublicKey(tokenAccount),
      "confirmed",
      programId
    );
    return account.amount.toString();
  } catch {
    return "0";
  }
}
