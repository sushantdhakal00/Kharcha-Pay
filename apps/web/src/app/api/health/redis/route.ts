/**
 * GET /api/health/redis
 * Redis connectivity check. Requires HEALTH_ADMIN_TOKEN when set.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireHealthAdmin } from "@/lib/health-auth";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const err = requireHealthAdmin(req);
  if (err) return err;

  if (!env.REDIS_URL) {
    return NextResponse.json({ ok: true, redis: "skipped", reason: "REDIS_URL not set" });
  }

  const client = getRedisClient();
  if (!client) {
    return NextResponse.json({ ok: false, redis: "fail", error: "Redis client init failed" }, { status: 503 });
  }

  try {
    await client.ping();
    return NextResponse.json({ ok: true, redis: "ok" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, redis: "fail", error: (e as Error).message },
      { status: 503 }
    );
  }
}
