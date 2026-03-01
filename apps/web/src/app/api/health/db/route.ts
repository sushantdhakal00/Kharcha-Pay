import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireHealthAdmin } from "@/lib/health-auth";

/**
 * GET /api/health/db
 * DB connectivity + migration version. Requires HEALTH_ADMIN_TOKEN when set.
 */
export async function GET(req: NextRequest) {
  const err = requireHealthAdmin(req);
  if (err) return err;
  try {
    await prisma.$queryRaw`SELECT 1`;
    const mig = await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`.catch(() => []);
    const migrationVersion = mig[0]?.migration_name ?? "unknown";
    return NextResponse.json({ ok: true, db: "ok", migrationVersion });
  } catch {
    return NextResponse.json({ ok: false, db: "fail" }, { status: 503 });
  }
}
