import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";

const permSchema = z.object({
  role: z.enum(["ADMIN", "APPROVER", "STAFF", "AUDITOR"]),
  canView: z.boolean(),
  canSend: z.boolean(),
  canManageChannel: z.boolean(),
  canManageMessages: z.boolean(),
  canPin: z.boolean(),
  canUpload: z.boolean(),
});

const putSchema = z.object({
  permissions: z.array(permSchema),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, channelId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, orgId },
      include: { permissions: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const before = channel.permissions.map((p) => ({
      role: p.role,
      canView: p.canView,
      canSend: p.canSend,
      canManageChannel: p.canManageChannel,
      canManageMessages: p.canManageMessages,
      canPin: p.canPin,
      canUpload: p.canUpload,
    }));

    for (const perm of parsed.data.permissions) {
      await prisma.chatChannelPermission.upsert({
        where: {
          channelId_role: { channelId, role: perm.role as OrgRole },
        },
        create: {
          orgId,
          channelId,
          role: perm.role as OrgRole,
          canView: perm.canView,
          canSend: perm.canSend,
          canManageChannel: perm.canManageChannel,
          canManageMessages: perm.canManageMessages,
          canPin: perm.canPin,
          canUpload: perm.canUpload,
        },
        update: {
          canView: perm.canView,
          canSend: perm.canSend,
          canManageChannel: perm.canManageChannel,
          canManageMessages: perm.canManageMessages,
          canPin: perm.canPin,
          canUpload: perm.canUpload,
        },
      });
    }

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "CHANNEL_PERMISSIONS_UPDATED",
      entityType: "ChatChannel",
      entityId: channelId,
      before: { permissions: before },
      after: { permissions: parsed.data.permissions },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
