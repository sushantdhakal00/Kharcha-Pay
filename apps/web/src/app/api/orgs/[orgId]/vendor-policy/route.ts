import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { OrgRole } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const p = await prisma.orgVendorPolicy.findUnique({
      where: { orgId },
    });

    return jsonResponse({
      policy: p ?? {
        requireDualApprovalForBankChanges: true,
        requireVendorDocsBeforeActivation: true,
        allowApproverToActivateVendor: true,
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
    const requireDualApprovalForBankChanges = body.requireDualApprovalForBankChanges !== false;
    const requireVendorDocsBeforeActivation = body.requireVendorDocsBeforeActivation !== false;
    const allowApproverToActivateVendor = body.allowApproverToActivateVendor !== false;

    await prisma.orgVendorPolicy.upsert({
      where: { orgId },
      create: {
        orgId,
        requireDualApprovalForBankChanges,
        requireVendorDocsBeforeActivation,
        allowApproverToActivateVendor,
      },
      update: {
        requireDualApprovalForBankChanges,
        requireVendorDocsBeforeActivation,
        allowApproverToActivateVendor,
      },
    });

    return jsonResponse({
      policy: {
        requireDualApprovalForBankChanges,
        requireVendorDocsBeforeActivation,
        allowApproverToActivateVendor,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
