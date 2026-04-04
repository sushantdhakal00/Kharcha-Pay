/**
 * Centralized Solana RPC connection for pay, verify, reconcile.
 * Uses SOLANA_RPC_URL from env; optional Basic auth via SOLANA_RPC_BASIC_USER/PASS.
 */
import { Connection } from "@solana/web3.js";
import { env } from "@/lib/env";

export const RPC_NOT_CONFIGURED = "RPC_NOT_CONFIGURED";

export class RpcNotConfiguredError extends Error {
  code = RPC_NOT_CONFIGURED;
  constructor() {
    super("Solana RPC not configured");
    this.name = "RpcNotConfiguredError";
  }
}

/** Throws RpcNotConfiguredError if SOLANA_RPC_URL is missing. */
export function getSolanaRpcUrlOrThrow(): string {
  const url = env.SOLANA_RPC_URL;
  if (!url || url.trim() === "") {
    throw new RpcNotConfiguredError();
  }
  return url.trim();
}

/** Extract hostname for safe logging (never log full URL or credentials). */
export function redactRpcUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return "[invalid-url]";
  }
}

let cachedConnection: Connection | null = null;
const cachedConnectionsByCluster: Record<string, Connection> = {};

function buildConnection(url: string): Connection {
  const user = env.SOLANA_RPC_BASIC_USER?.trim();
  const pass = env.SOLANA_RPC_BASIC_PASS?.trim();
  const headers: Record<string, string> = {};
  if (user && pass) {
    const credentials = Buffer.from(`${user}:${pass}`).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }
  return new Connection(url, {
    commitment: "confirmed",
    ...(Object.keys(headers).length > 0 && { httpHeaders: headers }),
  });
}

/**
 * Returns Connection for the given cluster. Uses SOLANA_RPC_URL for devnet,
 * SOLANA_RPC_URL_MAINNET for mainnet-beta. Throws RpcNotConfiguredError if URL missing.
 */
export function getSolanaConnectionForCluster(cluster: string): Connection {
  const cached = cachedConnectionsByCluster[cluster];
  if (cached) return cached;

  const url =
    cluster === "mainnet-beta"
      ? (env.SOLANA_RPC_URL_MAINNET || env.SOLANA_RPC_URL)
      : env.SOLANA_RPC_URL;
  if (!url || url.trim() === "") {
    throw new RpcNotConfiguredError();
  }
  const conn = buildConnection(url.trim());
  cachedConnectionsByCluster[cluster] = conn;
  return conn;
}

/**
 * Returns cached Connection. Throws RpcNotConfiguredError if SOLANA_RPC_URL missing.
 * Uses commitment "confirmed" and optional Basic auth.
 */
export function getSolanaConnection(): Connection {
  if (cachedConnection) return cachedConnection;

  cachedConnection = buildConnection(getSolanaRpcUrlOrThrow());
  return cachedConnection;
}

/** Wraps a promise with a timeout. Rejects with RPC_TIMEOUT if exceeded. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("RPC_TIMEOUT")), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timeoutId!);
    return result;
  } catch (e) {
    clearTimeout(timeoutId!);
    throw e;
  }
}

export const RPC_GET_TX_TIMEOUT_MS = 10_000;
