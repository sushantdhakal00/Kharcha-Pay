import { describe, it, expect } from "vitest";
import {
  selectBestTokenIncreaseMatch,
  TokenBalanceChange,
} from "../treasury-deposit-reconcile";

function makeCandidate(overrides: Partial<TokenBalanceChange> = {}): TokenBalanceChange {
  return {
    sig: "txsig_abc123",
    blockTime: 1700000000,
    mint: "MintABC",
    tokenAccount: "TokenAccDEF",
    preAmount: "0",
    postAmount: "10000000",
    decimals: 6,
    increase: BigInt(10000000),
    ...overrides,
  };
}

describe("selectBestTokenIncreaseMatch", () => {
  const windowStart = 1699990000;
  const windowEnd = 1700010000;

  it("returns 'none' when candidates is empty", () => {
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000),
      2,
      [],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("none");
  });

  it("returns 'none' when no candidate has positive increase", () => {
    const c = makeCandidate({ increase: BigInt(0) });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000),
      2,
      [c],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("none");
  });

  it("returns 'none' when candidate is outside time window", () => {
    const c = makeCandidate({ blockTime: 1699000000, increase: BigInt(10000000000) });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000),
      2,
      [c],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("none");
  });

  it("matches exact amount with correct scaling (2 currency decimals, 6 token decimals)", () => {
    // 100.00 USD = 10000 minor cents -> 100_000_000 raw (6 decimals, scale by 10^4)
    const c = makeCandidate({
      increase: BigInt(100_000_000),
      decimals: 6,
    });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000), // $100.00 in cents
      2,
      [c],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.candidate.sig).toBe("txsig_abc123");
    }
  });

  it("does not match wrong amount", () => {
    const c = makeCandidate({
      increase: BigInt(50_000_000), // $50 raw instead of $100
      decimals: 6,
    });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000), // $100.00 in cents
      2,
      [c],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("none");
  });

  it("returns 'multiple' when two candidates match exactly", () => {
    const c1 = makeCandidate({
      sig: "sig1",
      increase: BigInt(100_000_000),
      decimals: 6,
    });
    const c2 = makeCandidate({
      sig: "sig2",
      increase: BigInt(100_000_000),
      decimals: 6,
    });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000),
      2,
      [c1, c2],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("multiple");
  });

  it("matches with 0-decimal token (e.g. raw units equal minor)", () => {
    // decimals=2 token, currency decimals=2 -> scale factor=1
    const c = makeCandidate({
      increase: BigInt(5000),
      decimals: 2,
    });
    const result = selectBestTokenIncreaseMatch(
      BigInt(5000), // $50.00 in cents
      2,
      [c],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("match");
  });

  it("ignores candidates with token decimals < currency decimals", () => {
    const c = makeCandidate({
      increase: BigInt(100),
      decimals: 1,
    });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000),
      2,
      [c],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("none");
  });

  it("picks single exact match even among non-matching candidates", () => {
    const good = makeCandidate({
      sig: "good_sig",
      increase: BigInt(100_000_000),
      decimals: 6,
    });
    const bad = makeCandidate({
      sig: "bad_sig",
      increase: BigInt(999_999),
      decimals: 6,
    });
    const result = selectBestTokenIncreaseMatch(
      BigInt(10000),
      2,
      [bad, good],
      windowStart,
      windowEnd
    );
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.candidate.sig).toBe("good_sig");
    }
  });
});
