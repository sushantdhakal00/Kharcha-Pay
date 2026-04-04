/**
 * POST /api/orgs/[orgId]/accounting/quickbooks/mappings
 * Create or update GL code mapping. Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await requireUser();
  await requireCsrf(req);
  const { orgId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const body = await req.json().catch(() => ({}));
  const localType = (body.localType as string) || "GL_CODE";
  const localId = body.localId as string;
  const remoteType = (body.remoteType as string) || "QBO_ACCOUNT";
  const remoteId = body.remoteId as string;
  const remoteName = body.remoteName as string | undefined;

  if (!localId || !remoteId) {
    return NextResponse.json({ error: "localId and remoteId required" }, { status: 400 });
  }

  const mapping = await prisma.accountingMapping.upsert({
    where: {
      orgId_provider_localType_localId: {
        orgId,
        provider: "QUICKBOOKS_ONLINE",
        localType: localType as "GL_CODE",
        localId,
      },
    },
    create: {
      orgId,
      provider: "QUICKBOOKS_ONLINE",
      localType: localType as "GL_CODE",
      localId,
      remoteType: remoteType as "QBO_ACCOUNT",
      remoteId,
      remoteName: remoteName ?? null,
    },
    update: { remoteId, remoteName: remoteName ?? undefined },
  });
  return NextResponse.json({ mapping });
}
