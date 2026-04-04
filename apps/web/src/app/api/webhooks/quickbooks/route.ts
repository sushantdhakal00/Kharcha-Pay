/**
 * POST /api/webhooks/quickbooks
 * QBO inbound change notifications. No orgId in URL; realmId from payload resolves org.
 * MUST respond 200 quickly (within a few seconds). Do NOT call QBO APIs in handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueAccountingSyncJob } from "@/lib/accounting/enqueue-job";

// QBO webhook payload structure (simplified)
interface QboWebhookPayload {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: {
      entities?: Array<{
        name?: string;
        id?: string;
        operation?: string;
        lastUpdated?: string;
      }>;
    };
  }>;
}

// In-memory rate limit: max events per realmId per minute (simple guard)
const RATE_LIMIT = 60;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(realmId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(realmId);
  if (!entry) {
    rateLimitMap.set(realmId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (now > entry.resetAt) {
    rateLimitMap.set(realmId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    let payload: QboWebhookPayload;
    try {
      payload = JSON.parse(raw) as QboWebhookPayload;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const notifications = payload.eventNotifications ?? [];
    if (notifications.length === 0) {
      return NextResponse.json({ received: 0 });
    }

    const processedRealms = new Set<string>();

    for (const notif of notifications) {
      const realmId = notif.realmId;
      if (!realmId || typeof realmId !== "string") continue;

      if (!checkRateLimit(realmId)) {
        console.warn("[webhooks/quickbooks] rate limit exceeded for realm", realmId);
        continue;
      }

      // Resolve org from realmId
      const conn = await prisma.accountingConnection.findFirst({
        where: { realmId, status: "CONNECTED" },
      });
      const orgId = conn?.orgId ?? null;

      // Write webhook event (fast, no QBO calls)
      await prisma.quickBooksWebhookEvent.create({
        data: {
          realmId,
          orgId,
          rawPayload: payload as object,
          status: "PENDING",
        },
      });

      if (!orgId || conn?.status !== "CONNECTED") continue;
      if (processedRealms.has(orgId)) continue;
      processedRealms.add(orgId);

      const entities = notif.dataChangeEvent?.entities ?? [];
      const entityNames = new Set(entities.map((e) => e.name?.toLowerCase()).filter(Boolean));

      // Queue appropriate sync jobs
      if (
        entityNames.has("account") ||
        entityNames.has("vendor")
      ) {
        await enqueueAccountingSyncJob(orgId, "IMPORT_REFERENCE");
      }
      if (entityNames.has("bill") || entityNames.has("billpayment")) {
        await enqueueAccountingSyncJob(orgId, "RECONCILE_BILLS");
      }
    }

    return NextResponse.json({
      received: notifications.length,
      realms: Array.from(processedRealms).length,
    });
  } catch (e) {
    console.error("[webhooks/quickbooks]", e);
    // Still return 200 to avoid QBO retries for our bugs
    return NextResponse.json({ error: "Internal" }, { status: 200 });
  }
}
