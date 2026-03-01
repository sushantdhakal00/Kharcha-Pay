import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppVersion } from "@/lib/app-version";

/**
 * GET /api/health
 * Liveness + DB check. Never leaks secrets.
 */
export async function GET() {
  let dbStatus: "ok" | "fail" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "fail";
  }

  const ok = dbStatus === "ok";
  return NextResponse.json(
    {
      ok,
      version: getAppVersion(),
      time: new Date().toISOString(),
      db: dbStatus,
    },
    { status: ok ? 200 : 503 }
  );
}
