/**
 * Payment verification: compares on-chain transaction against expected request data.
 * Uses Token-2022 + Required Memo; fetches tx and validates memo, amount, source, destination, mint.
 * Commitment: confirmed (matches Day 5 pay flow). Tx must be confirmed.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getConnection } from "./connection";
import { withTimeout, RPC_GET_TX_TIMEOUT_MS, RpcNotConfiguredError } from "./rpc";
import { buildRequestMemo } from "./payments";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const TRANSFER_IX_INDEX = 3; // SPL Token Transfer instruction

export type VerificationStatus = "VERIFIED" | "WARNING" | "FAILED" | "PENDING";

export interface VerifyPaymentResult {
  status: VerificationStatus;
  reasons: string[];
  observed?: {
    memo?: string;
    amountMinor?: string;
    source?: string;
    destination?: string;
    mint?: string;
    tokenProgram?: string;
  };
  expected?: {
    memo: string;
    amountMinor: string;
    source: string;
    destination: string;
    mint: string;
    tokenProgram: string;
  };
  chainSlot?: bigint;
  blockTime?: number | null;
}

/**
 * RPC client interface for verification. Allows injection of a mock for tests.
 */
export interface VerifyRpcClient {
  getTransaction(sig: string, opts?: { commitment?: string; maxSupportedTransactionVersion?: number }): Promise<{
    transaction?: { message: unknown };
    meta?: { err?: unknown; loadedAddresses?: { writable?: string[]; readonly?: string[] } };
    slot?: number;
    blockTime?: number | null;
  } | null>;
  getParsedAccountInfo?(pubkey: { toBase58?: () => string }): Promise<{ value?: { data?: unknown } } | null>;
}

/**
 * Verify a paid request against on-chain transaction.
 * Returns normalized result with status, reasons, and observed vs expected.
 * Commitment: confirmed (per Day 5 pay flow). Document: we verify tx is confirmed.
 * Pass `rpc` for tests (mock); otherwise uses live connection.
 */
