import { describe, it, expect } from "vitest";
import { withinTolerancePct } from "../match-engine";

describe("withinTolerancePct", () => {
  it("returns true when within tolerance", () => {
    expect(withinTolerancePct(102, 100, 2)).toBe(true);
    expect(withinTolerancePct(98, 100, 2)).toBe(true);
    expect(withinTolerancePct(100, 100, 2)).toBe(true);
    expect(withinTolerancePct(101, 100, 1)).toBe(true);
  });

  it("returns false when beyond tolerance", () => {
    expect(withinTolerancePct(104, 100, 2)).toBe(false);
    expect(withinTolerancePct(96, 100, 2)).toBe(false);
    expect(withinTolerancePct(102, 100, 1)).toBe(false);
    expect(withinTolerancePct(99, 100, 1)).toBe(true);
  });

  it("handles expected zero", () => {
    expect(withinTolerancePct(0, 0, 5)).toBe(true);
    expect(withinTolerancePct(1, 0, 5)).toBe(false);
  });

  it("matches qty tolerance default 2%", () => {
    expect(withinTolerancePct(102, 100, 2)).toBe(true);
    expect(withinTolerancePct(103, 100, 2)).toBe(false);
  });

  it("matches price tolerance default 1%", () => {
    expect(withinTolerancePct(101, 100, 1)).toBe(true);
    expect(withinTolerancePct(102, 100, 1)).toBe(false);
  });
});
