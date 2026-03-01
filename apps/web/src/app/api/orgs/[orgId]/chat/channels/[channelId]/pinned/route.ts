import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { getChannelWithAuth } from "@/lib/chat-auth";

function getAvatarUrl(orgId: string, userId: string): string {
  return `/api/orgs/${orgId}/users/${userId}/avatar`;
}

/**
 * GET /api/orgs/[orgId]/chat/channels/[channelId]/pinned
 * Returns pinned messages with avatar, author, snippet, pinnedBy, time.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, channelId } = await params;

    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const pinned = await prisma.chatPinnedMessage.findMany({
      where: { channelId, orgId },
      orderBy: { pinnedAt: "desc" },
      include: {
        message: {
          include: {
            sender: { select: { id: true, displayName: true, username: true, imageUrl: true } },
          },
        },
      },
    });

    const valid = pinned.filter((p) => !p.message.deletedAt);

    return NextResponse.json({
      pinned: valid.map((p) => ({
        id: p.id,
        messageId: p.messageId,
        contentText: p.message.contentText.slice(0, 150) + (p.message.contentText.length > 150 ? "…" : ""),
        createdAt: p.message.createdAt.toISOString(),
        pinnedAt: p.pinnedAt.toISOString(),
        pinnedByUserId: p.pinnedByUserId,
        sender: {
          displayName: p.message.sender.displayName || p.message.sender.username || "Unknown",
          avatarUrl: p.message.sender.imageUrl ? getAvatarUrl(orgId, p.message.sender.id) : null,
        },
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
