import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { OrgRole } from "@prisma/client";

function toStr(b: bigint): string {
  return b.toString();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const p = await prisma.orgPolicy.findUnique({
      where: { orgId },
    });

    return jsonResponse({
      policy: p
        ? {
            requirePoAboveAmountMinor: toStr(p.requirePoAboveAmountMinor),
            requireAttachmentOnSubmit: p.requireAttachmentOnSubmit,
            allowApproverOverrideOnMismatch: p.allowApproverOverrideOnMismatch,
            highValueThresholdMinor: toStr(p.highValueThresholdMinor),
          }
        : {
            requirePoAboveAmountMinor: "0",
            requireAttachmentOnSubmit: true,
            allowApproverOverrideOnMismatch: true,
            highValueThresholdMinor: "1000000",
          },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const requirePoAboveAmountMinor = BigInt(body.requirePoAboveAmountMinor ?? 0);
    const requireAttachmentOnSubmit = body.requireAttachmentOnSubmit !== false;
    const allowApproverOverrideOnMismatch = body.allowApproverOverrideOnMismatch !== false;
    const highValueThresholdMinor = BigInt(body.highValueThresholdMinor ?? 1000000);

    await prisma.orgPolicy.upsert({
      where: { orgId },
      create: {
        orgId,
        requirePoAboveAmountMinor,
        requireAttachmentOnSubmit,
        allowApproverOverrideOnMismatch,
        highValueThresholdMinor,
      },
      update: {
        requirePoAboveAmountMinor,
        requireAttachmentOnSubmit,
        allowApproverOverrideOnMismatch,
        highValueThresholdMinor,
      },
    });

    return jsonResponse({
      policy: {
        requirePoAboveAmountMinor: requirePoAboveAmountMinor.toString(),
        requireAttachmentOnSubmit,
        allowApproverOverrideOnMismatch,
        highValueThresholdMinor: highValueThresholdMinor.toString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
