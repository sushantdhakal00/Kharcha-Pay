import { NextResponse } from "next/server";
import { getTokenFromCookie, verifyToken } from "./auth";

/**
 * Ensures the session was authenticated recently (authTime within maxAgeSeconds).
 * Use for sensitive actions (pay, vendor wallet/status, spend policy, approval policy).
 * Throws 403 with code "REAUTH_REQUIRED" if auth is too old.
 */
export async function requireRecentAuth(maxAgeSeconds: number): Promise<void> {
  const token = await getTokenFromCookie();
  if (!token) {
    throw NextResponse.json(
      { error: "Unauthorized", code: "REAUTH_REQUIRED" },
      { status: 403 }
    );
  }
  const payload = await verifyToken(token);
  if (!payload) {
    throw NextResponse.json(
      { error: "Invalid session", code: "REAUTH_REQUIRED" },
      { status: 403 }
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const authTime = payload.authTime ?? 0;
  if (now - authTime > maxAgeSeconds) {
    throw NextResponse.json(
      { error: "Re-authentication required", code: "REAUTH_REQUIRED" },
      { status: 403 }
    );
  }
}

export const REAUTH_MAX_AGE_SECONDS = 15 * 60; // 15 minutes
