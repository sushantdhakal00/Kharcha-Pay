import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("treasuryLogger", () => {
  const originalEnv = process.env.LOG_LEVEL;

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalEnv;
    vi.restoreAllMocks();
  });

  it("logs info level with structured JSON", async () => {
    process.env.LOG_LEVEL = "info";
    vi.resetModules();
    const { treasuryLogger } = await import("../fiat/treasury-logger");
    treasuryLogger.info("treasury.payout.executed", { intentId: "i1", orgId: "o1" });
    expect(console.info).toHaveBeenCalled();
    const logged = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logged);
    expect(parsed.event).toBe("treasury.payout.executed");
    expect(parsed.intentId).toBe("i1");
    expect(parsed.level).toBe("info");
    expect(parsed.ts).toBeTruthy();
  });

  it("logs error level", async () => {
    process.env.LOG_LEVEL = "info";
    vi.resetModules();
    const { treasuryLogger } = await import("../fiat/treasury-logger");
    treasuryLogger.error("treasury.safety.blocked", { reason: "paused" });
    expect(console.error).toHaveBeenCalled();
    const logged = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logged);
    expect(parsed.event).toBe("treasury.safety.blocked");
    expect(parsed.level).toBe("error");
  });

  it("respects log level filtering", async () => {
    process.env.LOG_LEVEL = "error";
    vi.resetModules();
    const { treasuryLogger } = await import("../fiat/treasury-logger");
    treasuryLogger.debug("test", {});
    treasuryLogger.info("test", {});
    treasuryLogger.warn("test", {});
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("allows error when level is error", async () => {
    process.env.LOG_LEVEL = "error";
    vi.resetModules();
    const { treasuryLogger } = await import("../fiat/treasury-logger");
    treasuryLogger.error("test", {});
    expect(console.error).toHaveBeenCalled();
  });

  it("includes timestamp in all logs", async () => {
    process.env.LOG_LEVEL = "debug";
    vi.resetModules();
    const { treasuryLogger } = await import("../fiat/treasury-logger");
    treasuryLogger.debug("test.event", { key: "val" });
    const logged = (console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logged);
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}/);
  });

  it("merges data into structured log", async () => {
    process.env.LOG_LEVEL = "info";
    vi.resetModules();
    const { treasuryLogger } = await import("../fiat/treasury-logger");
    treasuryLogger.info("payout", { a: 1, b: "two" });
    const logged = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logged);
    expect(parsed.a).toBe(1);
    expect(parsed.b).toBe("two");
  });
});
