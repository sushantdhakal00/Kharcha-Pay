import { Keypair, PublicKey } from "@solana/web3.js";
import { env } from "@/lib/env";
import { getSolanaConnection } from "./rpc";

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Uses centralized RPC. Throws RpcNotConfiguredError if SOLANA_RPC_URL missing. */
export { getSolanaConnection as getConnection };
export { RpcNotConfiguredError } from "./rpc";

export function getTreasuryKeypair(): Keypair {
  const json = env.TREASURY_KEYPAIR_JSON;
  if (!json) throw new Error("Missing TREASURY_KEYPAIR_JSON");
  const arr = JSON.parse(json) as number[];
  if (!Array.isArray(arr) || arr.length !== 64) throw new Error("Invalid TREASURY_KEYPAIR_JSON");
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function getToken2022ProgramId(): PublicKey {
  return TOKEN_2022_PROGRAM_ID;
}
