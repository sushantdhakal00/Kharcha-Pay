import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";

/**
 * GET /api/orgs/[orgId]/chat/members
 * Returns members for @mentions picker (id, displayName, username). Excludes current user optionally.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const members = await prisma.membership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, username: true, displayName: true, imageUrl: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.userId,
        displayName: m.user.displayName || m.user.username || "Unknown",
        username: m.user.username,
        avatarUrl: m.user.imageUrl ? `/api/orgs/${orgId}/users/${m.userId}/avatar` : null,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
