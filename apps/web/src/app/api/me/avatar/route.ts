import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { writeFile } from "fs/promises";
import path from "path";
import { getAvatarStorageDir, getAvatarStorageDirSync } from "@/lib/avatar-storage";
import { getAllowedExtensionFromMagic } from "@/lib/receipt-upload";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

/**
 * GET /api/me/avatar - serves the current user's avatar image
 */
export async function GET() {
  try {
    const user = await requireUser();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { imageUrl: true },
    });
    if (!dbUser?.imageUrl) {
      return new NextResponse(null, { status: 404 });
    }

    // imageUrl starting with "local:" means we have an uploaded file
    const isLocal = dbUser.imageUrl.startsWith("local:");
    if (!isLocal) {
      return new NextResponse(null, { status: 404 });
    }

    const storageKey = dbUser.imageUrl.replace(/^local:/, "");
    const storageDir = getAvatarStorageDirSync();
    const filePath = path.join(storageDir, storageKey);

    if (
      !path.resolve(filePath).startsWith(path.resolve(storageDir)) ||
      !existsSync(filePath)
    ) {
      return new NextResponse(null, { status: 404 });
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
    return NextResponse.json(
      { error: "Avatar unavailable" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/me/avatar - upload a new avatar image
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_AVATAR_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeExt = getAllowedExtensionFromMagic(buffer);
    if (!safeExt || !IMAGE_EXTENSIONS.includes(safeExt as (typeof IMAGE_EXTENSIONS)[number])) {
      return NextResponse.json(
        { error: "Invalid image (allowed: JPEG, PNG, WebP)" },
        { status: 400 }
      );
    }

    const uploadDir = await getAvatarStorageDir();
    const storageKey = `${user.id}${safeExt}`;
    const filePath = path.join(uploadDir, storageKey);
    await writeFile(filePath, buffer);

    await prisma.user.update({
      where: { id: user.id },
      data: { imageUrl: `local:${storageKey}`, avatarUpdatedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
