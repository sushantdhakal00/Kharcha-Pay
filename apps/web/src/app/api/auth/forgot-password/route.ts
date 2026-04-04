import { NextResponse } from "next/server";
import { forgotPasswordBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { randomBytes, createHash } from "crypto";

/**
 * POST /api/auth/forgot-password { email }
 * Always returns 200 to avoid enumeration. If user exists, creates reset token.
 * In dev: logs reset link to console. In prod: would send email.
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
  const r = checkRateLimit(request, "auth:forgot-password", null);
  if (r.limited) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = forgotPasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (user) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const baseUrl =
      env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    if (env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[Forgot password] Reset link (dev only):", resetLink);
    }
  }

  return NextResponse.json({
    message: "If an account exists with this email, we sent a reset link.",
  });
}
