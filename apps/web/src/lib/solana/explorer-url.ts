/**
 * Returns Solana Explorer URL for a transaction signature.
 * @param signature - Transaction signature
 * @param cluster - devnet | mainnet-beta; defaults to devnet if unknown
 */
export function getExplorerTxUrl(signature: string, cluster?: string | null): string {
  const c = cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";
  return `https://explorer.solana.com/tx/${signature}?cluster=${c}`;
}