export async function verifyPaymentOnChain(input: {
  orgId: string;
  requestId: string;
  request: {
    paidTxSig: string | null;
    amountMinor: bigint;
  };
  vendor: {
    tokenAccount: string | null;
    ownerPubkey: string | null;
  };
  org: {
    slug: string;
  };
  chainConfig: {
    token2022Mint: string | null;
    treasuryTokenAccount: string | null;
    treasuryOwnerPubkey: string;
    tokenProgramId: string;
  };
  rpc?: VerifyRpcClient;
}): Promise<VerifyPaymentResult> {
  const { requestId, request, vendor, org, chainConfig, rpc } = input;

  const reasons: string[] = [];

  if (!request.paidTxSig || request.paidTxSig.trim() === "") {
    return {
      status: "FAILED",
      reasons: ["Transaction not found"],
      expected: {
        memo: buildRequestMemo(requestId, org.slug),
        amountMinor: request.amountMinor.toString(),
        source: chainConfig.treasuryTokenAccount ?? chainConfig.treasuryOwnerPubkey,
        destination: vendor.tokenAccount ?? vendor.ownerPubkey ?? "",
        mint: chainConfig.token2022Mint ?? "",
        tokenProgram: chainConfig.tokenProgramId,
      },
    };
  }

  const expectedMemo = buildRequestMemo(requestId, org.slug);
  const expectedSource = chainConfig.treasuryTokenAccount ?? "";
  const expectedDest = vendor.tokenAccount ?? vendor.ownerPubkey ?? "";
  const expectedMint = chainConfig.token2022Mint ?? "";

  let connection: VerifyRpcClient;
  try {
    connection = (rpc ?? getConnection()) as VerifyRpcClient;
  } catch (e) {
    if (e instanceof RpcNotConfiguredError) {
      return {
        status: "FAILED",
        reasons: ["RPC_NOT_CONFIGURED"],
        expected: {
          memo: expectedMemo,
          amountMinor: request.amountMinor.toString(),
          source: expectedSource,
          destination: expectedDest,
          mint: expectedMint,
          tokenProgram: chainConfig.tokenProgramId,
        },
      };
    }
    throw e;
  }

  try {
    const txResponse = await withTimeout(
      connection.getTransaction(request.paidTxSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
      RPC_GET_TX_TIMEOUT_MS
    );

    if (!txResponse || !txResponse.transaction) {
      return {
        status: "FAILED",
        reasons: ["Transaction not found"],
        observed: undefined,
        expected: {
          memo: expectedMemo,
          amountMinor: request.amountMinor.toString(),
          source: expectedSource,
          destination: expectedDest,
          mint: expectedMint,
          tokenProgram: chainConfig.tokenProgramId,
        },
      };
    }

    const meta = txResponse.meta;
    const err = meta?.err;
    if (err) {
      return {
        status: "FAILED",
        reasons: [`Transaction failed on-chain: ${JSON.stringify(err)}`],
        chainSlot: txResponse.slot != null ? BigInt(txResponse.slot) : undefined,
        blockTime: txResponse.blockTime ?? undefined,
        expected: {
          memo: expectedMemo,
          amountMinor: request.amountMinor.toString(),
          source: expectedSource,
          destination: expectedDest,
          mint: expectedMint,
          tokenProgram: chainConfig.tokenProgramId,
        },
      };
    }

    type MsgShape = {
      accountKeys?: string[] | { toBase58?: () => string }[];
      staticAccountKeys?: string[] | { toBase58?: () => string }[];
      instructions?: Array<{ programIdIndex?: number; accounts?: number[]; data: string | Uint8Array }>;
    };
    const msg = txResponse.transaction.message as unknown as MsgShape;
    const metaLoaded = txResponse.meta?.loadedAddresses as { writable?: string[]; readonly?: string[] } | undefined;

    function toBase58(k: string | { toBase58?: () => string }): string {
      return typeof k === "string" ? k : (k as { toBase58?: () => string }).toBase58?.() ?? "";
    }

    const accountKeys: string[] = msg.accountKeys
      ? (msg.accountKeys as (string | { toBase58?: () => string })[]).map(toBase58)
      : [
          ...((msg.staticAccountKeys ?? []) as (string | { toBase58?: () => string })[]).map(toBase58),
          ...(metaLoaded?.writable ?? []),
          ...(metaLoaded?.readonly ?? []),
        ];

    const instructions = msg.instructions ?? [];
    if (!Array.isArray(instructions) || instructions.length === 0) {
      return {
        status: "FAILED",
        reasons: ["No instructions in transaction"],
        chainSlot: txResponse.slot != null ? BigInt(txResponse.slot) : undefined,
        blockTime: txResponse.blockTime ?? undefined,
        expected: {
          memo: expectedMemo,
          amountMinor: request.amountMinor.toString(),
          source: expectedSource,
          destination: expectedDest,
          mint: expectedMint,
          tokenProgram: chainConfig.tokenProgramId,
        },
      };
    }

    let observedMemo: string | undefined;
    let observedAmount: bigint | undefined;
    let observedSource: string | undefined;
    let observedDest: string | undefined;
    let observedMint: string | undefined;
    let observedTokenProgram: string | undefined;

    const token2022Id = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

    for (const ix of instructions) {
      const pi = ix.programIdIndex ?? 0;
      const programIdStr = typeof accountKeys[pi] === "string" ? accountKeys[pi] : "";

      const data = ix.data;
      let dataBytes: Uint8Array;
      if (typeof data === "string") {
        dataBytes = new Uint8Array(Buffer.from(data, "base64"));
      } else if (data instanceof Uint8Array) {
        dataBytes = data;
      } else if (Buffer.isBuffer(data)) {
        dataBytes = new Uint8Array(data);
      } else {
        continue;
      }

      if (programIdStr === MEMO_PROGRAM_ID) {
        observedMemo = new TextDecoder().decode(dataBytes).trim();
        continue;
      }

      if (programIdStr === chainConfig.tokenProgramId || programIdStr === token2022Id) {
        if (dataBytes.length >= 9 && dataBytes[0] === TRANSFER_IX_INDEX) {
          observedTokenProgram = programIdStr;
          let amt = BigInt(0);
          for (let i = 1; i < 9; i++) amt |= BigInt(dataBytes[i] ?? 0) << BigInt((i - 1) * 8);
          observedAmount = amt;
          const accts = ix.accounts ?? [];
          if (accts.length >= 2) {
            observedSource = typeof accountKeys[accts[0]] === "string" ? accountKeys[accts[0]] : "";
            observedDest = typeof accountKeys[accts[1]] === "string" ? accountKeys[accts[1]] : "";
          }
          if (observedSource && connection.getParsedAccountInfo) {
            const tokenMint = await getMintFromTokenAccount(connection as Connection, observedSource);
            if (tokenMint) observedMint = tokenMint;
          }
          break;
        }
      }
    }

    if (!observedMemo) reasons.push("Memo mismatch");
    else if (observedMemo !== expectedMemo) reasons.push("Memo mismatch");

    if (observedAmount === undefined) reasons.push("Transfer instruction not found");
    else if (observedAmount !== request.amountMinor) {
      reasons.push("Amount differs");
    }

    if (expectedSource && observedSource && observedSource !== expectedSource) {
      reasons.push("Wrong source (treasury)");
    }
    if (expectedDest && observedDest && observedDest !== expectedDest) {
      reasons.push("Wrong recipient");
    }
    if (expectedMint && observedMint && observedMint !== expectedMint) {
      reasons.push("Wrong token mint");
    }
    const expectedTokenProgram = chainConfig.tokenProgramId;
    if (observedTokenProgram && observedTokenProgram !== expectedTokenProgram) {
      reasons.push("Wrong token program");
    }

    const observed = {
      memo: observedMemo,
      amountMinor: observedAmount?.toString(),
      source: observedSource,
      destination: observedDest,
      mint: observedMint,
      tokenProgram: observedTokenProgram,
    };

    const expected = {
      memo: expectedMemo,
      amountMinor: request.amountMinor.toString(),
      source: expectedSource,
      destination: expectedDest,
      mint: expectedMint,
      tokenProgram: expectedTokenProgram,
    };

    if (reasons.length === 0) {
      return {
        status: "VERIFIED",
        reasons: [],
        observed,
        expected,
        chainSlot: txResponse.slot != null ? BigInt(txResponse.slot) : undefined,
        blockTime: txResponse.blockTime ?? undefined,
      };
    }

    const hasAmountMismatch = reasons.includes("Amount differs");
    const status: VerificationStatus = hasAmountMismatch ? "FAILED" : reasons.length > 0 ? "FAILED" : "VERIFIED";

    return {
      status,
      reasons,
      observed,
      expected,
      chainSlot: txResponse.slot != null ? BigInt(txResponse.slot) : undefined,
        blockTime: txResponse.blockTime ?? undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code = /RPC_TIMEOUT|timeout|timed out|ETIMEDOUT/i.test(message)
      ? "RPC_TIMEOUT"
      : /ECONNREFUSED|fetch failed|unavailable|RPC_UNAVAILABLE/i.test(message)
        ? "RPC_UNAVAILABLE"
        : "RPC_ERROR";
    return {
      status: "FAILED",
      reasons: [code],
      expected: {
        memo: expectedMemo,
        amountMinor: request.amountMinor.toString(),
        source: expectedSource,
        destination: expectedDest,
        mint: expectedMint,
        tokenProgram: chainConfig.tokenProgramId,
      },
    };
  }
}

async function getMintFromTokenAccount(connection: Connection, tokenAccountPubkey: string): Promise<string | null> {
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(tokenAccountPubkey));
    const parsed = (info.value?.data as { parsed?: { info?: { mint?: string } } })?.parsed?.info;
    return parsed?.mint ?? null;
  } catch {
    return null;
  }
}
