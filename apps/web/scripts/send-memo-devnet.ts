/**
 * One-off script: Send a memo transaction on devnet for README screenshot.
 * Run: npm run memo:devnet --workspace=apps/web
 *
 * If airdrop fails (rate limited):
 *   1. Run: MEMO_GENERATE=1 npm run memo:devnet --workspace=apps/web
 *   2. Copy the address, get SOL at https://faucet.solana.com
 *   3. Run: MEMO_DEVNET_KEYPAIR_JSON="[1,2,...]" npm run memo:devnet --workspace=apps/web
 *
 * Optional env:
 *   SOLANA_RPC_URL           - Custom RPC (Helius, QuickNode, etc.)
 *   MEMO_DEVNET_KEYPAIR_JSON - Funded keypair JSON; skips airdrop
 *   MEMO_GENERATE            - Just print a new keypair for manual funding
 */
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

function getPayer(): Keypair {
  const raw = process.env.MEMO_DEVNET_KEYPAIR_JSON;
  if (raw) {
    const arr = JSON.parse(raw) as number[];
    if (Array.isArray(arr) && arr.length === 64) return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.generate();
}

async function main() {
  if (process.env.MEMO_GENERATE) {
    const kp = Keypair.generate();
    const sec = JSON.stringify(Array.from(kp.secretKey));
    console.log("New keypair for manual funding:\n");
    console.log("Address:", kp.publicKey.toBase58());
    console.log("\nSecret key (for MEMO_DEVNET_KEYPAIR_JSON):\n" + sec);
    console.log("\n1. Airdrop at https://faucet.solana.com (paste address above)");
    console.log("2. Run with: $env:MEMO_DEVNET_KEYPAIR_JSON='" + sec + "'; npm run memo:devnet --workspace=apps/web");
    return;
  }

  const conn = new Connection(RPC);
  const payer = getPayer();
  const useAirdrop = !process.env.MEMO_DEVNET_KEYPAIR_JSON;

  if (useAirdrop) {
    console.log("Requesting airdrop...");
    for (let i = 0; i < 3; i++) {
      try {
        const sig = await conn.requestAirdrop(payer.publicKey, 1e9);
        await conn.confirmTransaction(sig);
        break;
      } catch (e) {
        if (i === 2) {
          console.error("\nAirdrop failed. Options:");
          console.error("  1. Set SOLANA_RPC_URL to a paid RPC (Helius, QuickNode)");
          console.error("  2. Get devnet SOL at https://faucet.solana.com");
          console.error("  3. Set MEMO_DEVNET_KEYPAIR_JSON=[...] with a funded keypair");
          throw e;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } else {
    const bal = await conn.getBalance(payer.publicKey);
    if (bal < 5000) throw new Error("Keypair has insufficient SOL. Need ~0.000005 SOL.");
  }

  const tx = new Transaction().add(
    createMemoInstruction("KharchaPay Request demo-req-123", [payer.publicKey])
  );

  const sig = await conn.sendTransaction(tx, [payer]);
  console.log("Confirming...");
  await conn.confirmTransaction(sig);

  const url = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  console.log("\n✅ Done! Open this URL to screenshot:");
  console.log(url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
