import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonResponse } from "@/lib/json-response";

export async function POST(req: NextRequest) {
  if (env.NODE_ENV === "production") {
    return jsonResponse(
      { error: "Webhook replay is disabled in production" },
      { status: 403 }
    );
  }

  const secret =
    req.headers.get("x-internal-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!env.INTERNAL_JOB_SECRET || secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const webhookSecret = env.CIRCLE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonResponse(
      { error: "CIRCLE_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }

  try {
    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const response = await fetch(`${appUrl}/api/webhooks/circle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-circle-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    return jsonResponse({
      replayed: true,
      webhookStatus: response.status,
      webhookResponse: result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
