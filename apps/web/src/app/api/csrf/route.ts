import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCsrfFromCookie, setCsrfCookie } from "@/lib/auth";

/**
 * GET /api/csrf
 * Returns existing CSRF token if cookie present; otherwise creates new one.
 * Idempotent: repeated calls return same token (avoids stale token vs overwritten cookie mismatch).
 */
export async function GET() {
  const existing = await getCsrfFromCookie();
  if (existing) {
    return NextResponse.json({ csrfToken: existing });
  }
  const token = randomBytes(32).toString("base64url");
  await setCsrfCookie(token);
  return NextResponse.json({ csrfToken: token });
}
