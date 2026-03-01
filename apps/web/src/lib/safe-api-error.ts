/**
 * Safe error responses for API routes. No stack traces, paths, or secrets in production.
 */
import { NextResponse } from "next/server";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function safeApiError(e: unknown, fallbackMessage = "An error occurred"): NextResponse {
  if (e instanceof NextResponse) return e;

  const message = e instanceof Error ? e.message : String(e);
  const safeMessage = IS_PRODUCTION ? fallbackMessage : message;

  if (IS_PRODUCTION) {
    if (/prisma|database|sql/i.test(message)) return NextResponse.json({ error: "Database error", code: "DB_ERROR" }, { status: 500 });
    if (/ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message)) return NextResponse.json({ error: "Service unavailable", code: "SERVICE_UNAVAILABLE" }, { status: 503 });
    if (/path|ENOENT|filesystem/i.test(message)) return NextResponse.json({ error: "Resource unavailable", code: "RESOURCE_ERROR" }, { status: 500 });
    if (/rpc|solana|https?:\/\//i.test(message)) return NextResponse.json({ error: "External service error", code: "EXTERNAL_ERROR" }, { status: 502 });
  }

  return NextResponse.json({ error: safeMessage }, { status: 500 });
}
