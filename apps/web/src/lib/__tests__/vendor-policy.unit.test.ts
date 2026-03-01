/**
 * Unit tests: vendor policy enforcement
 * - dual approval enforcement
 * - staff cannot approve bank changes
 * - activation blocked when required docs missing (policy ON)
 */
import { describe, it, expect } from "vitest";

function canApproveBankChange(role: "ADMIN" | "APPROVER" | "STAFF"): boolean {
  if (role === "STAFF") return false;
  return role === "ADMIN" || role === "APPROVER";
}

function shouldBlockActivationDueToDocs(
  requireVendorDocsBeforeActivation: boolean,
  verifiedDocCount: number
): boolean {
  return requireVendorDocsBeforeActivation && verifiedDocCount === 0;
}

function needsSecondApproval(
  requireDualApproval: boolean,
  firstApproverId: string | null,
  secondApproverId: string | null
): boolean {
  if (!requireDualApproval) return false;
  if (!firstApproverId) return true;
  if (firstApproverId === secondApproverId) return true;
  return !secondApproverId;
}

describe("Vendor policy enforcement", () => {
  it("staff cannot approve bank changes", () => {
    expect(canApproveBankChange("STAFF")).toBe(false);
  });

  it("approver can approve bank changes", () => {
    expect(canApproveBankChange("APPROVER")).toBe(true);
  });

  it("admin can approve bank changes", () => {
    expect(canApproveBankChange("ADMIN")).toBe(true);
  });

  it("activation blocked when required docs missing (policy ON)", () => {
    expect(shouldBlockActivationDueToDocs(true, 0)).toBe(true);
    expect(shouldBlockActivationDueToDocs(true, 1)).toBe(false);
    expect(shouldBlockActivationDueToDocs(false, 0)).toBe(false);
  });

  it("dual approval: needs second when first present and policy on", () => {
    expect(needsSecondApproval(true, "user1", null)).toBe(true);
    expect(needsSecondApproval(true, "user1", "user2")).toBe(false);
    expect(needsSecondApproval(true, null, "user1")).toBe(true);
  });

  it("dual approval: same user cannot be second approver", () => {
    expect(needsSecondApproval(true, "user1", "user1")).toBe(true);
  });

  it("dual approval: when policy off, no second approval needed", () => {
    expect(needsSecondApproval(false, "user1", null)).toBe(false);
    expect(needsSecondApproval(false, null, null)).toBe(false);
  });
});
