import { describe, it, expect, vi } from "vitest";
import { verifyPaymentOnChain, type VerifyRpcClient } from "../verify-payment";

function createFakeRpc(
  getTransactionImpl: VerifyRpcClient["getTransaction"]
): VerifyRpcClient {
  return { getTransaction: getTransactionImpl };
}

const baseInput = {
  orgId: "org1",
  requestId: "req1",
  request: { paidTxSig: "sig123", amountMinor: BigInt(1000) },
  vendor: { tokenAccount: "destToken", ownerPubkey: "destOwner" },
  org: { slug: "acme" },
  chainConfig: {
    token2022Mint: "mint1",
    treasuryTokenAccount: "srcToken",
    treasuryOwnerPubkey: "treasury",
    tokenProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  },
};

describe("verifyPaymentOnChain with mocked RPC", () => {
  it("returns FAILED when txSig is missing", async () => {
    const result = await verifyPaymentOnChain({
      ...baseInput,
      request: { paidTxSig: null, amountMinor: BigInt(1000) },
    });
    expect(result.status).toBe("FAILED");
    expect(result.reasons).toContain("Transaction not found");
  });

  it("returns FAILED when RPC returns null (tx not found)", async () => {
    const fakeRpc = createFakeRpc(() => Promise.resolve(null));
    const result = await verifyPaymentOnChain({ ...baseInput, rpc: fakeRpc });
    expect(result.status).toBe("FAILED");
    expect(result.reasons).toContain("Transaction not found");
  });

  it("returns FAILED when memo does not match", async () => {
    const memoBase64 = Buffer.from("Wrong Memo Format", "utf-8").toString("base64");
    const amountBytes = new Uint8Array(9);
    amountBytes[0] = 3;
    for (let i = 0; i < 8; i++) amountBytes[1 + i] = Number((BigInt(1000) >> BigInt(i * 8)) & BigInt(0xff));
    const transferData = Buffer.from(amountBytes).toString("base64");

    const fakeRpc = createFakeRpc(() =>
      Promise.resolve({
        transaction: {
          message: {
            accountKeys: [
              "srcToken",
              "destToken",
              "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
              "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
            ],
            instructions: [
              { programIdIndex: 2, accounts: [], data: memoBase64 },
              { programIdIndex: 3, accounts: [0, 1], data: transferData },
            ],
          },
        },
        meta: { err: null },
        slot: 100,
        blockTime: 1700000000,
      })
    );

    const result = await verifyPaymentOnChain({ ...baseInput, rpc: fakeRpc });
    expect(result.status).toBe("FAILED");
    expect(result.reasons).toContain("Memo mismatch");
  });

  it("returns FAILED when amount differs", async () => {
    const expectedMemo = "KharchaPay Request req1 acme";
    const memoBase64 = Buffer.from(expectedMemo, "utf-8").toString("base64");
    const amountBytes = new Uint8Array(9);
    amountBytes[0] = 3;
    for (let i = 0; i < 8; i++) amountBytes[1 + i] = Number((BigInt(500) >> BigInt(i * 8)) & BigInt(0xff));
    const transferData = Buffer.from(amountBytes).toString("base64");

    const fakeRpc = createFakeRpc(() =>
      Promise.resolve({
        transaction: {
          message: {
            accountKeys: [
              "srcToken",
              "destToken",
              "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
              "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
            ],
            instructions: [
              { programIdIndex: 2, accounts: [], data: memoBase64 },
              { programIdIndex: 3, accounts: [0, 1], data: transferData },
            ],
          },
        },
        meta: { err: null },
        slot: 100,
        blockTime: 1700000000,
      })
    );

    const result = await verifyPaymentOnChain({ ...baseInput, rpc: fakeRpc });
    expect(result.status).toBe("FAILED");
    expect(result.reasons).toContain("Amount differs");
  });

  it("returns VERIFIED when memo and amount match", async () => {
    const expectedMemo = "KharchaPay Request req1 acme";
    const memoBase64 = Buffer.from(expectedMemo, "utf-8").toString("base64");
    const amountBytes = new Uint8Array(9);
    amountBytes[0] = 3;
    for (let i = 0; i < 8; i++) amountBytes[1 + i] = Number((BigInt(1000) >> BigInt(i * 8)) & BigInt(0xff));
    const transferData = Buffer.from(amountBytes).toString("base64");

    const fakeRpc = createFakeRpc(() =>
      Promise.resolve({
        transaction: {
          message: {
            accountKeys: [
              "srcToken",
              "destToken",
              "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
              "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
            ],
            instructions: [
              { programIdIndex: 2, accounts: [], data: memoBase64 },
              { programIdIndex: 3, accounts: [0, 1], data: transferData },
            ],
          },
        },
        meta: { err: null },
        slot: 100,
        blockTime: 1700000000,
      })
    );

    const result = await verifyPaymentOnChain({ ...baseInput, rpc: fakeRpc });
    expect(result.status).toBe("VERIFIED");
    expect(result.reasons).toHaveLength(0);
  });
});
