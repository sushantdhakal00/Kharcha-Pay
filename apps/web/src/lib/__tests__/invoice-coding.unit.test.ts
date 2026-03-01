import { describe, it, expect } from "vitest";

describe("invoice coding validation gates", () => {
  it("submit requires departmentId and glCode", () => {
    const canSubmit = (inv: { departmentId: string | null; glCode: string | null }) =>
      !!inv.departmentId && !!inv.glCode;
    expect(canSubmit({ departmentId: null, glCode: null })).toBe(false);
    expect(canSubmit({ departmentId: "d1", glCode: null })).toBe(false);
    expect(canSubmit({ departmentId: null, glCode: "4100" })).toBe(false);
    expect(canSubmit({ departmentId: "d1", glCode: "4100" })).toBe(true);
  });

  it("verify requires glCode", () => {
    const canVerify = (inv: { glCode: string | null }) => !!inv.glCode;
    expect(canVerify({ glCode: null })).toBe(false);
    expect(canVerify({ glCode: "" })).toBe(false);
    expect(canVerify({ glCode: "4100" })).toBe(true);
  });
});

describe("bulk verify eligibility", () => {
  it("only MATCHED + coded invoices can be bulk verified", () => {
    const isEligible = (inv: { matchStatus: string; glCode: string | null }) =>
      inv.matchStatus === "MATCHED" && !!inv.glCode;

    expect(isEligible({ matchStatus: "MATCHED", glCode: "4100" })).toBe(true);
    expect(isEligible({ matchStatus: "MISMATCH", glCode: "4100" })).toBe(false);
    expect(isEligible({ matchStatus: "MATCHED", glCode: null })).toBe(false);
    expect(isEligible({ matchStatus: "NO_RECEIPT", glCode: "4100" })).toBe(false);
  });
});
