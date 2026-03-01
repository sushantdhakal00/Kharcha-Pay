import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { slugifyChannelName } from "@/lib/chat-permissions";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  topic: z.string().max(500).nullable().optional(),
  isPrivate: z.boolean().optional(),
  slowModeSeconds: z.number().int().min(0).max(300).optional(),
  isLocked: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, channelId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER, OrgRole.STAFF]);

    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (!auth.perms.canManageChannel) {
      return NextResponse.json({ error: "Forbidden: cannot manage channel" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      const name = slugifyChannelName(parsed.data.name);
      if (name) {
        const existing = await prisma.chatChannel.findUnique({
          where: { orgId_name: { orgId, name } },
        });
        if (existing && existing.id !== channelId) {
          return NextResponse.json({ error: `Channel #${name} already exists` }, { status: 409 });
        }
        updates.name = name;
      }
    }
    if (parsed.data.topic !== undefined) updates.topic = parsed.data.topic;
    if (parsed.data.isPrivate !== undefined) updates.isPrivate = parsed.data.isPrivate;
    if (parsed.data.slowModeSeconds !== undefined) updates.slowModeSeconds = parsed.data.slowModeSeconds;
    if (parsed.data.isLocked !== undefined) updates.isLocked = parsed.data.isLocked;

    const before = {
      name: auth.channel.name,
      topic: auth.channel.topic,
      isPrivate: auth.channel.isPrivate,
      slowModeSeconds: auth.channel.slowModeSeconds,
      isLocked: auth.channel.isLocked,
    };

    const updated = await prisma.chatChannel.update({
      where: { id: channelId },
      data: updates,
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "CHANNEL_UPDATED",
      entityType: "ChatChannel",
      entityId: channelId,
      before,
      after: {
        name: updated.name,
        topic: updated.topic,
        isPrivate: updated.isPrivate,
        slowModeSeconds: updated.slowModeSeconds,
        isLocked: updated.isLocked,
      },
    });

    return NextResponse.json({
      channel: {
        id: updated.id,
        name: updated.name,
        topic: updated.topic,
        isPrivate: updated.isPrivate,
        slowModeSeconds: updated.slowModeSeconds,
        isLocked: updated.isLocked,
        isArchived: updated.isArchived,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, channelId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, orgId },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Soft archive
    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { isArchived: true },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "CHANNEL_ARCHIVED",
      entityType: "ChatChannel",
      entityId: channelId,
      after: { name: channel.name },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
