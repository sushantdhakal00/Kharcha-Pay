/**
 * Chat auth: resolve channel with role-based permissions
 */
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPermsForRole } from "@/lib/chat-permissions";

export type ChannelPerms = {
  canView: boolean;
  canSend: boolean;
  canManageChannel: boolean;
  canManageMessages: boolean;
  canPin: boolean;
  canUpload: boolean;
};

export async function getChannelWithAuth(
  orgId: string,
  channelId: string,
  userId: string
): Promise<
  | { channel: { id: string; orgId: string; name: string; topic: string | null; isPrivate: boolean; slowModeSeconds: number; isLocked: boolean; isArchived: boolean }; membership: { role: OrgRole }; perms: ChannelPerms }
  | null
> {
  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, orgId },
    include: { permissions: true },
  });
  if (!channel) return null;

  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership) return null;

  const perms = getPermsForRole(channel.permissions, membership.role);
  if (!perms.canView) return null;

  return {
    channel: {
      id: channel.id,
      orgId: channel.orgId,
      name: channel.name,
      topic: channel.topic,
      isPrivate: channel.isPrivate,
      slowModeSeconds: channel.slowModeSeconds,
      isLocked: channel.isLocked,
      isArchived: channel.isArchived,
    },
    membership: { role: membership.role },
    perms,
  };
}
