"use client";

import { useState, useCallback } from "react";

const SOLANA_RPC = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com")
  : "https://api.mainnet-beta.solana.com";

type WalletType = "phantom" | "solflare" | "okx" | "metamask";

type WalletInfo = {
  type: WalletType;
  name: string;
  icon: string;
  check: () => boolean;
  getProvider: () => Promise<{ connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signAndSendTransaction: (tx: object) => Promise<{ signature: string } | string> } | null>;
};

const WALLETS: WalletInfo[] = [
  {
    type: "phantom",
    name: "Phantom",
    icon: "👻",
    check: () => typeof window !== "undefined" && !!(window as unknown as { phantom?: { solana?: unknown } }).phantom?.solana,
    getProvider: async () => {
      const w = typeof window !== "undefined" ? (window as unknown as { phantom?: { solana?: { connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signAndSendTransaction: (tx: object) => Promise<{ signature: string }> } } }) : null;
      return w?.phantom?.solana ?? null;
    },
  },
  {
    type: "solflare",
    name: "Solflare",
    icon: "🔥",
    check: () => typeof window !== "undefined" && !!(window as unknown as { solflare?: { isSolflare?: boolean } }).solflare?.isSolflare,
    getProvider: async () => {
      const w = typeof window !== "undefined" ? (window as unknown as { solflare?: { connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signAndSendTransaction: (tx: object) => Promise<{ signature: string }> } }) : null;
      return w?.solflare ?? null;
    },
  },
  {
    type: "okx",
    name: "OKX",
    icon: "🔷",
    check: () => typeof window !== "undefined" && !!(window as unknown as { okxwallet?: { solana?: unknown } }).okxwallet?.solana,
    getProvider: async () => {
      const w = typeof window !== "undefined" ? (window as unknown as { okxwallet?: { solana?: { connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signAndSendTransaction: (tx: object) => Promise<{ signature: string }> } } }) : null;
      return w?.okxwallet?.solana ?? null;
    },
  },
  {
    type: "metamask",
    name: "MetaMask (Solana)",
    icon: "🦊",
    check: () => {
      if (typeof window === "undefined") return false;
      const eth = (window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum;
      return !!eth?.isMetaMask;
    },
    getProvider: async () => {
      const w = typeof window !== "undefined" ? (window as unknown as { ethereum?: { solana?: { connect: () => Promise<{ publicKey: { toBase58: () => string } }>; signAndSendTransaction: (tx: object) => Promise<{ signature: string }> } } }) : null;
      return w?.ethereum?.solana ?? null;
    },
  },
];

export function PayWithWallet({
  depositAddress,
  useMemo: includeMemo,
  reference,
  lamports,
  onSignature,
  onError,
  disabled,
}: {
  depositAddress: string;
  useMemo?: boolean;
  reference?: string;
  lamports: string;
  onSignature: (signature: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [paying, setPaying] = useState<WalletType | null>(null);

  const handlePay = useCallback(
    async (wallet: WalletInfo) => {
      if (disabled || paying) return;
      if (!wallet.check()) {
        onError(`${wallet.name} not detected. Install the extension from ${wallet.type === "phantom" ? "phantom.app" : wallet.type === "solflare" ? "solflare.com" : wallet.type === "okx" ? "okx.com" : "metamask.io"}.`);
        return;
      }

      setPaying(wallet.type);
      onError("");

      try {
        const provider = await wallet.getProvider();
        if (!provider) {
          onError(`${wallet.name} not available. Make sure the extension is installed and unlocked.`);
          return;
        }

        const { Connection, PublicKey, Transaction, SystemProgram } = await import("@solana/web3.js");

        const resp = await provider.connect();
        const publicKey = new PublicKey(resp.publicKey.toBase58());

        const connection = new Connection(SOLANA_RPC);
        const { blockhash } = await connection.getLatestBlockhashAndContext("confirmed").then((r) => r.value);

        const tx = new Transaction();
        tx.feePayer = publicKey;
        tx.recentBlockhash = blockhash;

        const toPubkey = new PublicKey(depositAddress);
        const lamportsNum = BigInt(lamports);

        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey,
            lamports: lamportsNum,
          })
        );

        if (includeMemo && reference) {
          const { createMemoInstruction } = await import("@solana/spl-memo");
          tx.add(createMemoInstruction(reference, [publicKey]));
        }

        const result = await provider.signAndSendTransaction(tx);
        const signature = typeof result === "string" ? result : result.signature;
        onSignature(signature);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("User rejected") || msg.includes("request rejected") || msg.includes("User denied")) {
          onError("Transaction cancelled.");
        } else {
          onError(msg || "Payment failed. Try again.");
        }
      } finally {
        setPaying(null);
      }
    },
    [depositAddress, includeMemo, reference, lamports, onSignature, onError, disabled, paying]
  );

  const available = WALLETS.filter((w) => w.check());

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Pay with wallet (one click)</p>
      <p className="text-xs text-slate-600">
        Click your wallet — it will pop up with the amount pre-filled. Approve to pay.
      </p>
      <div className="flex flex-wrap gap-2">
        {WALLETS.map((wallet) => (
          <button
            key={wallet.type}
            type="button"
            onClick={() => handlePay(wallet)}
            disabled={disabled || !!paying || !wallet.check()}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              wallet.check()
                ? "border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            }`}
            title={wallet.check() ? `Pay with ${wallet.name}` : `${wallet.name} not installed`}
          >
            <span>{wallet.icon}</span>
            <span>{wallet.name}</span>
            {paying === wallet.type && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            )}
          </button>
        ))}
      </div>
      {available.length === 0 && (
        <p className="text-xs text-amber-700">
          No wallet detected. Install Phantom, Solflare, OKX, or MetaMask (Solana) to pay with one click.
        </p>
      )}
    </div>
  );
}
