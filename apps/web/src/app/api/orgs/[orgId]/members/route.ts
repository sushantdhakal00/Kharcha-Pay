import { NextResponse } from "next/server";
import { memberAddSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const members = await prisma.membership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, username: true, displayName: true, imageUrl: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        username: m.user.username,
        displayName: m.user.displayName ?? m.user.username,
        avatarUrl: m.user.imageUrl
          ? `/api/orgs/${orgId}/users/${m.userId}/avatar`
          : null,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json();
    const parsed = memberAddSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { email, role } = parsed.data;
    const emailLower = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: emailLower },
    });
    if (!existingUser) {
      return NextResponse.json(
        { error: "No user found with that email" },
        { status: 404 }
      );
    }

    const existingMembership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: existingUser.id } },
    });
    if (existingMembership) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 409 }
      );
    }

    const membership = await prisma.membership.create({
      data: {
        orgId,
        userId: existingUser.id,
        role: role as OrgRole,
      },
      include: { user: { select: { id: true, email: true, username: true } } },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "MEMBER_ADDED",
      entityType: "Membership",
      entityId: membership.id,
      after: { userId: existingUser.id, email: existingUser.email, role: membership.role },
    });

    return NextResponse.json({
      member: {
        id: membership.id,
        userId: membership.userId,
        email: membership.user.email,
        username: membership.user.username,
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
