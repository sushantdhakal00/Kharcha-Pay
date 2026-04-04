import { NextResponse } from "next/server";
import { clearAuthCookie, requireCsrf, getCsrfCookieName } from "@/lib/auth";
import { ACTIVE_ORG_COOKIE } from "@/lib/get-active-org";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    await clearAuthCookie();
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_ORG_COOKIE);
    cookieStore.delete(getCsrfCookieName());
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
