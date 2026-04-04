/**
 * Mainnet RPC connection for org setup payments.
 * Uses SOLANA_RPC_URL_MAINNET or falls back to SOLANA_RPC_URL.
 */
import { Connection } from "@solana/web3.js";
import { env } from "@/lib/env";

let cachedMainnetConnection: Connection | null = null;

export function getMainnetConnection(): Connection {
  if (cachedMainnetConnection) return cachedMainnetConnection;
  const url =
    env.SOLANA_RPC_URL_MAINNET ?? env.SOLANA_RPC_URL;
  if (!url || url.trim() === "") {
    throw new Error("Solana mainnet RPC not configured (SOLANA_RPC_URL_MAINNET or SOLANA_RPC_URL)");
  }
  const user = env.SOLANA_RPC_BASIC_USER?.trim();
  const pass = env.SOLANA_RPC_BASIC_PASS?.trim();
  const headers: Record<string, string> = {};
  if (user && pass) {
    const credentials = Buffer.from(`${user}:${pass}`).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }
  cachedMainnetConnection = new Connection(url.trim(), {
    commitment: "confirmed",
    ...(Object.keys(headers).length > 0 && { httpHeaders: headers }),
  });
  return cachedMainnetConnection;
}
