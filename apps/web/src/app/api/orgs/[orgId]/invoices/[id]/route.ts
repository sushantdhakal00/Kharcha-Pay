import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";

function toStr(b: bigint): string {
  return b.toString();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
      include: {
        vendor: { select: { id: true, name: true } },
        po: { select: { id: true, poNumber: true } },
        department: { select: { id: true, name: true } },
        createdBy: { select: { username: true } },
        verifiedBy: { select: { username: true } },
        lineItems: true,
        attachments: true,
        matchResults: { take: 1, orderBy: { computedAt: "desc" } },
      },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const match = inv.matchResults[0];

    const qboLink = await prisma.externalIdLink.findUnique({
      where: {
        orgId_provider_localEntityType_localEntityId: {
          orgId,
          provider: "QUICKBOOKS_ONLINE",
          localEntityType: "INVOICE",
          localEntityId: inv.id,
        },
      },
    });
    const conn = qboLink
      ? await prisma.accountingConnection.findUnique({
          where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
        })
      : null;
    const qboLinkInfo =
      qboLink && conn?.realmId && qboLink.remoteEntityType === "QBO_BILL"
        ? {
            realmId: conn.realmId,
            remoteId: qboLink.remoteEntityId,
            viewUrl: `https://app.qbo.intuit.com/app/bill?companyId=${conn.realmId}`,
          }
        : null;

    return jsonResponse({
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorId: inv.vendorId,
        vendorName: inv.vendor.name,
        type: inv.type,
        poId: inv.poId,
        poNumber: inv.po?.poNumber,
        currency: inv.currency,
        subtotalMinor: toStr(inv.subtotalMinor),
        taxMinor: toStr(inv.taxMinor),
        totalMinor: toStr(inv.totalMinor),
        status: inv.status,
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        dueAt: inv.dueAt?.toISOString() ?? null,
        submittedAt: inv.submittedAt?.toISOString() ?? null,
        verifiedAt: inv.verifiedAt?.toISOString() ?? null,
        departmentId: inv.departmentId,
        departmentName: inv.department?.name,
        costCenterId: inv.costCenterId,
        projectId: inv.projectId,
        glCode: inv.glCode,
        createdByUserId: inv.createdByUserId,
        createdByUsername: inv.createdBy.username,
        verifiedByUserId: inv.verifiedByUserId,
        verifiedByUsername: inv.verifiedBy?.username,
        createdAt: inv.createdAt.toISOString(),
        updatedAt: inv.updatedAt.toISOString(),
        lineItems: inv.lineItems.map((l) => ({
          id: l.id,
          description: l.description,
          qty: l.qty,
          unitPriceMinor: toStr(l.unitPriceMinor),
          totalMinor: toStr(l.totalMinor),
          poLineItemId: l.poLineItemId,
        })),
        attachments: inv.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt.toISOString(),
        })),
        matchResult: match
          ? {
              id: match.id,
              matchType: match.matchType,
              status: match.status,
              diffsJson: match.diffsJson,
              toleranceAppliedJson: match.toleranceAppliedJson,
              computedAt: match.computedAt.toISOString(),
            }
          : null,
        qboLink: qboLinkInfo,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
