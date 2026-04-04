import { describe, it, expect } from "vitest";
import {
  sumDepositIntentsMinor,
  formatMinorToMajor,
} from "../treasury-funding-summary";

describe("sumDepositIntentsMinor", () => {
  it("returns 0 for empty array", () => {
    expect(sumDepositIntentsMinor([])).toBe(BigInt(0));
  });

  it("sums single intent", () => {
    expect(sumDepositIntentsMinor([{ amountMinor: BigInt(10000) }])).toBe(
      BigInt(10000)
    );
  });

  it("sums multiple intents", () => {
    const intents = [
      { amountMinor: BigInt(5000) },
      { amountMinor: BigInt(7500) },
      { amountMinor: BigInt(2500) },
    ];
    expect(sumDepositIntentsMinor(intents)).toBe(BigInt(15000));
  });

  it("handles large BigInt values", () => {
    const intents = [
      { amountMinor: BigInt("99999999999") },
      { amountMinor: BigInt(1) },
    ];
    expect(sumDepositIntentsMinor(intents)).toBe(BigInt("100000000000"));
  });
});

describe("formatMinorToMajor", () => {
  it("formats zero", () => {
    expect(formatMinorToMajor(BigInt(0))).toBe("0.00");
  });

  it("formats whole dollars", () => {
    expect(formatMinorToMajor(BigInt(10000))).toBe("100.00");
  });

  it("formats with cents", () => {
    expect(formatMinorToMajor(BigInt(12345))).toBe("123.45");
  });

  it("formats sub-dollar amounts", () => {
    expect(formatMinorToMajor(BigInt(50))).toBe("0.50");
    expect(formatMinorToMajor(BigInt(1))).toBe("0.01");
  });

  it("formats large amounts", () => {
    expect(formatMinorToMajor(BigInt("100000000"))).toBe("1000000.00");
  });
});
