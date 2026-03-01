import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { getChannelWithAuth } from "@/lib/chat-auth";
import { Prisma } from "@prisma/client";

const SEARCH_LIMIT = 50;

/**
 * GET /api/orgs/[orgId]/chat/channels/[channelId]/search?q=...
 * Postgres FTS when search_tsv exists; fallback to ILIKE.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; channelId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, channelId } = await params;

    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!q || q.length < 2) {
      return NextResponse.json({ messages: [] });
    }

    let messages: { id: string; contentText: string; createdAt: Date; senderDisplayName: string }[];

    try {
      const results = await prisma.$queryRaw<
        { id: string; content_text: string; created_at: Date; sender_display_name: string }[]
      >(Prisma.sql`
        SELECT m.id, m."contentText" as content_text, m."createdAt" as created_at,
          COALESCE(u."displayName", u.username, 'Unknown') as sender_display_name
        FROM "ChatMessage" m
        JOIN "User" u ON u.id = m."senderUserId"
        WHERE m."channelId" = ${channelId}
          AND m."orgId" = ${orgId}
          AND m."deletedAt" IS NULL
          AND m.search_tsv @@ plainto_tsquery('english', ${q})
        ORDER BY ts_rank_cd(m.search_tsv, plainto_tsquery('english', ${q})) DESC
        LIMIT ${SEARCH_LIMIT}
      `);
      messages = results.map((r) => ({
        id: r.id,
        contentText: r.content_text,
        createdAt: r.created_at,
        senderDisplayName: r.sender_display_name,
      }));
    } catch (ftsErr) {
      const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escaped}%`;
      const fallback = await prisma.chatMessage.findMany({
        where: {
          channelId,
          orgId,
          deletedAt: null,
          contentText: { contains: pattern, mode: "insensitive" },
        },
        orderBy: { createdAt: "desc" },
        take: SEARCH_LIMIT,
        include: { sender: { select: { displayName: true, username: true } } },
      });
      messages = fallback.map((m) => ({
        id: m.id,
        contentText: m.contentText,
        createdAt: m.createdAt,
        senderDisplayName: m.sender.displayName || m.sender.username || "Unknown",
      }));
    }

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        contentText: m.contentText.slice(0, 200) + (m.contentText.length > 200 ? "…" : ""),
        createdAt: m.createdAt.toISOString(),
        senderDisplayName: m.senderDisplayName,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
