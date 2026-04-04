import { describe, it, expect } from "vitest";
import { formatTokenAmount } from "../treasury-balance-service";

describe("formatTokenAmount", () => {
  it("returns string for zero", () => {
    expect(formatTokenAmount("0", 9)).toBe("0");
  });

  it("returns string for whole number", () => {
    expect(formatTokenAmount("1000000000", 9)).toBe("1");
    expect(formatTokenAmount("5000000000", 9)).toBe("5");
  });

  it("returns formatted decimal string", () => {
    expect(formatTokenAmount("1500000000", 9)).toBe("1.5");
    expect(formatTokenAmount("123456789", 9)).toBe("0.123456789");
  });

  it("handles large raw amounts as string (bigint-safe)", () => {
    const big = "999999999999999999";
    const result = formatTokenAmount(big, 9);
    expect(typeof result).toBe("string");
    expect(result).toBe("999999999.999999999");
  });

  it("returns string type for all inputs", () => {
    const cases = [
      ["0", 0],
      ["1000", 3],
      ["1234567890123456789", 18],
    ] as const;
    for (const [raw, dec] of cases) {
      const out = formatTokenAmount(raw, dec);
      expect(typeof out).toBe("string");
    }
  });
});
