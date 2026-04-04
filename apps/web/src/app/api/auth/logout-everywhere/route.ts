/**
 * POST /api/auth/logout-everywhere
 * Increments user jwtVersion (invalidates all existing tokens) and clears cookies.
 * Use when user wants to log out from all devices.
 */
import { NextResponse } from "next/server";
import { clearAuthCookie, requireCsrf, getCsrfCookieName } from "@/lib/auth";
import { ACTIVE_ORG_COOKIE } from "@/lib/get-active-org";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const user = await getCurrentUser();
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { jwtVersion: { increment: 1 } },
      });
    }
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
