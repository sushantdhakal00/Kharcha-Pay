import { NextResponse } from "next/server";
import { changePasswordBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { verifyPassword, hashPassword, createToken, setAuthCookie } from "@/lib/auth";

/**
 * POST /api/auth/change-password { currentPassword, newPassword }
 * Requires current password; sets new password, increments jwtVersion, issues new JWT.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);

    const body = await request.json();
    const parsed = changePasswordBodySchema.safeParse(body);
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

    const ok = await verifyPassword(dbUser.password, parsed.data.currentPassword);
    if (!ok) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHash,
        jwtVersion: { increment: 1 },
      },
      select: { jwtVersion: true },
    });

    const token = await createToken({
      sub: user.id,
      authTime: Math.floor(Date.now() / 1000),
      jwtVersion: updated.jwtVersion,
    });
    await setAuthCookie(token);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
