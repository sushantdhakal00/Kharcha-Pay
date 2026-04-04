import { NextResponse } from "next/server";
import { loginBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { verifyPassword, createToken, setAuthCookieOnResponse } from "@/lib/auth";
import { isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { checkRateLimit, checkGlobalLimit } from "@/lib/rate-limiter";
import { opsLog } from "@/lib/ops-log";
import type { ApiUser } from "@kharchapay/shared";

function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  const global = checkGlobalLimit(request);
  if (global.limited) return rateLimitResponse(global.retryAfterSeconds);

  const limiter = checkRateLimit(request, "auth:login", null);
  if (limiter.limited) return rateLimitResponse(limiter.retryAfterSeconds);
  const body = await request.json();
  const parsed = loginBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { email, password } = parsed.data;
  const key = email.toLowerCase();

  if (isRateLimited(key)) {
    opsLog.authFailure("rate_limited");
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: key },
    select: { id: true, email: true, username: true, password: true, jwtVersion: true, imageUrl: true, createdAt: true },
  });
  if (!user) {
    recordLoginAttempt(key);
    opsLog.authFailure("invalid_credentials");
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const ok = await verifyPassword(user.password, password);
  if (!ok) {
    recordLoginAttempt(key);
    opsLog.authFailure("invalid_credentials");
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  opsLog.authSuccess();
  const token = await createToken({
    sub: user.id,
    authTime: Math.floor(Date.now() / 1000),
    jwtVersion: user.jwtVersion,
  });

  const apiUser: ApiUser = {
    id: user.id,
    email: user.email,
    username: user.username,
    imageUrl: user.imageUrl ?? null,
    createdAt: user.createdAt.toISOString(),
  };
  const response = NextResponse.json({ user: apiUser });
  setAuthCookieOnResponse(response, token);
  return response;
}
