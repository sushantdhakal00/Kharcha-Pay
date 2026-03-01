/**
 * GET /api/orgs/[orgId]/webhooks - List endpoints
 * POST /api/orgs/[orgId]/webhooks - Create endpoint (ADMIN)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgReadAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { OrgRole } from "@prisma/client";
import { isValidWebhookUrl } from "@/lib/webhook-validate";
import { z } from "zod";

const EVENT_TYPES = [
  "VENDOR_CREATED", "VENDOR_ACTIVATED", "VENDOR_BLOCKED", "VENDOR_BANK_CHANGE_APPROVED",
  "INVOICE_SUBMITTED", "INVOICE_VERIFIED", "INVOICE_REJECTED",
  "MATCH_EXCEPTION_CREATED", "MATCH_EXCEPTION_RESOLVED",
  "PAYMENT_CREATED", "PAYMENT_PAID", "*",
] as const;

const createSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
  subscribedEventTypes: z.array(z.enum(EVENT_TYPES)).default(["*"]),
});

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        status: true,
        subscribedEventTypes: true,
        lastDeliveryAt: true,
        createdAt: true,
        _count: { select: { attempts: true } },
      },
    });

    return NextResponse.json({
      endpoints: endpoints.map((e) => ({
        id: e.id,
        url: e.url,
        status: e.status,
        subscribedEventTypes: e.subscribedEventTypes,
        lastDeliveryAt: e.lastDeliveryAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        attemptCount: e._count.attempts,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const validation = isValidWebhookUrl(parsed.data.url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        orgId,
        url: parsed.data.url,
        secret: parsed.data.secret,
        subscribedEventTypes: parsed.data.subscribedEventTypes,
        createdByUserId: user.id,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "WEBHOOK_ENDPOINT_CREATED",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      after: { url: endpoint.url },
    });

    return NextResponse.json({
      endpoint: {
        id: endpoint.id,
        url: endpoint.url,
        status: endpoint.status,
        subscribedEventTypes: endpoint.subscribedEventTypes,
        createdAt: endpoint.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
