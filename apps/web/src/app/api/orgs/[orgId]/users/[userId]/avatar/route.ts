import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { getAvatarStorageDirSync } from "@/lib/avatar-storage";

/**
 * GET /api/orgs/[orgId]/users/[userId]/avatar
 * Serves avatar for a user - org-scoped (both users must be in same org)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; userId: string }> }
) {
  try {
    const me = await requireUser();
    const { orgId, userId } = await params;

    await requireOrgReadAccess(orgId, me.id);

    const targetMembership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!targetMembership) {
      return NextResponse.json({ error: "User not in org" }, { status: 403 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { imageUrl: true },
    });
    if (!dbUser?.imageUrl) {
      return NextResponse.json(null, { status: 404 });
    }

    const isLocal = dbUser.imageUrl.startsWith("local:");
    if (!isLocal) {
      return NextResponse.json(null, { status: 404 });
    }

    const storageKey = dbUser.imageUrl.replace(/^local:/, "");
    const storageDir = getAvatarStorageDirSync();
    const filePath = path.join(storageDir, storageKey);

    if (
      !path.resolve(filePath).startsWith(path.resolve(storageDir)) ||
      !existsSync(filePath)
    ) {
      return NextResponse.json(null, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const ext = path.extname(storageKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Avatar unavailable" }, { status: 500 });
  }
}
