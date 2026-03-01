/**
 * Verifies a native SOL transfer transaction: destination=treasury, memo contains reference.
 * Uses mainnet RPC. Commitment: confirmed.
 */
import { getMainnetConnection } from "@/lib/solana/mainnet-rpc";
import { withTimeout, RPC_GET_TX_TIMEOUT_MS } from "@/lib/solana/rpc";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const TRANSFER_IX_ID = 2;

type MsgShape = {
  accountKeys?: (string | { toBase58?: () => string })[];
  staticAccountKeys?: (string | { toBase58?: () => string })[];
  instructions?: Array<{
    programIdIndex?: number;
    accounts?: number[];
    data: string | number[] | Uint8Array;
  }>;
};

export interface VerifySolTransferResult {
  ok: boolean;
  lamports?: bigint;
  memoMatches?: boolean;
  error?: string;
  slot?: number;
  blockTime?: number | null;
}

function toBase58(k: string | { toBase58?: () => string }): string {
  return typeof k === "string" ? k : (k as { toBase58?: () => string }).toBase58?.() ?? "";
}

function getAccountKeys(msg: MsgShape, metaLoaded?: { writable?: string[]; readonly?: string[] }): string[] {
  const staticKeys = (msg.staticAccountKeys ?? msg.accountKeys ?? []).map(toBase58);
  const loadedW = metaLoaded?.writable ?? [];
  const loadedR = metaLoaded?.readonly ?? [];
  return [...staticKeys, ...loadedW, ...loadedR];
}

function parseLamports(data: string | number[] | Uint8Array): bigint {
  const bytes = typeof data === "string"
    ? Buffer.from(data, "base64")
    : Array.isArray(data)
      ? new Uint8Array(data)
      : data;
  if (bytes.length < 9) return BigInt(0);
  const buf = Buffer.from(bytes);
  const ixId = buf.readUInt8(0);
  if (ixId !== TRANSFER_IX_ID) return BigInt(0);
  return buf.readBigUInt64LE(1);
}

export async function verifySolTransferToTreasury(input: {
  signature: string;
  treasuryPubkey: string;
  reference: string;
}): Promise<VerifySolTransferResult> {
  const { signature, treasuryPubkey, reference } = input;
  const conn = getMainnetConnection();

  const txResponse = await withTimeout(
    conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    }),
    RPC_GET_TX_TIMEOUT_MS
  );

  if (!txResponse || !txResponse.transaction) {
    return { ok: false, error: "Transaction not found" };
  }

  const meta = txResponse.meta;
  if (meta?.err) {
    return { ok: false, error: `Transaction failed: ${JSON.stringify(meta.err)}` };
  }

  const msg = txResponse.transaction.message as unknown as MsgShape;
  const metaLoaded = txResponse.meta?.loadedAddresses as
    | { writable?: string[]; readonly?: string[] }
    | undefined;
  const accountKeys = getAccountKeys(msg, metaLoaded);
  const instructions = msg.instructions ?? [];
  const programIds = accountKeys;

  let totalLamports = BigInt(0);
  let memoMatches = false;

  for (const ix of instructions) {
    const programId = programIds[ix.programIdIndex ?? 0];
    const programIdStr = typeof programId === "string" ? programId : toBase58(programId as { toBase58?: () => string });

    if (programIdStr === SYSTEM_PROGRAM_ID) {
      const lamports = parseLamports(ix.data);
      const accounts = ix.accounts ?? [];
      const toIndex = accounts[1];
      if (toIndex !== undefined) {
        const toAccount = accountKeys[toIndex];
        const toStr = typeof toAccount === "string" ? toAccount : toBase58(toAccount as { toBase58?: () => string });
        if (toStr === treasuryPubkey && lamports > 0) {
          totalLamports += lamports;
        }
      }
    }

    if (programIdStr === MEMO_PROGRAM_ID) {
      let memoData = "";
      if (typeof ix.data === "string") {
        memoData = Buffer.from(ix.data, "base64").toString("utf8");
      } else if (ix.data instanceof Uint8Array) {
        memoData = Buffer.from(ix.data).toString("utf8");
      } else if (Array.isArray(ix.data)) {
        memoData = Buffer.from(new Uint8Array(ix.data)).toString("utf8");
      }
      if (memoData.includes(reference)) {
        memoMatches = true;
      }
    }
  }

  if (totalLamports === BigInt(0)) {
    return {
      ok: false,
      error: "No SOL transfer to treasury found in transaction",
      slot: txResponse.slot ?? undefined,
      blockTime: txResponse.blockTime ?? undefined,
    };
  }

  if (!memoMatches) {
    return {
      ok: false,
      error: `Memo must include reference: ${reference}`,
      lamports: totalLamports,
      slot: txResponse.slot ?? undefined,
      blockTime: txResponse.blockTime ?? undefined,
    };
  }

  return {
    ok: true,
    lamports: totalLamports,
    memoMatches: true,
    slot: txResponse.slot ?? undefined,
    blockTime: txResponse.blockTime ?? undefined,
  };
}

/**
 * Verifies a native SOL transfer TO a unique deposit address (no memo required).
 * Used for Bitrefill-style unique address flow.
 */
export async function verifySolTransferToDepositAddress(input: {
  signature: string;
  depositPubkey: string;
}): Promise<VerifySolTransferResult> {
  const { signature, depositPubkey } = input;
  const conn = getMainnetConnection();

  const txResponse = await withTimeout(
    conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    }),
    RPC_GET_TX_TIMEOUT_MS
  );

  if (!txResponse || !txResponse.transaction) {
    return { ok: false, error: "Transaction not found" };
  }

  const meta = txResponse.meta;
  if (meta?.err) {
    return { ok: false, error: `Transaction failed: ${JSON.stringify(meta.err)}` };
  }

  const msg = txResponse.transaction.message as unknown as MsgShape;
  const metaLoaded = txResponse.meta?.loadedAddresses as
    | { writable?: string[]; readonly?: string[] }
    | undefined;
  const accountKeys = getAccountKeys(msg, metaLoaded);
  const instructions = msg.instructions ?? [];
  const programIds = accountKeys;

  let totalLamports = BigInt(0);

  for (const ix of instructions) {
    const programId = programIds[ix.programIdIndex ?? 0];
    const programIdStr = typeof programId === "string" ? programId : toBase58(programId as { toBase58?: () => string });

    if (programIdStr === SYSTEM_PROGRAM_ID) {
      const lamports = parseLamports(ix.data);
      const accounts = ix.accounts ?? [];
      const toIndex = accounts[1];
      if (toIndex !== undefined) {
        const toAccount = accountKeys[toIndex];
        const toStr = typeof toAccount === "string" ? toAccount : toBase58(toAccount as { toBase58?: () => string });
        if (toStr === depositPubkey && lamports > 0) {
          totalLamports += lamports;
        }
      }
    }
  }

  if (totalLamports === BigInt(0)) {
    return {
      ok: false,
      error: `No SOL transfer to deposit address ${depositPubkey} found in transaction`,
      slot: txResponse.slot ?? undefined,
      blockTime: txResponse.blockTime ?? undefined,
    };
  }

  return {
    ok: true,
    lamports: totalLamports,
    slot: txResponse.slot ?? undefined,
    blockTime: txResponse.blockTime ?? undefined,
  };
}
