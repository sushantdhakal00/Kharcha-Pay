import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireRecentAuth } from "@/lib/require-recent-auth";

/**
 * GET /api/auth/reauth-test?maxAge=1
 * For security-check page: requires recent auth within maxAge seconds (default 1).
 * Returns 200 if ok, 403 with code REAUTH_REQUIRED if auth too old.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const maxAge = Math.min(900, Math.max(1, parseInt(searchParams.get("maxAge") ?? "1", 10)));
    await requireRecentAuth(maxAge);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
