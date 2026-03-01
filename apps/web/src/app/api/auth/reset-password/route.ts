import { NextResponse } from "next/server";
import { resetPasswordBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";
import { hashPassword, createToken, setAuthCookie } from "@/lib/auth";

/**
 * POST /api/auth/reset-password { token, newPassword }
 * Validates token (hash, expiry, not used), sets password, marks token used, increments jwtVersion, issues new JWT.
 */
export async function POST(request: Request) {
  const { checkRateLimit, checkGlobalLimit } = await import("@/lib/rate-limiter");
  const g = checkGlobalLimit(request);
  if (g.limited) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: g.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(g.retryAfterSeconds) } }
    );
  }
  const r = checkRateLimit(request, "auth:reset-password", null);
  if (r.limited) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resetPasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const now = new Date();

  const resetRecord = await prisma.passwordResetToken.findFirst({
    where: { tokenHash },
    include: { user: { select: { id: true, jwtVersion: true } } },
  });

  if (
    !resetRecord ||
    resetRecord.expiresAt < now ||
    resetRecord.usedAt != null
  ) {
    return NextResponse.json(
      { error: "Invalid or expired reset link. Request a new one." },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: {
        password: newHash,
        jwtVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: now },
    }),
  ]);

  const updatedUser = await prisma.user.findUnique({
    where: { id: resetRecord.userId },
    select: { id: true, jwtVersion: true },
  });
  if (!updatedUser) {
    return NextResponse.json({ error: "Error updating user" }, { status: 500 });
  }

  const token = await createToken({
    sub: updatedUser.id,
    authTime: Math.floor(Date.now() / 1000),
    jwtVersion: updatedUser.jwtVersion,
  });
  await setAuthCookie(token);

  return NextResponse.json({ ok: true });
}
