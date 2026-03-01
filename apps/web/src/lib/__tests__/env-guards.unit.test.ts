import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("validateProductionEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgresql://localhost:5432/test",
      JWT_SECRET: "a".repeat(32),
      NODE_ENV: "development",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("passes in dev with minimal config", async () => {
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("DATABASE_URL"));
  });

  it("fails when JWT_SECRET is too short", async () => {
    process.env.JWT_SECRET = "short";
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("JWT_SECRET"));
  });

  it("errors on missing production secrets", async () => {
    process.env.NODE_ENV = "production";
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("NEXT_PUBLIC_APP_URL"));
    expect(result.errors).toContainEqual(expect.stringContaining("ENCRYPTION_KEY"));
    expect(result.errors).toContainEqual(expect.stringContaining("CRON_SECRET"));
  });

  it("warns about DEMO_MODE in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.CRON_SECRET = "a".repeat(16);
    process.env.DEMO_MODE = "true";
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.warnings).toContainEqual(expect.stringContaining("DEMO_MODE"));
  });

  it("warns about missing HEALTH_ADMIN_TOKEN in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.CRON_SECRET = "a".repeat(16);
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.warnings).toContainEqual(
      expect.stringContaining("HEALTH_ADMIN_TOKEN")
    );
  });

  it("warns about disabled notifications in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.CRON_SECRET = "a".repeat(16);
    process.env.INTERNAL_NOTIFICATIONS_ENABLED = "false";
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.warnings).toContainEqual(
      expect.stringContaining("INTERNAL_NOTIFICATIONS_ENABLED")
    );
  });

  it("is valid in production with all required vars", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.CRON_SECRET = "a".repeat(16);
    process.env.HEALTH_ADMIN_TOKEN = "token123";
    process.env.INTERNAL_JOB_SECRET = "secret123";
    process.env.INTERNAL_NOTIFICATIONS_ENABLED = "true";
    process.env.CIRCLE_API_KEY = "circle_key";
    process.env.CIRCLE_ENV = "sandbox";
    process.env.SOLANA_RPC_URL = "https://rpc.example.com";
    process.env.ENABLE_ONCHAIN_RECONCILIATION = "true";
    const { validateProductionEnv } = await import("../fiat/env-guards");
    const result = validateProductionEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
