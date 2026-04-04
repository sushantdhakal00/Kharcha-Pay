import { NextResponse } from "next/server";
import { reauthBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { verifyPassword, createToken, setAuthCookie } from "@/lib/auth";

/**
 * POST /api/auth/reauth { password }
 * Verifies current user password and issues a new JWT with fresh authTime.
 * Call after REAUTH_REQUIRED to retry the sensitive action.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);

    const body = await request.json();
    const parsed = reauthBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true, jwtVersion: true },
    });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ok = await verifyPassword(dbUser.password, parsed.data.password);
    if (!ok) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await createToken({
      sub: user.id,
      authTime: Math.floor(Date.now() / 1000),
      jwtVersion: dbUser.jwtVersion,
    });
    await setAuthCookie(token);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
