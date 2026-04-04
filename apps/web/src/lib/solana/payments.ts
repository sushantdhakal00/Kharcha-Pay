import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createInitializeAccountInstruction,
  createTransferInstruction,
  createEnableRequiredMemoTransfersInstruction,
  getAccountLen,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { createMemoInstruction } from "@solana/spl-memo";
const COMMITMENT = "confirmed" as const;

/**
 * Build a memo instruction for Token-2022 required-memo transfers.
 * The memo must appear in the same transaction and immediately before the transfer instruction.
 */
export function buildMemoInstruction(message: string, signerPubkeys: PublicKey[] = []) {
  return createMemoInstruction(message, signerPubkeys.length ? signerPubkeys : undefined);
}

/**
 * Enable Required Memo Transfers on an existing Token-2022 account.
 * The account must have been created with space for the MemoTransfer extension.
 * Owner must sign the transaction.
 */
export async function enableRequiredMemoTransfers(
  connection: Connection,
  payer: Keypair,
  tokenAccount: PublicKey,
  owner: Keypair,
  programId: PublicKey = TOKEN_2022_PROGRAM_ID
): Promise<string> {
  const tx = new Transaction().add(
    createEnableRequiredMemoTransfersInstruction(tokenAccount, owner.publicKey, [], programId)
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, owner], {
    commitment: COMMITMENT,
    skipPreflight: false,
  });
  return sig;
}

/**
 * Get or create a vendor Token-2022 account with MemoTransfer extension enabled.
 * If existingTokenAccount is provided and non-empty, returns it (caller must ensure memo is enabled if required).
 * Otherwise creates a new account with ExtensionType.MemoTransfer, initializes it, and enables required memo.
 * Owner must sign for the enable step; for demo, pass treasury as ownerKeypair when vendor.ownerPubkey = treasury.
 *
 * @returns The vendor token account address (base58).
 */
export async function getOrCreateVendorAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  ownerPubkey: PublicKey,
  existingTokenAccount: string | null,
  ownerKeypair: Keypair,
  programId: PublicKey = TOKEN_2022_PROGRAM_ID
): Promise<string> {
  if (existingTokenAccount && existingTokenAccount.trim() !== "") {
    return existingTokenAccount;
  }

  const accountKeypair = Keypair.generate();
  const extensions = [ExtensionType.MemoTransfer];
  const space = getAccountLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: accountKeypair.publicKey,
    space,
    lamports,
    programId,
  });

  const initAccountIx = createInitializeAccountInstruction(
    accountKeypair.publicKey,
    mint,
    ownerPubkey,
    programId
  );

  const enableMemoIx = createEnableRequiredMemoTransfersInstruction(
    accountKeypair.publicKey,
    ownerKeypair.publicKey,
    [],
    programId
  );

  const tx = new Transaction().add(createAccountIx, initAccountIx, enableMemoIx);
  const signers = [payer, accountKeypair, ownerKeypair];
  await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: COMMITMENT,
    skipPreflight: false,
  });

  return accountKeypair.publicKey.toBase58();
}

/**
 * Transfer tokens with a memo instruction immediately before the transfer (Token-2022 Required Memo).
 * Uses treasury as owner/signer. Commitment: confirmed.
 */
export async function transferWithMemo(
  connection: Connection,
  treasuryKeypair: Keypair,
  treasuryTokenAccount: PublicKey,
  vendorTokenAccount: PublicKey,
  mint: PublicKey,
  amount: bigint,
  memoMessage: string,
  programId: PublicKey = TOKEN_2022_PROGRAM_ID
): Promise<string> {
  const memoIx = buildMemoInstruction(memoMessage, [treasuryKeypair.publicKey]);
  const transferIx = createTransferInstruction(
    treasuryTokenAccount,
    vendorTokenAccount,
    treasuryKeypair.publicKey,
    amount,
    [],
    programId
  );

  const tx = new Transaction().add(memoIx, transferIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair], {
    commitment: COMMITMENT,
    skipPreflight: false,
  });
  return sig;
}

/**
 * Build memo message for KharchaPay request payout (Request-ID + optional org slug).
 */
export function buildRequestMemo(requestId: string, orgSlug?: string): string {
  const parts = ["KharchaPay Request", requestId];
  if (orgSlug) parts.push(orgSlug);
  return parts.join(" ");
}
