import { prisma } from "@/lib/db";

export interface MigrationCheckResult {
  ok: boolean;
  appliedMigrations: number;
  pendingMigrations: string[];
  lastApplied?: string;
  error?: string;
}

export async function checkMigrationStatus(): Promise<MigrationCheckResult> {
  try {
    const migrations = await prisma.$queryRawUnsafe<
      Array<{
        migration_name: string;
        finished_at: Date | null;
      }>
    >(
      `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC`
    );

    const applied = migrations.filter((m) => m.finished_at !== null);
    const pending = migrations
      .filter((m) => m.finished_at === null)
      .map((m) => m.migration_name);

    return {
      ok: pending.length === 0,
      appliedMigrations: applied.length,
      pendingMigrations: pending,
      lastApplied: applied[0]?.migration_name,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("_prisma_migrations") && msg.includes("does not exist")) {
      return {
        ok: false,
        appliedMigrations: 0,
        pendingMigrations: [],
        error: "Migrations table does not exist — run prisma migrate deploy",
      };
    }
    return {
      ok: false,
      appliedMigrations: 0,
      pendingMigrations: [],
      error: msg,
    };
  }
}

export async function assertMigrationsUpToDate(): Promise<void> {
  const result = await checkMigrationStatus();

  if (result.error) {
    console.error(`[migration-safety] ${result.error}`);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    return;
  }

  if (!result.ok) {
    console.error(
      `[migration-safety] ${result.pendingMigrations.length} pending migration(s): ${result.pendingMigrations.join(", ")}`
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  } else {
    console.info(
      `[migration-safety] OK — ${result.appliedMigrations} migration(s) applied, latest: ${result.lastApplied ?? "none"}`
    );
  }
}
