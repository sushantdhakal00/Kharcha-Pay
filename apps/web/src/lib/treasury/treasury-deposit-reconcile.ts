import { PublicKey } from "@solana/web3.js";
import { TreasuryDepositIntentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureOrgTreasuryWallet } from "./treasury-service";
import { getSolanaConnectionForCluster } from "@/lib/solana/rpc";

export interface TokenBalanceChange {
  sig: string;
  blockTime: number;
  mint: string;
  tokenAccount: string;
  preAmount: string;
  postAmount: string;
  decimals: number;
  increase: bigint;
}

export type MatchResult =
  | { kind: "match"; candidate: TokenBalanceChange }
  | { kind: "none"; reason: string }
  | { kind: "multiple"; reason: string };

export function selectBestTokenIncreaseMatch(
  intentAmountMinor: bigint,
  intentCurrencyDecimals: number,
  candidates: TokenBalanceChange[],
  windowStart: number,
  windowEnd: number
): MatchResult {
  const filtered = candidates.filter(
    (c) => c.increase > BigInt(0) && c.blockTime >= windowStart && c.blockTime <= windowEnd
  );

  if (filtered.length === 0) {
    return { kind: "none", reason: "No matching on-chain transfer found in last 50 txs" };
  }

  const exactMatches: TokenBalanceChange[] = [];

  for (const c of filtered) {
    if (c.decimals >= intentCurrencyDecimals) {
      const scaleFactor = BigInt(10 ** (c.decimals - intentCurrencyDecimals));
      const expectedRaw = intentAmountMinor * scaleFactor;
      if (c.increase === expectedRaw) {
        exactMatches.push(c);
      }
    }
  }

  if (exactMatches.length === 1) {
    return { kind: "match", candidate: exactMatches[0] };
  }

  if (exactMatches.length > 1) {
    return { kind: "multiple", reason: "Multiple possible matches; manual review required" };
  }

  return { kind: "none", reason: "No matching on-chain transfer found in last 50 txs" };
}

const TIME_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function reconcileDepositIntent(orgId: string, intentId: string) {
  const intent = await prisma.treasuryDepositIntent.findFirstOrThrow({
    where: { id: intentId, orgId },
  });

  if (intent.status === TreasuryDepositIntentStatus.RECONCILED) {
    return intent;
  }
  if (intent.status !== TreasuryDepositIntentStatus.COMPLETED) {
    return intent;
  }

  const wallet = await ensureOrgTreasuryWallet(orgId);
  const connection = getSolanaConnectionForCluster(wallet.cluster);
  const treasuryPubkey = new PublicKey(wallet.treasuryPubkey);

  const sigs = await connection.getSignaturesForAddress(treasuryPubkey, { limit: 50 });
  if (sigs.length === 0) {
    return prisma.treasuryDepositIntent.update({
      where: { id: intent.id },
      data: { reconciliationNote: "No recent transactions found for treasury address" },
    });
  }

  const candidates: TokenBalanceChange[] = [];

  for (const sigInfo of sigs) {
    if (sigInfo.err) continue;

    let tx;
    try {
      tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      continue;
    }
    if (!tx?.meta) continue;

    const preTokenBalances = tx.meta.preTokenBalances ?? [];
    const postTokenBalances = tx.meta.postTokenBalances ?? [];

    const postByIndex = new Map<number, (typeof postTokenBalances)[0]>();
    for (const p of postTokenBalances) {
      postByIndex.set(p.accountIndex, p);
    }

    for (const pre of preTokenBalances) {
      const post = postByIndex.get(pre.accountIndex);
      if (!post) continue;

      const owner = post.owner ?? pre.owner;
      if (owner !== wallet.treasuryPubkey) continue;

      const preRaw = BigInt(pre.uiTokenAmount?.amount ?? "0");
      const postRaw = BigInt(post.uiTokenAmount?.amount ?? "0");
      if (postRaw <= preRaw) continue;

      const accountKeys = tx.transaction.message.accountKeys;
      const tokenAccount =
        pre.accountIndex < accountKeys.length
          ? accountKeys[pre.accountIndex].pubkey.toString()
          : "";

      candidates.push({
        sig: sigInfo.signature,
        blockTime: sigInfo.blockTime ?? 0,
        mint: post.mint,
        tokenAccount,
        preAmount: preRaw.toString(),
        postAmount: postRaw.toString(),
        decimals: post.uiTokenAmount?.decimals ?? 0,
        increase: postRaw - preRaw,
      });
    }

    for (const post of postTokenBalances) {
      if (postByIndex.has(post.accountIndex) && preTokenBalances.some(p => p.accountIndex === post.accountIndex)) {
        continue;
      }

      const owner = post.owner;
      if (owner !== wallet.treasuryPubkey) continue;

      const postRaw = BigInt(post.uiTokenAmount?.amount ?? "0");
      if (postRaw <= BigInt(0)) continue;

      const accountKeys = tx.transaction.message.accountKeys;
      const tokenAccount =
        post.accountIndex < accountKeys.length
          ? accountKeys[post.accountIndex].pubkey.toString()
          : "";

      candidates.push({
        sig: sigInfo.signature,
        blockTime: sigInfo.blockTime ?? 0,
        mint: post.mint,
        tokenAccount,
        preAmount: "0",
        postAmount: postRaw.toString(),
        decimals: post.uiTokenAmount?.decimals ?? 0,
        increase: postRaw,
      });
    }
  }

  const completedAt = intent.updatedAt.getTime() / 1000;
  const windowStart = Math.floor(completedAt - TIME_WINDOW_MS / 1000);
  const windowEnd = Math.floor(completedAt + TIME_WINDOW_MS / 1000);

  const currencyDecimals = 2;
  const result = selectBestTokenIncreaseMatch(
    intent.amountMinor,
    currencyDecimals,
    candidates,
    windowStart,
    windowEnd
  );

  if (result.kind === "match") {
    return prisma.treasuryDepositIntent.update({
      where: { id: intent.id },
      data: {
        status: TreasuryDepositIntentStatus.RECONCILED,
        reconciledAt: new Date(),
        reconciledTxSig: result.candidate.sig,
        reconciledTokenMint: result.candidate.mint,
        reconciledTokenAccount: result.candidate.tokenAccount,
        reconciliationNote: null,
      },
    });
  }

  return prisma.treasuryDepositIntent.update({
    where: { id: intent.id },
    data: { reconciliationNote: result.reason },
  });
}
