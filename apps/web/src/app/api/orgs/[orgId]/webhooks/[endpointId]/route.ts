/**
 * PATCH /api/orgs/[orgId]/webhooks/[endpointId] - Update status/url/secret/events
 * DELETE /api/orgs/[orgId]/webhooks/[endpointId] - Delete
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
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

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  url: z.string().url().optional(),
  secret: z.string().min(16).optional(),
  subscribedEventTypes: z.array(z.enum(EVENT_TYPES)).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; endpointId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, endpointId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const ep = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, orgId } });
    if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.url) {
      const v = isValidWebhookUrl(parsed.data.url);
      if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        ...(parsed.data.status && { status: parsed.data.status }),
        ...(parsed.data.url && { url: parsed.data.url }),
        ...(parsed.data.secret && { secret: parsed.data.secret }),
        ...(parsed.data.subscribedEventTypes && { subscribedEventTypes: parsed.data.subscribedEventTypes }),
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: parsed.data.status === "DISABLED" ? "WEBHOOK_ENDPOINT_DISABLED" : "WEBHOOK_ENDPOINT_UPDATED",
      entityType: "WebhookEndpoint",
      entityId: endpointId,
      after: { status: updated.status },
    });

    return NextResponse.json({ endpoint: { id: updated.id, url: updated.url, status: updated.status, subscribedEventTypes: updated.subscribedEventTypes } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; endpointId: string }> }) {
  try {
    const user = await requireUser();
    const { orgId, endpointId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const ep = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, orgId } });
    if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.webhookEndpoint.delete({ where: { id: endpointId } });
    await logAuditEvent({ orgId, actorUserId: user.id, action: "WEBHOOK_ENDPOINT_DELETED", entityType: "WebhookEndpoint", entityId: endpointId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
