"use client";

import { useState, useCallback, useEffect } from "react";
import {
  confirmSubmittedTransaction,
  connectSolanaWallet,
  getClientSolanaRpcUrl,
  getSolanaWalletAvailability,
  type SolanaWalletAvailability,
  type WalletType,
} from "@/lib/solana/browser-wallets";

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
  const [wallets, setWallets] = useState<SolanaWalletAvailability[]>(() =>
    getSolanaWalletAvailability()
  );

  useEffect(() => {
    function refreshWallets() {
      setWallets(getSolanaWalletAvailability());
    }

    refreshWallets();
    const intervalId = window.setInterval(refreshWallets, 750);
    const timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 10_000);
    window.addEventListener("focus", refreshWallets);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", refreshWallets);
    };
  }, []);

  const handlePay = useCallback(
    async (wallet: SolanaWalletAvailability) => {
      if (disabled || paying) return;
      if (!wallet.available) {
        onError(wallet.title);
        return;
      }

      setPaying(wallet.type);
      onError("");

      try {
        const { Connection, PublicKey, Transaction, SystemProgram } = await import("@solana/web3.js");
        const session = await connectSolanaWallet(wallet.type);
        const payer = new PublicKey(session.address);

        const connection = new Connection(getClientSolanaRpcUrl(), {
          commitment: "confirmed",
        });
        const latestBlockhash = await connection.getLatestBlockhash("confirmed");

        const tx = new Transaction();
        tx.feePayer = payer;
        tx.recentBlockhash = latestBlockhash.blockhash;

        const toPubkey = new PublicKey(depositAddress);
        const lamportsNum = BigInt(lamports);

        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey,
            lamports: lamportsNum,
          })
        );

        if (includeMemo && reference) {
          const { createMemoInstruction } = await import("@solana/spl-memo");
          tx.add(createMemoInstruction(reference, [payer]));
        }

        const signature = await session.sendLegacyTransaction(tx, connection);
        await confirmSubmittedTransaction(connection, signature, latestBlockhash);
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

  const hasInstalledInjectedWallet = wallets.some(
    (wallet) => wallet.type !== "metamask" && wallet.installed
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Pay with wallet (one click)</p>
      <p className="text-xs text-slate-600">
        Click your wallet — it will pop up with the amount pre-filled. Approve to pay.
      </p>
      <div className="flex flex-wrap gap-2">
        {wallets.map((wallet) => (
          <button
            key={wallet.type}
            type="button"
            onClick={() => handlePay(wallet)}
            disabled={disabled || !!paying || !wallet.available}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              wallet.available
                ? "border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            }`}
            title={wallet.title}
          >
            <span>{wallet.icon}</span>
            <span>{wallet.name}</span>
            {paying === wallet.type && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            )}
          </button>
        ))}
      </div>
      {!hasInstalledInjectedWallet && (
        <p className="text-xs text-amber-700">
          No injected wallet detected. Install Phantom, Solflare, or OKX, or use MetaMask Connect.
        </p>
      )}
    </div>
  );
}
