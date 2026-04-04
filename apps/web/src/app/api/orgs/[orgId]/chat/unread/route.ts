import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { getPermsForRole } from "@/lib/chat-permissions";

/**
 * GET /api/orgs/[orgId]/chat/unread
 * Returns totalUnreadCount, perChannelUnreadCount, perChannelLastMessagePreview
 */
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
      },
      orderBy: { createdAt: "asc" },
    });

    const visible = channels.filter((ch) => {
      const perms = getPermsForRole(ch.permissions, membership.role);
      return perms.canView;
    });

    const channelIds = visible.map((c) => c.id);
    const readStates = await prisma.chatChannelReadState.findMany({
      where: { orgId, channelId: { in: channelIds }, userId: user.id },
    });
    const readByChannel = new Map(readStates.map((r) => [r.channelId, r]));

    const perChannelUnreadCount: Record<string, number> = {};
    const perChannelLastMessagePreview: Record<
      string,
      { contentText: string; createdAt: string; senderDisplayName: string } | null
    > = {};
    let totalUnreadCount = 0;

    for (const ch of visible) {
      const readState = readByChannel.get(ch.id);
      const cutoff = readState?.lastReadMessageCreatedAt ?? null;

      const [count, lastMsg] = await Promise.all([
        prisma.chatMessage.count({
          where: {
            channelId: ch.id,
            orgId,
            deletedAt: null,
            senderUserId: { not: user.id },
            ...(cutoff ? { createdAt: { gt: cutoff } } : {}),
          },
        }),
        prisma.chatMessage.findFirst({
          where: { channelId: ch.id, orgId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { sender: { select: { displayName: true, username: true } } },
        }),
      ]);

      perChannelUnreadCount[ch.id] = count;
      totalUnreadCount += count;
      perChannelLastMessagePreview[ch.id] = lastMsg
        ? {
            contentText: lastMsg.contentText.slice(0, 80) + (lastMsg.contentText.length > 80 ? "…" : ""),
            createdAt: lastMsg.createdAt.toISOString(),
            senderDisplayName: lastMsg.sender.displayName || lastMsg.sender.username || "Unknown",
          }
        : null;
    }

    return NextResponse.json({
      totalUnreadCount,
      perChannelUnreadCount,
      perChannelLastMessagePreview,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
