import { NextResponse } from "next/server";
import { getCurrentUser } from "./get-current-user";
import type { ApiUser } from "@kharchapay/shared";

/**
 * Returns the authenticated user. Throws a 401 NextResponse if not authenticated.
 * In route handlers: use in try/catch and return the caught value.
 */
export async function requireUser(): Promise<ApiUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}
