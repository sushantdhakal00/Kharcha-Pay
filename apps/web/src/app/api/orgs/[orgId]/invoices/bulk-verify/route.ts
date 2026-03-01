import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { InvoiceStatus } from "@prisma/client";
import { OrgRole } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: ids },
        orgId,
        status: { in: [InvoiceStatus.NEEDS_VERIFICATION, InvoiceStatus.EXCEPTION] },
      },
      include: {
        matchResults: { take: 1, orderBy: { computedAt: "desc" } },
      },
    });

    const now = new Date();
    const toVerify: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const inv of invoices) {
      const match = inv.matchResults[0];
      if (!inv.glCode) {
        skipped.push({ id: inv.id, reason: "Missing GL code" });
        continue;
      }
      if (match && match.status !== "MATCHED") {
        skipped.push({ id: inv.id, reason: `Match status: ${match.status}` });
        continue;
      }
      toVerify.push(inv.id);
    }

    if (toVerify.length > 0) {
      await prisma.invoice.updateMany({
        where: { id: { in: toVerify } },
        data: {
          status: InvoiceStatus.VERIFIED,
          verifiedByUserId: user.id,
          verifiedAt: now,
        },
      });

      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "INVOICE_BULK_VERIFIED",
        entityType: "Invoice",
        entityId: toVerify[0],
        metadata: { count: toVerify.length, invoiceIds: toVerify },
      });
    }

    return NextResponse.json({
      ok: true,
      verified: toVerify.length,
      skipped,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
