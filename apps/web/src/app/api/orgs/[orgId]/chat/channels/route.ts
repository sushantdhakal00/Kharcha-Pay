import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { slugifyChannelName, getPermsForRole } from "@/lib/chat-permissions";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  topic: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
  slowModeSeconds: z.number().int().min(0).max(300).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    const membership = await requireOrgReadAccess(orgId, user.id);

    const channels = await prisma.chatChannel.findMany({
      where: { orgId, isArchived: false },
      include: {
        permissions: true,
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const visible = channels.filter((ch) => {
      const perms = getPermsForRole(ch.permissions, membership.role);
      return perms.canView;
    });

    return NextResponse.json({
      channels: visible.map((ch) => {
        const perms = getPermsForRole(ch.permissions, membership.role);
        return {
          id: ch.id,
          name: ch.name,
          topic: ch.topic,
          isPrivate: ch.isPrivate,
          slowModeSeconds: ch.slowModeSeconds,
          isLocked: ch.isLocked,
          isArchived: ch.isArchived,
          messageCount: ch._count.messages,
          createdAt: ch.createdAt.toISOString(),
          canPin: perms.canPin,
          canManageMessages: perms.canManageMessages,
          canUpload: perms.canUpload,
        };
      }),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const name = slugifyChannelName(parsed.data.name);
    if (!name) {
      return NextResponse.json(
        { error: "Channel name must contain at least one letter or number" },
        { status: 400 }
      );
    }

    const existing = await prisma.chatChannel.findUnique({
      where: { orgId_name: { orgId, name } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Channel #${name} already exists` },
        { status: 409 }
      );
    }

    const channel = await prisma.$transaction(async (tx) => {
      const ch = await tx.chatChannel.create({
        data: {
          orgId,
          name,
          topic: parsed.data.topic ?? null,
          isPrivate: parsed.data.isPrivate ?? false,
          slowModeSeconds: parsed.data.slowModeSeconds ?? 0,
          createdByUserId: user.id,
        },
      });
      // Default permissions: #general-like for all roles
      const roles: OrgRole[] = [OrgRole.ADMIN, OrgRole.APPROVER, OrgRole.STAFF, OrgRole.AUDITOR];
      for (const role of roles) {
        await tx.chatChannelPermission.create({
          data: {
            orgId,
            channelId: ch.id,
            role,
            canView: true,
            canSend: true,
            canManageChannel: role === OrgRole.ADMIN,
            canManageMessages: role === OrgRole.ADMIN || role === OrgRole.APPROVER,
            canPin: role === OrgRole.ADMIN || role === OrgRole.APPROVER,
            canUpload: true,
          },
        });
      }
      return ch;
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "CHANNEL_CREATED",
      entityType: "ChatChannel",
      entityId: channel.id,
      after: { name: channel.name, topic: channel.topic, isPrivate: channel.isPrivate },
    });

    return NextResponse.json({
      channel: {
        id: channel.id,
        name: channel.name,
        topic: channel.topic,
        isPrivate: channel.isPrivate,
        slowModeSeconds: channel.slowModeSeconds,
        isLocked: channel.isLocked,
        isArchived: channel.isArchived,
        createdAt: channel.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
