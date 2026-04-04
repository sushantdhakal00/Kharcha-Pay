import { describe, it, expect } from "vitest";
import {
  createAuditImmutabilityMiddleware,
  AuditImmutabilityViolation,
} from "../fiat/audit-immutability";

describe("AuditImmutabilityViolation", () => {
  it("has correct code", () => {
    const err = new AuditImmutabilityViolation("update");
    expect(err.code).toBe("AUDIT_IMMUTABILITY_VIOLATION");
    expect(err.message).toContain("update");
    expect(err.message).toContain("immutable");
  });
});

describe("createAuditImmutabilityMiddleware", () => {
  const middleware = createAuditImmutabilityMiddleware();
  const next = async () => ({ id: "1" });

  it("allows create on TreasuryAuditLog", async () => {
    const result = await middleware(
      { model: "TreasuryAuditLog", action: "create", args: {} } as any,
      next
    );
    expect(result).toEqual({ id: "1" });
  });

  it("allows findMany on TreasuryAuditLog", async () => {
    const result = await middleware(
      { model: "TreasuryAuditLog", action: "findMany", args: {} } as any,
      next
    );
    expect(result).toEqual({ id: "1" });
  });

  it("blocks update on TreasuryAuditLog", async () => {
    await expect(
      middleware(
        { model: "TreasuryAuditLog", action: "update", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("blocks updateMany on TreasuryAuditLog", async () => {
    await expect(
      middleware(
        { model: "TreasuryAuditLog", action: "updateMany", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("blocks delete on TreasuryAuditLog", async () => {
    await expect(
      middleware(
        { model: "TreasuryAuditLog", action: "delete", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("blocks deleteMany on TreasuryAuditLog", async () => {
    await expect(
      middleware(
        { model: "TreasuryAuditLog", action: "deleteMany", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("blocks upsert on TreasuryAuditLog", async () => {
    await expect(
      middleware(
        { model: "TreasuryAuditLog", action: "upsert", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("blocks update on AuditEvent", async () => {
    await expect(
      middleware(
        { model: "AuditEvent", action: "update", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("blocks delete on AuditEvent", async () => {
    await expect(
      middleware(
        { model: "AuditEvent", action: "delete", args: {} } as any,
        next
      )
    ).rejects.toThrow(AuditImmutabilityViolation);
  });

  it("allows operations on other models", async () => {
    const result = await middleware(
      { model: "User", action: "update", args: {} } as any,
      next
    );
    expect(result).toEqual({ id: "1" });
  });

  it("allows create on AuditEvent", async () => {
    const result = await middleware(
      { model: "AuditEvent", action: "create", args: {} } as any,
      next
    );
    expect(result).toEqual({ id: "1" });
  });
});
