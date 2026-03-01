import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkMigrationStatus } from "@/lib/db/migration-safety";
import { getAppVersion } from "@/lib/app-version";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (e: unknown) {
    checks.database = {
      ok: false,
      detail: e instanceof Error ? e.message : "connection failed",
    };
  }

  try {
    const migrationResult = await checkMigrationStatus();
    checks.migrations = {
      ok: migrationResult.ok,
      detail: migrationResult.ok
        ? `${migrationResult.appliedMigrations} applied`
        : migrationResult.error ?? `${migrationResult.pendingMigrations.length} pending`,
    };
  } catch {
    checks.migrations = { ok: true, detail: "check skipped" };
  }

  try {
    await prisma.treasuryPolicy.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    checks.policyRead = { ok: true };
  } catch (e: unknown) {
    checks.policyRead = {
      ok: false,
      detail: e instanceof Error ? e.message : "read failed",
    };
  }

  try {
    const event = await prisma.treasuryEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    checks.eventBus = {
      ok: true,
      detail: event
        ? `last event: ${event.createdAt.toISOString()}`
        : "no events yet",
    };
  } catch (e: unknown) {
    checks.eventBus = {
      ok: false,
      detail: e instanceof Error ? e.message : "read failed",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      ok: allOk,
      version: getAppVersion(),
      time: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
