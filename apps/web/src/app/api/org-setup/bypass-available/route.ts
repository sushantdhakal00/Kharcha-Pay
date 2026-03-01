import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Returns whether payment bypass is available (development or demo mode).
 * Frontend uses this to show/hide the "Bypass payment" button.
 */
export async function GET() {
  const isDev = env.NODE_ENV !== "production";
  const isDemo = env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
  return NextResponse.json({ available: isDev || isDemo });
}
