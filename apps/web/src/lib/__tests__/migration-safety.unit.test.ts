import { describe, it, expect, vi } from "vitest";

const mockQueryRawUnsafe = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

import { checkMigrationStatus } from "../db/migration-safety";

describe("checkMigrationStatus", () => {
  it("returns ok when all migrations are applied", async () => {
    mockQueryRawUnsafe.mockResolvedValue([
      { migration_name: "20260101_init", finished_at: new Date() },
      { migration_name: "20260102_add_users", finished_at: new Date() },
    ]);

    const result = await checkMigrationStatus();
    expect(result.ok).toBe(true);
    expect(result.appliedMigrations).toBe(2);
    expect(result.pendingMigrations).toHaveLength(0);
    expect(result.lastApplied).toBe("20260101_init");
  });

  it("returns not ok when migrations are pending", async () => {
    mockQueryRawUnsafe.mockResolvedValue([
      { migration_name: "20260103_pending", finished_at: null },
      { migration_name: "20260102_done", finished_at: new Date() },
    ]);

    const result = await checkMigrationStatus();
    expect(result.ok).toBe(false);
    expect(result.pendingMigrations).toHaveLength(1);
    expect(result.pendingMigrations[0]).toBe("20260103_pending");
  });

  it("handles missing migrations table", async () => {
    mockQueryRawUnsafe.mockRejectedValue(
      new Error('relation "_prisma_migrations" does not exist')
    );

    const result = await checkMigrationStatus();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("handles generic DB errors", async () => {
    mockQueryRawUnsafe.mockRejectedValue(new Error("Connection refused"));

    const result = await checkMigrationStatus();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection refused");
  });

  it("returns zero applied when table is empty", async () => {
    mockQueryRawUnsafe.mockResolvedValue([]);

    const result = await checkMigrationStatus();
    expect(result.ok).toBe(true);
    expect(result.appliedMigrations).toBe(0);
    expect(result.lastApplied).toBeUndefined();
  });
});
