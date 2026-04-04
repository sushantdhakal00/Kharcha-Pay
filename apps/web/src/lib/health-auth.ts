/**
 * Auth for internal health endpoints (db, redis, cron).
 * Requires X-Health-Token or Authorization: Bearer when HEALTH_ADMIN_TOKEN is set.
 */
import { NextRequest, NextResponse } from "next/server";
import { env } from "./env";

export function requireHealthAdmin(req: NextRequest): NextResponse | null {
  const token = env.HEALTH_ADMIN_TOKEN;
  if (!token) return null; // No token configured = allow (internal network assumed)

  const auth = req.headers.get("authorization");
  const headerToken = req.headers.get("x-health-token");
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : headerToken;

  if (provided !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
