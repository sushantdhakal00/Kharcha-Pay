import * as argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
export const AUTH_COOKIE_NAME = "kharchapay_token";
const COOKIE_NAME = AUTH_COOKIE_NAME;
const CSRF_COOKIE_NAME = "kharchapay_csrf";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

const CSRF_COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 2, // 2 hours
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  return argon2.verify(hash, password);
}

export interface TokenPayload {
  sub: string;
  authTime: number;
  jwtVersion: number;
}

export async function createToken(payload: {
  sub: string;
  authTime?: number;
  jwtVersion: number;
}): Promise<string> {
  const authTime = payload.authTime ?? Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: payload.sub,
    authTime,
    jwtVersion: payload.jwtVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    const authTime = payload.authTime as number | undefined;
    const jwtVersion =
      typeof payload.jwtVersion === "number" ? payload.jwtVersion : 0;
    return {
      sub,
      authTime: typeof authTime === "number" ? authTime : payload.iat ?? 0,
      jwtVersion,
    };
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, COOKIE_OPTS);
}

export function setAuthCookieOnResponse(res: NextResponse, token: string): void {
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS);
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getTokenFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME;
}

export async function setCsrfCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTS);
}

export async function getCsrfFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value;
}

/**
 * Validates CSRF: header x-csrf-token must match cookie kharchapay_csrf.
 * Throws NextResponse 403 with code "CSRF" if missing or mismatch.
 */
export async function requireCsrf(request: Request): Promise<void> {
  const cookieToken = await getCsrfFromCookie();
  const headerToken = request.headers.get("x-csrf-token")?.trim();
  if (
    !headerToken ||
    !cookieToken ||
    headerToken.length !== cookieToken.length ||
    !safeCompare(headerToken, cookieToken)
  ) {
    throw NextResponse.json(
      { error: "Invalid or missing CSRF token", code: "CSRF" },
      { status: 403 }
    );
  }
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
